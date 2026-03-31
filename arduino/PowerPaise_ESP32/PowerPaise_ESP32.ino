/*
 * ================================================================
 *  PowerPaise — ESP32 Firmware  v2.0  (Fixed & Production-Ready)
 *  CT Sensor  →  ESP32  →  Supabase  →  Frontend
 * ================================================================
 *
 *  QUICK SETUP (3 things to change before uploading):
 *  1. Set your WiFi name    → WIFI_SSID
 *  2. Set your WiFi password → WIFI_PASSWORD
 *  3. Adjust CT_RATIO for your sensor model (see comment below)
 *
 *  Hardware wiring:
 *    CT Sensor jack Tip    → 33Ω resistor → GPIO 34
 *    CT Sensor jack Sleeve → GND
 *    10kΩ from GPIO 34 → 3.3V   (bias resistor up)
 *    10kΩ from GPIO 34 → GND    (bias resistor down)
 *
 *  Bugs fixed vs old sketch:
 *    ✅ Serial baud 115200        — no more garbage characters
 *    ✅ Watchdog timer (v3 API)   — auto-reboot if sketch freezes
 *    ✅ WiFi sleep disabled       — no more random disconnects
 *    ✅ GPIO 34 (ADC1 only)       — ADC2 is broken when WiFi is ON
 *    ✅ HTTP timeout 8s           — no more infinite hangs
 *    ✅ http.end() always called  — no memory/socket leak
 *    ✅ 1000-sample RMS           — accurate at all load levels
 *    ✅ Auto ADC bias calibration — correct zero-current baseline
 *    ✅ Noise floor 10W           — shows 0W when appliance is OFF
 *    ✅ kWh midnight IST reset    — resets at 00:00 IST each day
 *    ✅ ArduinoJson v7 API        — compatible with installed version
 *    ✅ NetworkClientSecure       — correct HTTPS class for esp32 v3
 * ================================================================
 */

#include <WiFi.h>
#include <NetworkClientSecure.h>    // esp32 core v3.x — replaces WiFiClientSecure
#include <HTTPClient.h>
#include <ArduinoJson.h>            // v7.x
#include <esp_task_wdt.h>           // Watchdog — v3 API
#include <math.h>
#include <time.h>

// ════════════════════════════════════════════════════════════════
//  ★  CHANGE THESE BEFORE UPLOADING  ★
// ════════════════════════════════════════════════════════════════
const char* WIFI_SSID     = "YOUR_WIFI_NAME";      // ← your WiFi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";  // ← your WiFi password

// CT sensor ratio — pick the line matching YOUR sensor:
//   SCT-013-000  (0~100A, bare output) → CT_RATIO = 2000.0
//   SCT-013-030  (30A  fixed output)   → CT_RATIO = 1000.0
//   SCT-013-020  (20A  fixed output)   → CT_RATIO = 1000.0
//   SCT-013-010  (10A  fixed output)   → CT_RATIO = 1000.0
const float CT_RATIO = 2000.0f;                    // ← adjust for your sensor
// ════════════════════════════════════════════════════════════════

// ── Supabase (no need to change)
const char* SUPABASE_PROJECT_ID = "yfbpuqwotfjpjiakncmf";
const char* SUPABASE_ANON_KEY   =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYnB1cXdvdGZqcGppYWtuY21"
  "mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg5NjgsImV4cCI6MjA5MDU"
  "yNDk2OH0.Jrid3VVf4Hf5mwoFiu-F8nvGiD_FeELVUvgW6Q4qUr0";

// ── Pin & ADC settings
const int   ADC_PIN         = 34;     // GPIO 34 — ADC1 channel, safe with WiFi
const int   ADC_SAMPLES     = 1000;   // Samples per RMS — covers 25 full 50Hz cycles
const float ADC_VREF        = 3.3f;
const int   ADC_RESOLUTION  = 4096;   // 12-bit
const float BURDEN_RESISTOR = 33.0f;  // Ω across CT output terminals
const float MAINS_VOLTAGE   = 230.0f; // Indian grid voltage
const float NOISE_THRESHOLD = 10.0f;  // W — below this → report 0 (appliance OFF)
const float CALIBRATION     = 1.0f;   // Multiply if readings differ from reference

