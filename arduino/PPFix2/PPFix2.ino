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
#define SAMPLES     1000
#define VOLTAGE_AC  230.0

// ── CALIBRATION ─────────────────────────────────────────────────
// Your signal AVG=4094 means it's top-clipped (rides at 3.3V).
// getRMS() now compensates for this in software.
//
// After upload, watch Serial Monitor for "Current: X.XXX A"
// Compare with a real clamp meter measurement on same wire.
// If ESP32 reads 2.0A but real meter reads 5.0A → multiply:
//   NEW_CALIBRATION = 2000.0 × (5.0 / 2.0) = 5000.0
//
//  SCT-013-000  (100A bare)        → start with 2000.0
//  SCT-013-030  (30A  3.5mm jack)  → start with 1000.0
//  SCT-013-020  (20A  3.5mm jack)  → start with 1000.0
#define CALIBRATION 2000.0

// ── THRESHOLD ───────────────────────────────────────────────────
// Minimum current to count as ON.  0.05A × 230V = 11.5W
#define CURRENT_MIN 0.05

float         energyKWh      = 0.0;
bool          deviceIsOn     = false;
unsigned long lastUploadTime = 0;
unsigned long lastEnergyTime = 0;
unsigned long lastWifiCheck  = 0;
bool          wifiOK         = false;
bool          supabaseOK     = false;
bool          wasDeviceOn    = false;

// ════════════════════════════════════════════════════════════════
//  getRMS()
//
//  PROBLEM FOUND: Your AVG=4094, MAX=4095 means the CT signal
//  is biased at 3.3V (top of ADC range) instead of 1.65V (mid).
//  The POSITIVE half of the sine wave clips at 4095 and is lost.
//  Only the DOWNWARD (negative) swings are visible.
//
//  SOFTWARE FIX (no hardware change needed):
//  → Use 4095 as reference instead of computed midpoint
//  → Measure how far each sample drops BELOW 4095
//  → Multiply RMS by √2 to compensate for the missing half-wave
//
//  HARDWARE FIX (permanent, correct solution):
//  → Add 10kΩ resistor from GPIO34 to GND
//  → This pulls the bias to 1.65V so both halves are visible
//  → Then remove the *1.414 compensation below
// ════════════════════════════════════════════════════════════════
float getRMS() {
  // Step 1: Detect whether signal is top-clipped or centered
  //         by sampling average
  long avgSum = 0;
  for (int i = 0; i < 200; i++) {
    avgSum += analogRead(CT_PIN);
    delayMicroseconds(100);
  }
  int avg = (int)(avgSum / 200);

  double sumSq = 0.0;
  int    rawMin = 4095, rawMax = 0;

  // Step 2: Compute RMS with correct reference point
  if (avg > 3500) {
    // ── TOP-CLIPPED MODE (your current hardware situation)
    // Signal rides at ~4095, swings downward.
    // Reference = 4095 (the ceiling it clips at).
    // Each sample deviation = (4095 - raw) — how far it dipped.
    for (int i = 0; i < SAMPLES; i++) {
      int raw = analogRead(CT_PIN);
      if (raw < rawMin) rawMin = raw;
      if (raw > rawMax) rawMax = raw;
      double dev = (double)(4095 - raw);
      sumSq += dev * dev;
      delayMicroseconds(200);
    }
    // Half-wave RMS × √2 = full-wave RMS equivalent
    double halfRmsADC = sqrt(sumSq / SAMPLES);
    double voltRMS    = halfRmsADC * (3.3 / 4095.0) * 1.4142;
    double current    = (voltRMS / 33.0) * CALIBRATION;

    Serial.printf("  [DBG] MODE=TOP-CLIPPED avg=%d swing=%d halfRms=%.2f voltRMS=%.5fV cur=%.4fA\n",
      avg, rawMax - rawMin, (float)halfRmsADC, (float)voltRMS, (float)current);

    if (isnan(current) || isinf(current) || current > 100.0) return 0.0;
    return (current < CURRENT_MIN) ? 0.0f : (float)current;

  } else if (avg < 600) {
    // ── BOTTOM-CLIPPED MODE (signal rides near 0V)
    // Reference = 0. Measure upward swings.
    for (int i = 0; i < SAMPLES; i++) {
      int raw = analogRead(CT_PIN);
      if (raw < rawMin) rawMin = raw;
      if (raw > rawMax) rawMax = raw;
      double dev = (double)raw;
      sumSq += dev * dev;
      delayMicroseconds(200);
    }
    double halfRmsADC = sqrt(sumSq / SAMPLES);
    double voltRMS    = halfRmsADC * (3.3 / 4095.0) * 1.4142;
    double current    = (voltRMS / 33.0) * CALIBRATION;

    Serial.printf("  [DBG] MODE=BOT-CLIPPED avg=%d swing=%d halfRms=%.2f voltRMS=%.5fV cur=%.4fA\n",
      avg, rawMax - rawMin, (float)halfRmsADC, (float)voltRMS, (float)current);

    if (isnan(current) || isinf(current) || current > 100.0) return 0.0;
    return (current < CURRENT_MIN) ? 0.0f : (float)current;

  } else {
    // ── CENTERED MODE (correct hardware — bias at ~2048)
    int midpoint = avg;
    for (int i = 0; i < SAMPLES; i++) {
      int raw = analogRead(CT_PIN);
      if (raw < rawMin) rawMin = raw;
      if (raw > rawMax) rawMax = raw;
      double dev = (double)(raw - midpoint);
      sumSq += dev * dev;
      delayMicroseconds(200);
    }
    double rmsADC  = sqrt(sumSq / SAMPLES);
    double voltRMS = rmsADC * (3.3 / 4095.0);
    double current = (voltRMS / 33.0) * CALIBRATION;

    Serial.printf("  [DBG] MODE=CENTERED mid=%d swing=%d rms=%.2f voltRMS=%.5fV cur=%.4fA\n",
      midpoint, rawMax - rawMin, (float)rmsADC, (float)voltRMS, (float)current);

    if (isnan(current) || isinf(current) || current > 100.0) return 0.0;
    return (current < CURRENT_MIN) ? 0.0f : (float)current;
  }
}

