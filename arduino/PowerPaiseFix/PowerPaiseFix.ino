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
#define SAMPLES     1000      // FIX: was 400 — 1000 gives 25 full 50Hz cycles = accurate RMS
#define VOLTAGE_AC  230.0

// ─── CALIBRATION — PICK YOUR SENSOR ────────────────────────────────────────
// SCT-013-000  (bare output, needs 33Ω burden you added)  → use 2000.0
// SCT-013-030  (3.5mm jack, 30A  max, built-in burden)    → use 1000.0
// SCT-013-020  (3.5mm jack, 20A  max, built-in burden)    → use 1000.0
// SCT-013-010  (3.5mm jack, 10A  max, built-in burden)    → use 1000.0
// If unsure: start with 1000.0, measure a known load (e.g. a 100W bulb),
// then adjust: CALIBRATION = CALIBRATION × (actual_current / measured_current)
#define CALIBRATION 1000.0    // FIX: was 30.0 — 30 is ~67x too small!
// ────────────────────────────────────────────────────────────────────────────

// ─── THRESHOLDS ─────────────────────────────────────────────────────────────
// FIX: was 0.12A (= 27.6W minimum) — way too high, killed small loads
//      New: 0.05A (= 11.5W minimum) — still filters noise but detects real loads
#define CURRENT_THRESHOLD  0.05   // Amps — below this = treat as OFF
// ────────────────────────────────────────────────────────────────────────────

float         energyKWh      = 0.0;
bool          deviceIsOn     = false;
unsigned long lastUploadTime = 0;
unsigned long lastEnergyTime = 0;
unsigned long lastWifiCheck  = 0;
bool          wifiOK         = false;
bool          supabaseOK     = false;
bool          wasDeviceOn    = false;

// ════════════════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.println("-----------------------------");
  Serial.print("WiFi: Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.disconnect(true);
  delay(500);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);           // FIX: disable power-save → no random drops
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