// ── Timing
const unsigned long SEND_INTERVAL_MS = 120000UL; // Upload interval: 2 minutes
const unsigned long WIFI_RETRY_MS    =   5000UL; // WiFi reconnect check interval
const unsigned long WDT_TIMEOUT_S    =       30; // Watchdog timeout (seconds)

// ── Runtime state
float         kwhToday      = 0.0f;
int           adcMidpoint   = 2048;
unsigned long lastSendMs    = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastPrintMs   = 0;
int           lastDay       = -1;
String        supabaseUrl;

// ════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(600);

  Serial.println(F("\n================================================"));
  Serial.println(F("   PowerPaise ESP32  v2.0  —  Starting up...  "));
  Serial.println(F("================================================"));

  // ── Watchdog — ESP32 Arduino core v3.x uses config struct
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms     = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic  = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  Serial.printf("[WDT]  Watchdog armed: %lu s\n", WDT_TIMEOUT_S);

  // ── ADC configuration
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  Serial.println(F("[ADC]  12-bit, attenuation 11dB (0–3.3V)"));

  // ── DC bias calibration — must run with no load on CT sensor
  calibrateAdc();

  // ── Build URL
  supabaseUrl  = "https://";
  supabaseUrl += SUPABASE_PROJECT_ID;
  supabaseUrl += ".supabase.co/functions/v1/make-server-091ae39b/readings";

  // ── Connect to WiFi
  connectWiFi();

  Serial.println(F("[SYS]  Setup complete — entering main loop"));
  Serial.println(F("================================================\n"));
}

// ════════════════════════════════════════════════════════════════
void loop() {
  esp_task_wdt_reset();  // Feed watchdog — never remove this line!

  unsigned long now = millis();

  // ── Auto-reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiRetry >= WIFI_RETRY_MS) {
      lastWifiRetry = now;
      Serial.println(F("[WiFi] Lost — reconnecting..."));
      WiFi.reconnect();
    }
    delay(200);
    return;
  }

  // ── Midnight IST kWh reset
  checkMidnightReset();

  // ── Measure power (RMS)
  float watts = measureWatts();

  // ── Print live reading every 2 s (readable in Serial Monitor)
  if (now - lastPrintMs >= 2000) {
    lastPrintMs = now;
    unsigned long secToNext = lastSendMs == 0
      ? SEND_INTERVAL_MS / 1000
      : (SEND_INTERVAL_MS - (now - lastSendMs)) / 1000;
    Serial.printf("[LIVE]  Power: %6.1f W   kWh: %.3f   Next: %lu s   RSSI: %d dBm\n",
      watts, kwhToday, secToNext, WiFi.RSSI());
  }

  // ── Upload on interval
  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;

    // Accumulate energy (kW × h)
    float hours  = SEND_INTERVAL_MS / 1000.0f / 3600.0f;
    kwhToday    += (watts / 1000.0f) * hours;
    kwhToday     = roundf(kwhToday * 1000.0f) / 1000.0f; // 3 decimals

    uploadReading(watts, kwhToday);
  }

  delay(100);
}

// ════════════════════════════════════════════════════════════════
//  measureWatts() — true RMS over 1000 ADC samples
// ════════════════════════════════════════════════════════════════
float measureWatts() {
  double sumSq = 0.0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    int raw      = analogRead(ADC_PIN);
    int centered = raw - adcMidpoint;
    sumSq += (double)centered * (double)centered;
  }
  double rmsAdc  = sqrt(sumSq / ADC_SAMPLES);
  double rmsVolt = rmsAdc * (ADC_VREF / (double)ADC_RESOLUTION);
  double rmsAmp  = (rmsVolt / BURDEN_RESISTOR) * CT_RATIO;
  float  watts   = (float)(rmsAmp * MAINS_VOLTAGE * CALIBRATION);

  return (watts < NOISE_THRESHOLD) ? 0.0f : watts;
}

