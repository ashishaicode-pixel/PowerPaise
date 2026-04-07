#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_task_wdt.h>
#include <math.h>

// ========== CONFIG ==========
const char* WIFI_SSID     = "realme C55 7824";
const char* WIFI_PASSWORD = "sspu2626";

const char* SUPABASE_URL  = "https://yfbpuqwotfjpjiakncmf.supabase.co";
const char* SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYnB1cXdvdGZqcGppYWtuY21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg5NjgsImV4cCI6MjA5MDUyNDk2OH0.Jrid3VVf4Hf5mwoFiu-F8nvGiD_FeELVUvgW6Q4qUr0";
const char* TABLE_NAME    = "power_data";

#define CT_PIN      34
#define LED_PIN     2
#define SAMPLES     1000   // BUG FIX: was 400 — need 1000 for accurate 50Hz RMS
#define VOLTAGE_AC  230.0

// ════════════ CALIBRATION ════════════════════════════════════════
// YOUR HARDWARE SITUATION: ADC AVG = 4094 (signal biased at 3.3V)
// getRMS() detects this and compensates automatically.
//
// After upload, turn on a known appliance and check:
//   If Serial shows 3.0A but real load is 1.5A  → set 1000.0
//   If Serial shows 1.0A but real load is 3.0A  → set 6000.0
//   Formula: NEW = CALIBRATION × (real_amps / shown_amps)
//
//   Start value: 2000 (for SCT-013-000 with 33Ω burden)
//                1000 (for SCT-013-030/020/010 with built-in burden)
#define CALIBRATION 2000.0
// ════════════════════════════════════════════════════════════════

// BUG FIX: was 0.12A (= 27.6W) — too high, killed real readings
// New: 5W minimum — filters noise but catches real appliances
#define MIN_WATTS   5.0

float         energyKWh      = 0.0;
bool          deviceIsOn     = false;
unsigned long lastUploadTime = 0;
unsigned long lastEnergyTime = 0;
unsigned long lastWifiCheck  = 0;
bool          wifiOK         = false;
bool          supabaseOK     = false;
bool          wasDeviceOn    = false;

// ════════════════════════════════════════════════════════════════
//  getRMS() — FIXED VERSION
//
//  3 bugs fixed from old code:
//  ✅ FIX 1: Removed (maxVal-minVal) < 80 guard
//            At 1A with correct calibration, swing is only ~29 counts
//            This guard was ALWAYS returning 0 for normal loads
//
//  ✅ FIX 2: CALIBRATION changed from 30 → 2000
//            Old: at 5A → computed 0.075A → zeroed by threshold
//            New: at 5A → computed 5.0A → correct
//
//  ✅ FIX 3: Auto-detects top-clipped signal (your hardware: AVG=4094)
//            Your signal rides at 3.3V so positive swings clip at 4095.
//            Fix: use (4095-raw) as deviation, multiply by √2 to
//            recover the missing half of the AC waveform.
// ════════════════════════════════════════════════════════════════
float getRMS() {
  // Step 1: Find ADC average (detects which bias mode you're in)
  long total = 0;
  for (int i = 0; i < 500; i++) {
    total += analogRead(CT_PIN);
    delayMicroseconds(100);
  }
  int midpoint = (int)(total / 500);

  // Step 2: Collect 1000 samples for accurate RMS
  double sumSq  = 0.0;
  int    maxVal = 0;
  int    minVal = 4095;

  for (int i = 0; i < SAMPLES; i++) {
    int    raw = analogRead(CT_PIN);
    double dev;

    if (midpoint > 3500) {
      // ── TOP-CLIPPED MODE (your hardware right now)
      // Signal is stuck near 3.3V, only swings downward.
      // Measure how far below 4095 each sample reaches.
      // Multiply by √2 later to compensate for missing half-wave.
      dev = (double)(4095 - raw);
    } else if (midpoint < 600) {
      // ── BOTTOM-CLIPPED MODE
      // Signal near 0V, only swings upward.
      dev = (double)raw;
    } else {
      // ── CENTERED MODE (add 10kΩ from GPIO34 to GND to reach here)
      // Signal properly centered at ~1.65V. Best accuracy.
      dev = (double)(raw - midpoint);
    }

    if (raw > maxVal) maxVal = raw;
    if (raw < minVal) minVal = raw;
    sumSq += dev * dev;
    delayMicroseconds(200);
  }

  // Step 3: Compute RMS and convert to current
  float rmsADC  = (float)sqrt(sumSq / SAMPLES);
  float voltRMS = (rmsADC / 4095.0f) * 3.3f;

  // Apply √2 compensation for half-wave clipped signals
  if (midpoint > 3500 || midpoint < 600) {
    voltRMS *= 1.41421356f;  // Recover the missing half
  }

  float current = (voltRMS / 33.0f) * (float)CALIBRATION;

  // Step 4: Print raw debug info every reading
  Serial.printf("  [DBG] avg=%d  swing=%d  rmsADC=%.1f  voltRMS=%.5fV  cur=%.4fA\n",
    midpoint, maxVal - minVal, rmsADC, voltRMS, current);

  // Step 5: Safety checks
  if (isnan(current) || isinf(current) || current > 100.0f) return 0.0f;

  // BUG FIX: old code used current < 0.12 (= 27.6W) — too high
  // New: check in watts, 5W minimum
  if ((current * VOLTAGE_AC) < MIN_WATTS) return 0.0f;

  return current;
}