// ════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.println("-----------------------------");
  Serial.print("WiFi: Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.disconnect(true);
  delay(500);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
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
    Serial.println("\nWiFi : CONNECTED  " + String(WiFi.RSSI()) + " dBm");
    Serial.println("IP   : " + WiFi.localIP().toString());
  } else {
    wifiOK = false;
    digitalWrite(LED_PIN, LOW);
    Serial.println("\nWiFi : FAILED — offline mode");
  }
  Serial.println("-----------------------------");
}

void checkWiFi() {
  if (WiFi.status() == WL_CONNECTED) { wifiOK = true; return; }
  wifiOK = false; supabaseOK = false;
  Serial.print("WiFi lost — reconnecting");
  WiFi.disconnect(); delay(500);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 15) {
    delay(500); Serial.print("."); tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true; digitalWrite(LED_PIN, HIGH);
    Serial.println("\nWiFi back!");
  } else { Serial.println("\nStill offline."); }
}

int supabaseInsert(String jsonData) {
  if (!wifiOK) return -1;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/" + TABLE_NAME);
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
  String j = "{\"current_a\":0.0,\"power_w\":0.0,\"energy_kwh\":0.0,"
             "\"cost_rs\":0.0,\"status\":\"BOOT\",\"device_on\":false,"
             "\"rssi\":" + String(WiFi.RSSI()) + "}";
  int code = supabaseInsert(j);
  supabaseOK = (code == 200 || code == 201);
  Serial.println(supabaseOK ? "OK" : "FAILED — HTTP " + String(code));
}

void uploadData(float current, float power, float kwh, bool isOn) {
  if (!wifiOK) return;
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
    supabaseOK = true; Serial.println("OK");
    digitalWrite(LED_PIN, LOW); delay(80); digitalWrite(LED_PIN, HIGH);
  } else { supabaseOK = false; Serial.println("FAILED " + String(code)); }
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
  Serial.println("   PowerPaise — Fixed Build");
  Serial.println("   Signal: TOP-CLIPPED (AVG~4095)");
  Serial.println("   Software compensation active");
  Serial.println("================================\n");

  connectWiFi();
  if (wifiOK) testSupabase();

  lastUploadTime = millis();
  lastWifiCheck  = millis();
  Serial.println("\nReady — measuring every 3s\n");
}

// ════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  if (now - lastWifiCheck > 30000) { checkWiFi(); lastWifiCheck = now; }

  float current = getRMS();
  deviceIsOn    = (current > 0.0);
  float power   = deviceIsOn ? (current * VOLTAGE_AC) : 0.0;

  if (deviceIsOn && wasDeviceOn && lastEnergyTime > 0) {
    float hours = (now - lastEnergyTime) / 3600000.0f;
    energyKWh  += (power / 1000.0f) * hours;
  }
  if (deviceIsOn) lastEnergyTime = now;
  wasDeviceOn = deviceIsOn;

  Serial.println("================================");
  Serial.println("WiFi     : " + String(wifiOK ? "CONNECTED (" + String(WiFi.RSSI()) + " dBm)" : "OFFLINE"));
  Serial.println("Supabase : " + String(supabaseOK ? "CONNECTED" : "OFFLINE"));
  Serial.println("--------------------------------");
  Serial.print("Current  : "); Serial.print(current,   3); Serial.println(" A");
  Serial.print("Power    : "); Serial.print(power,     1); Serial.println(" W");
  Serial.print("Energy   : "); Serial.print(energyKWh, 5); Serial.println(" kWh");
  Serial.print("Status   : "); Serial.println(deviceIsOn ? "ON  ✓" : "OFF");
  Serial.println("================================\n");

  if (wifiOK && (now - lastUploadTime >= 5000)) {
    uploadData(current, power, energyKWh, deviceIsOn);
    lastUploadTime = now;
  }

  delay(3000);
}