int supabaseInsert(String jsonData) {
  if (!wifiOK) return -1;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/" + String(TABLE_NAME);

  http.begin(client, url);
  http.setTimeout(10000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
  http.addHeader("Prefer",        "return=minimal");

  int code = http.POST(jsonData);
  if (code != 200 && code != 201) {
    String response = http.getString();
    Serial.println("Supabase response: " + response.substring(0, 200));
  }
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
  if (code == 200 || code == 201) {
    supabaseOK = true;
    Serial.println("CONNECTED");
  } else {
    supabaseOK = false;
    Serial.println("FAILED — HTTP " + String(code));
    Serial.println("Check: table 'power_data' exists, RLS disabled, anon key correct");
  }
}

void uploadData(float current, float power, float kwh, bool isOn) {
  if (!wifiOK) { Serial.println("Upload skip — no WiFi"); return; }

  float cost = (power / 1000.0) * 8.0;
  String json = "{";
  json += "\"current_a\":"  + String(current, 3) + ",";
  json += "\"power_w\":"    + String(power,   1) + ",";
  json += "\"energy_kwh\":" + String(kwh,     5) + ",";
  json += "\"cost_rs\":"    + String(cost,    4) + ",";
  json += "\"status\":\""   + String(isOn ? "ON" : "OFF") + "\",";
  json += "\"device_on\":"  + String(isOn ? "true" : "false") + ",";
  json += "\"rssi\":"       + String(WiFi.RSSI());
  json += "}";

  Serial.print("Uploading → ");
  int code = supabaseInsert(json);
  if (code == 200 || code == 201) {
    supabaseOK = true;
    Serial.println("OK (" + String(code) + ")");
    digitalWrite(LED_PIN, LOW);  delay(80);  digitalWrite(LED_PIN, HIGH);
  } else {
    supabaseOK = false;
    Serial.println("FAILED — HTTP " + String(code));
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  getRMS() — True RMS current measurement
//
//  FIXES applied:
//  1. Midpoint now uses 1000 samples (was 200) → more accurate DC bias
//  2. REMOVED the (maxVal - minVal) < 80 guard — THIS WAS THE MAIN BUG.
//     At small loads the ADC swing is naturally < 80 counts, so it always
//     returned 0.  Example: at 1A with correct CALIBRATION, swing ≈ 29 counts.
//  3. CALIBRATION corrected from 30 to 1000 — see comment at top of file
//  4. Current threshold lowered from 0.12 to CURRENT_THRESHOLD (0.05A)
// ════════════════════════════════════════════════════════════════════════════
float getRMS() {
  // ── Step 1: Find DC midpoint (bias from voltage divider)
  //    Use 1000 samples for accuracy — was 200 (not enough for 50Hz)
  long midSum = 0;
  const int MID_SAMPLES = 1000;
  for (int i = 0; i < MID_SAMPLES; i++) {
    midSum += analogRead(CT_PIN);
    delayMicroseconds(100);
  }
  int midpoint = (int)(midSum / MID_SAMPLES);

  // ── Step 2: Compute true RMS
  double sumSq = 0.0;
  int    rawMin = 4095, rawMax = 0;

  for (int i = 0; i < SAMPLES; i++) {
    int raw = analogRead(CT_PIN);
    if (raw > rawMax) rawMax = raw;
    if (raw < rawMin) rawMin = raw;
    long adj = raw - midpoint;
    sumSq += (double)adj * (double)adj;
    delayMicroseconds(200);
  }

  // ── Step 3: Convert ADC RMS → Amps
  double rmsADC   = sqrt(sumSq / SAMPLES);
  double voltRMS  = (rmsADC / 4095.0) * 3.3;
  double current  = (voltRMS / 33.0) * CALIBRATION;  // CALIBRATION = 1000 (was 30)

  // ── Step 4: Debug output every reading — helps diagnose issues
  Serial.printf("  [DBG] mid=%d swing=%d rmsADC=%.2f voltRMS=%.5fV current=%.4fA\n",
    midpoint, rawMax - rawMin, (float)rmsADC, (float)voltRMS, (float)current);

  // ── Step 5: Safety checks
  if (isnan(current) || isinf(current) || current > 100.0) return 0.0;

  // ── Step 6: Noise floor threshold (FIX: was 0.12A = 27.6W — too high)
  if (current < CURRENT_THRESHOLD) return 0.0;

  return (float)current;
}

// ════════════════════════════════════════════════════════════════════════════
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
  Serial.println("   v2.1 — Fixed Build");
  Serial.println("================================");
  Serial.printf("   CALIBRATION     = %.1f\n", (float)CALIBRATION);
  Serial.printf("   CURRENT_MIN     = %.3f A (%.1f W)\n",
    (float)CURRENT_THRESHOLD, (float)CURRENT_THRESHOLD * VOLTAGE_AC);
  Serial.printf("   ADC_PIN         = GPIO %d\n", CT_PIN);
  Serial.printf("   SAMPLES         = %d\n", SAMPLES);
  Serial.println("================================");

  // ── Boot ADC test — shows raw pin voltage to verify wiring
  Serial.println("\n[BOOT] ADC wiring check (GPIO 34 raw values):");
  Serial.println("  Expected: values 1700-2400 (midpoint of 3.3V supply)");
  Serial.println("  If 0 or 4095: wiring problem — check GPIO pin and bias resistors");
  for (int i = 0; i < 8; i++) {
    int v = analogRead(CT_PIN);
    Serial.printf("  Sample %d: %4d  (%.3f V)\n", i+1, v, v * (3.3f / 4095.0f));
    delay(60);
  }

  connectWiFi();
  if (wifiOK) testSupabase();

  lastEnergyTime = 0;
  lastUploadTime = millis();
  lastWifiCheck  = millis();
  wasDeviceOn    = false;

  Serial.println("\nReady — Measuring every 3s...\n");
}

// ════════════════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  if (now - lastWifiCheck > 30000) {
    checkWiFi();
    lastWifiCheck = now;
  }

  float current  = getRMS();
  deviceIsOn     = (current > 0.0);
  float power    = deviceIsOn ? (current * VOLTAGE_AC) : 0.0;

  // Energy accumulation (only when device was ON in both previous and current cycle)
  if (deviceIsOn && wasDeviceOn && lastEnergyTime > 0) {
    float hours = (now - lastEnergyTime) / 3600000.0f;
    energyKWh  += (power / 1000.0f) * hours;
  }
  if (deviceIsOn) lastEnergyTime = now;
  wasDeviceOn = deviceIsOn;

  float costPerHour = (power / 1000.0f) * 8.0f;

  Serial.println("================================");
  Serial.println("WiFi     : " + String(wifiOK ? "CONNECTED (" + String(WiFi.RSSI()) + " dBm)" : "OFFLINE"));
  Serial.println("Supabase : " + String(supabaseOK ? "CONNECTED" : "OFFLINE"));
  Serial.println("--------------------------------");
  Serial.print("Current  : "); Serial.print(current,   3); Serial.println(" A");
  Serial.print("Power    : "); Serial.print(power,     1); Serial.println(" W");
  Serial.print("Energy   : "); Serial.print(energyKWh, 5); Serial.println(" kWh");
  Serial.print("Cost/hr  : Rs."); Serial.println(costPerHour, 4);
  Serial.print("Status   : "); Serial.println(deviceIsOn ? "ON ✓" : "OFF");
  Serial.println("================================\n");

  if (wifiOK && (now - lastUploadTime >= 5000)) {
    uploadData(current, power, energyKWh, deviceIsOn);
    lastUploadTime = now;
  }

  delay(3000);
}