// ════════════════════════════════════════════════════════════════
//  hardwareCheck() — runs at boot to verify CT + wiring
// ════════════════════════════════════════════════════════════════
void hardwareCheck() {
  Serial.println("\n======== HARDWARE SELF-TEST ========");
  Serial.println("Reading GPIO 34 (CT sensor pin)...");
  Serial.println("Please keep appliance OFF for 3 seconds");
  delay(3000);

  long sum = 0;
  int  mn  = 4095, mx = 0;
  for (int i = 0; i < 1000; i++) {
    int v = analogRead(CT_PIN);
    sum += v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    delayMicroseconds(200);
  }
  int avg   = (int)(sum / 1000);
  int swing = mx - mn;
  float voltage = avg * (3.3f / 4095.0f);

  Serial.printf("  ADC Average  : %d (%.3f V)\n", avg, voltage);
  Serial.printf("  ADC Swing    : %d counts (noise with no load)\n", swing);

  // Diagnose
  Serial.println("\n  ── DIAGNOSIS ──");
  if (avg < 100) {
    Serial.println("  ❌ WIRING ERROR: ADC reads near 0V");
    Serial.println("     Check: Is CT sensor connected to GPIO 34?");
    Serial.println("     Check: Is the 33Ω resistor connected?");
    Serial.println("     Add: 10kΩ from GPIO34 to 3.3V (bias up)");
  } else if (avg > 3900) {
    Serial.println("  ⚠ SIGNAL TOP-CLIPPED: ADC reads near 3.3V");
    Serial.println("     CT sensor IS working but bias is wrong.");
    Serial.println("     Fix: Add 10kΩ from GPIO34 to GND");
    Serial.println("     For now: code compensates in software ✓");
  } else if (avg > 1500 && avg < 2600) {
    Serial.println("  ✅ WIRING CORRECT: ADC centered at ~1.65V");
    Serial.println("     Both bias resistors working. Best accuracy.");
  } else {
    Serial.printf("  ⚠ BIAS UNBALANCED: AVG=%d (expected 1800–2200)\n", avg);
    Serial.println("     Check: Are both 10kΩ resistors equal value?");
  }

  if (swing < 5) {
    Serial.println("  ✅ No-load noise: OK (swing < 5 is ideal)");
  } else if (swing < 30) {
    Serial.println("  ✅ No-load noise: normal level");
  } else {
    Serial.printf("  ⚠ High noise at no-load: swing=%d — check wiring\n", swing);
  }

  Serial.println("\n  Now turn ON your appliance...");
  delay(3000);

  sum = 0; mn = 4095; mx = 0;
  for (int i = 0; i < 1000; i++) {
    int v = analogRead(CT_PIN);
    sum += v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    delayMicroseconds(200);
  }
  int avg2   = (int)(sum / 1000);
  int swing2 = mx - mn;

  Serial.printf("  ADC Swing (load ON): %d counts\n", swing2);

  if (swing2 > swing + 20) {
    Serial.println("  ✅ CT SENSOR WORKING: Signal increases with load!");
    Serial.println("     CT sensor detects current correctly.");
    Serial.printf("     Signal change: %d → %d counts\n", swing, swing2);
  } else {
    Serial.println("  ❌ CT SENSOR NOT DETECTING LOAD:");
    Serial.println("     Possible causes:");
    Serial.println("     1. CT clamp around BOTH wires → fields cancel → 0");
    Serial.println("        Fix: Clamp around ONE wire only (Live or Neutral)");
    Serial.println("     2. The wire CT is on has no current (wrong circuit)");
    Serial.println("     3. CT jack not fully plugged in");
    Serial.println("     4. CT sensor broken");
  }
  Serial.println("====================================\n");
}