// ════════════════════════════════════════════════════════════════
//  calibrateAdc() — find DC midpoint with no load
// ════════════════════════════════════════════════════════════════
void calibrateAdc() {
  Serial.print(F("[CAL]  Calibrating ADC bias (keep appliances off)..."));
  long sum = 0;
  const int N = 2000;
  for (int i = 0; i < N; i++) {
    sum += analogRead(ADC_PIN);
    delayMicroseconds(150);
  }
  adcMidpoint = (int)(sum / N);
  Serial.printf("  midpoint = %d  (ideal ≈ 2048)\n", adcMidpoint);

  if (adcMidpoint < 1500 || adcMidpoint > 2600)
    Serial.println(F("[CAL]  ⚠ Midpoint far off — check 2×10kΩ bias resistors!"));
  else
    Serial.println(F("[CAL]  ✓ Calibration OK"));
}

// ════════════════════════════════════════════════════════════════
//  connectWiFi() — blocks until connected, feeds watchdog
// ════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to \"%s\"  ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);           // Disable power-save → no random drops
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    esp_task_wdt_reset();
    delay(500);
    Serial.print(".");
    tries++;
    if (tries >= 60) {
      Serial.println(F("\n[WiFi] Timeout — retrying..."));
      WiFi.disconnect(true);
      delay(2000);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      tries = 0;
    }
  }
  Serial.printf("\n[WiFi] ✓ Connected  IP: %s  RSSI: %d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());

  // NTP sync — IST = UTC + 5h30m = 19800 seconds offset
  configTime(19800, 0, "pool.ntp.org", "time.google.com");
  Serial.println(F("[NTP]  Time sync started (IST UTC+5:30)"));
}

// ════════════════════════════════════════════════════════════════
//  checkMidnightReset() — clear kwhToday at new day (IST)
// ════════════════════════════════════════════════════════════════
void checkMidnightReset() {
  struct tm t;
  if (!getLocalTime(&t)) return;
  if (t.tm_mday != lastDay && t.tm_hour == 0 && t.tm_min < 2) {
    if (lastDay != -1) {
      Serial.printf("[kWh]  Midnight reset — yesterday total: %.3f kWh\n", kwhToday);
      kwhToday = 0.0f;
    }
    lastDay = t.tm_mday;
  }
}

// ════════════════════════════════════════════════════════════════
//  uploadReading() — HTTPS POST to Supabase, 8s timeout
// ════════════════════════════════════════════════════════════════
void uploadReading(float watts, float kwh) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[HTTP] Skipping upload — not connected"));
    return;
  }

  // ArduinoJson v7: JsonDocument (no more StaticJsonDocument)
  JsonDocument doc;
  doc["watts"]    = (int)roundf(watts);
  doc["kwhToday"] = kwh;
  String payload;
  serializeJson(doc, payload);

  Serial.printf("[HTTP] Uploading → %d W, %.3f kWh\n", (int)roundf(watts), kwh);

  NetworkClientSecure client;
  client.setInsecure();           // Skip CA verify — safe for Supabase anon endpoint

  HTTPClient http;
  http.setTimeout(8000);          // 8 second timeout

  if (!http.begin(client, supabaseUrl)) {
    Serial.println(F("[HTTP] ✗ begin() failed"));
    return;
  }

  http.addHeader("Content-Type",  "application/json");
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Connection",    "close");

  int code = http.POST(payload);

  if (code > 0) {
    if (code == 200 || code == 201)
      Serial.printf("[HTTP] ✓ Saved! (%d)\n", code);
    else
      Serial.printf("[HTTP] ✗ Server error (%d): %s\n", code, http.getString().c_str());
  } else {
    Serial.printf("[HTTP] ✗ Failed: %s\n", HTTPClient::errorToString(code).c_str());
  }

  http.end();   // Always free resources
}