// ════════════════════════════════════════════════════════════════
//  WiFi functions (same as original)
// ════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.println("-----------------------------");
  Serial.print("WiFi: Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.disconnect(true);
  delay(500);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // ADDED: prevents random disconnects
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    digitalWrite(LED_PIN, HIGH);
    Serial.println();
    Serial.println("WiFi : CONNECTED");
    Serial.println("IP   : " + WiFi.localIP().toString());
    Serial.println("RSSI : " + String(WiFi.RSSI()) + " dBm");
  } else {
    wifiOK = false;
    digitalWrite(LED_PIN, LOW);
    Serial.println();
    Serial.println("WiFi : FAILED — offline mode");
  }
  Serial.println("-----------------------------");
}

void checkWiFi() {
  if (WiFi.status() == WL_CONNECTED) { wifiOK = true; return; }
  wifiOK = false;
  supabaseOK = false;
  Serial.print("WiFi lost — reconnecting");
  WiFi.disconnect();
  delay(500);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 15) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    digitalWrite(LED_PIN, HIGH);
    Serial.println("\nWiFi back!");
  } else {
    Serial.println("\nStill offline.");
  }
}

// ════════════════════════════════════════════════════════════════
//  Supabase functions (same as original)
// ════════════════════════════════════════════════════════════════
int supabaseInsert(String jsonData) {
  if (!wifiOK) return -1;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/" + String(TABLE_NAME));
  http.setTimeout(10000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
  http.addHeader("Prefer",        "return=minimal");
  int code = http.POST(jsonData);
  if (code != 200 && code != 201)
    Serial.println("Supabase error: " + http.getString().substring(0, 150));
  http.end();
  return code;
}

void testSupabase() {
  Serial.print("Supabase: Testing... ");
  String testJson = "{";
  testJson += "\"current_a\":0.0,";
  testJson += "\"power_w\":0.0,";
  testJson += "\"energy_kwh\":0.0,";
  testJson += "\"cost_rs\":0.0,";
  testJson += "\"status\":\"BOOT\",";
  testJson += "\"device_on\":false,";
  testJson += "\"rssi\":" + String(WiFi.RSSI());
  testJson += "}";
  int code = supabaseInsert(testJson);
  if (code == 200 || code == 201) { supabaseOK = true; Serial.println("CONNECTED"); }
  else { supabaseOK = false; Serial.println("FAILED — HTTP " + String(code)); }
}

void uploadData(float current, float power, float kwh, bool isOn) {
  if (!wifiOK) { Serial.println("Upload skip — no WiFi"); return; }

  float costTotal  = kwh * 8.0;          // Total ₹ spent today
  float costPerHr  = (power / 1000.0) * 8.0; // ₹ per hour right now

  String json = "{";
  json += "\"current_a\":"  + String(current, 4) + ",";
  json += "\"power_w\":"    + String(power,   2) + ",";
  json += "\"energy_kwh\":" + String(kwh,     5) + ",";
  json += "\"cost_rs\":"    + String(costTotal,4) + ",";  // total cost
  json += "\"status\":\""   + String(isOn ? "ON" : "OFF") + "\",";
  json += "\"device_on\":"  + String(isOn ? "true" : "false") + ",";
  json += "\"rssi\":"       + String(WiFi.RSSI());
  json += "}";

  Serial.print("Uploading... ");
  int code = supabaseInsert(json);
  if (code == 200 || code == 201) {
    supabaseOK = true;
    Serial.println("OK — " + String(power, 1) + "W / " + String(kwh, 4) + " kWh / Rs." + String(costTotal, 2));
    digitalWrite(LED_PIN, LOW);
    delay(80);
    digitalWrite(LED_PIN, HIGH);
  } else {
    supabaseOK = false;
    Serial.println("FAILED — HTTP " + String(code));
  }
}

// ════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  esp_task_wdt_deinit();
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("\n================================");
  Serial.println("   PowerPaise Energy Monitor");
  Serial.println("   Fixed Build — v3.1");
  Serial.println("================================");
  Serial.printf( "   Calibration : %.1f\n", (float)CALIBRATION);
  Serial.printf( "   Min watts   : %.1f W\n", MIN_WATTS);
  Serial.println("================================");

  // ── Hardware self-test (runs once at boot) ──
  hardwareCheck();

  connectWiFi();
  if (wifiOK) testSupabase();

  lastEnergyTime = 0;
  lastUploadTime = millis();
  lastWifiCheck  = millis();
  wasDeviceOn    = false;

  Serial.println("\nReady — Measuring every 3s\n");
}

// ════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // WiFi check every 30 seconds
  if (now - lastWifiCheck > 30000) {
    checkWiFi();
    lastWifiCheck = now;
  }

  // ── CT sensor reading (FIXED getRMS) ──
  float current = getRMS();
  deviceIsOn    = (current > 0.0f);
  float power   = deviceIsOn ? (current * VOLTAGE_AC) : 0.0f;

  // ── Energy accumulation (same as original, correct logic) ──
  if (deviceIsOn && wasDeviceOn && lastEnergyTime > 0) {
    float hours = (now - lastEnergyTime) / 3600000.0f;
    energyKWh  += (power / 1000.0f) * hours;
  }
  if (deviceIsOn) lastEnergyTime = now;
  wasDeviceOn = deviceIsOn;

  float costPerHour = (power / 1000.0f) * 8.0f;
  float costTotal   = energyKWh * 8.0f;

  // ── Serial output ──
  Serial.println("================================");
  Serial.println("WiFi     : " + String(wifiOK ? "CONNECTED (" + String(WiFi.RSSI()) + " dBm)" : "OFFLINE"));
  Serial.println("Supabase : " + String(supabaseOK ? "CONNECTED" : "OFFLINE"));
  Serial.println("--------------------------------");
  Serial.print("Current  : "); Serial.print(current, 3);   Serial.println(" A");
  Serial.print("Power    : "); Serial.print(power, 1);     Serial.println(" W");
  Serial.print("Energy   : "); Serial.print(energyKWh, 5); Serial.println(" kWh");
  Serial.print("Cost/hr  : Rs."); Serial.println(costPerHour, 2);
  Serial.print("Total Rs : Rs."); Serial.println(costTotal, 4);
  Serial.print("Status   : "); Serial.println(deviceIsOn ? "ON  ✓" : "OFF");
  Serial.println("================================\n");

  // Upload every 5 seconds
  if (wifiOK && (now - lastUploadTime >= 5000)) {
    uploadData(current, power, energyKWh, deviceIsOn);
    lastUploadTime = now;
  }

  delay(3000);
}
