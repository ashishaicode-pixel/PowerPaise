/*
 * ================================================================
 *  PowerPaise — ESP32 Firmware  v2.1  DEBUG BUILD
 *  CT Sensor  →  ESP32  →  Supabase  →  Frontend
 * ================================================================
 *
 *  HOW TO USE THIS SKETCH:
 *  1. Change WIFI_SSID and WIFI_PASSWORD below
 *  2. Upload to ESP32
 *  3. Open Serial Monitor at 115200 baud
 *  4. Connect your CT sensor around ONE live wire
 *  5. Read the [DBG] lines — they show raw values BEFORE threshold
 *
 *  WHICH CT_RATIO TO USE:
 *    SCT-013-000  (screw terminal, 0-100A, no built-in burden) → 2000.0
 *    SCT-013-030  (3.5mm jack,    0-30A,  built-in burden)     → 1000.0
 *    SCT-013-020  (3.5mm jack,    0-20A,  built-in burden)     → 1000.0
 *    SCT-013-010  (3.5mm jack,    0-10A,  built-in burden)     → 1000.0
 *    SCT-013-005  (3.5mm jack,    0-5A,   built-in burden)     → 1000.0
 *
 *  WIRING (for SCT-013 with 3.5mm jack):
 *    Jack TIP    ──┬── 33Ω ── GND
 *                  └── GPIO 34
 *    Jack SLEEVE ── GND
 *    10kΩ from GPIO 34 to 3.3V
 *    10kΩ from GPIO 34 to GND
 *    (these two 10kΩ bias the signal to 1.65V midpoint)
 * ================================================================
 */

#include <WiFi.h>
#include <NetworkClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <math.h>
#include <time.h>

// ════════════════════════════════════════════════════════
//  ★  CHANGE THESE  ★
// ════════════════════════════════════════════════════════
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ★ Set this to match YOUR CT sensor model (read comments above)
const float CT_RATIO = 1000.0f;   // SCT-013-030/020/010/005 = 1000
                                   // SCT-013-000 bare = 2000
// ════════════════════════════════════════════════════════

// Supabase (don't change)
const char* SUPABASE_PROJECT_ID = "yfbpuqwotfjpjiakncmf";
const char* SUPABASE_ANON_KEY   =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYnB1cXdvdGZqcGppYWtuY21"
  "mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg5NjgsImV4cCI6MjA5MDU"
  "yNDk2OH0.Jrid3VVf4Hf5mwoFiu-F8nvGiD_FeELVUvgW6Q4qUr0";

// ADC & sensor constants
const int   ADC_PIN         = 34;     // GPIO 34 — ADC1, safe with WiFi
const int   ADC_SAMPLES     = 1000;   // RMS samples (covers 25 full 50Hz cycles)
const float ADC_VREF        = 3.3f;
const float ADC_RESOLUTION  = 4096.0f;
const float BURDEN_RESISTOR = 33.0f;  // Ohms — resistor on your board
const float MAINS_VOLTAGE   = 230.0f; // Volts (Indian grid)
const float CALIBRATION     = 1.0f;   // Tune if reading differs from reference

// ★ NOISE THRESHOLD — set to 1.0 so we can see tiny values in debug
// Once you know real readings, raise this back to 5.0 or 10.0
const float NOISE_THRESHOLD = 1.0f;

// Timing
const unsigned long SEND_INTERVAL_MS = 120000UL;
const unsigned long WDT_TIMEOUT_S    = 30;

// State
float         kwhToday    = 0.0f;
int           adcMidpoint = 2048;
unsigned long lastSendMs  = 0;
unsigned long lastPrintMs = 0;
int           lastDay     = -1;
String        supabaseUrl;

// ════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(600);

  Serial.println(F("\n============================================="));
  Serial.println(F("  PowerPaise ESP32 v2.1 — DEBUG BUILD"));
  Serial.println(F("  Serial Monitor must be at 115200 baud!"));
  Serial.println(F("============================================="));
  Serial.printf( "  CT_RATIO        = %.1f\n",  CT_RATIO);
  Serial.printf( "  BURDEN_RESISTOR = %.1f ohm\n", BURDEN_RESISTOR);
  Serial.printf( "  NOISE_THRESHOLD = %.1f W\n", NOISE_THRESHOLD);
  Serial.printf( "  ADC_PIN         = GPIO %d\n", ADC_PIN);
  Serial.println(F("=============================================\n"));

  // Watchdog (esp32 core v3 API)
  esp_task_wdt_config_t wdt_cfg = {
    .timeout_ms     = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic  = true
  };
  esp_task_wdt_init(&wdt_cfg);
  esp_task_wdt_add(NULL);

  // ADC
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Test raw ADC first — before calibration
  testRawAdc();

  // Calibrate bias
  calibrateAdc();

  // Build Supabase URL
  supabaseUrl  = "https://";
  supabaseUrl += SUPABASE_PROJECT_ID;
  supabaseUrl += ".supabase.co/functions/v1/make-server-091ae39b/readings";

  // Connect WiFi
  connectWiFi();
  Serial.println(F("\n[SYS] Ready — watching sensor every 2s...\n"));
}

// ════════════════════════════════════════════════════════
void loop() {
  esp_task_wdt_reset();

  unsigned long now = millis();

  // WiFi reconnect
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[WiFi] Reconnecting..."));
    WiFi.reconnect();
    delay(3000);
    return;
  }

  checkMidnightReset();

  // Measure
  float watts = measureWatts();

  // Print every 2s
  if (now - lastPrintMs >= 2000) {
    lastPrintMs = now;
    Serial.printf("[READ] Watts: %7.2f W   kWh: %.4f   WiFi: %d dBm\n",
      watts, kwhToday, WiFi.RSSI());
  }

  // Upload on interval
  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;
    float hours = SEND_INTERVAL_MS / 1000.0f / 3600.0f;
    kwhToday   += (watts / 1000.0f) * hours;
    kwhToday    = roundf(kwhToday * 1000.0f) / 1000.0f;
    uploadReading(watts, kwhToday);
  }

  delay(100);
}

// ════════════════════════════════════════════════════════
//  testRawAdc() — print raw ADC readings at boot
//  Helps diagnose wiring: you MUST see values ~1700–2400
//  If stuck at 0 or 4095 → wiring problem
// ════════════════════════════════════════════════════════
void testRawAdc() {
  Serial.println(F("[RAW]  ── Boot ADC test (10 raw samples from GPIO 34) ──"));
  for (int i = 0; i < 10; i++) {
    int val = analogRead(ADC_PIN);
    Serial.printf("[RAW]  Sample %2d : %4d  (voltage: %.3f V)\n",
      i + 1, val, val * (3.3f / 4095.0f));
    delay(50);
  }
  Serial.println(F("[RAW]  Expected: values around 1800-2200 (midpoint of 3.3V)"));
  Serial.println(F("[RAW]  If you see 0 or 4095 → check your wiring!\n"));
}

// ════════════════════════════════════════════════════════
//  measureWatts() — RMS with full debug output
// ════════════════════════════════════════════════════════
float measureWatts() {
  double sumSq  = 0.0;
  int    rawMin = 4095, rawMax = 0;

  for (int i = 0; i < ADC_SAMPLES; i++) {
    int raw      = analogRead(ADC_PIN);
    if (raw < rawMin) rawMin = raw;
    if (raw > rawMax) rawMax = raw;
    int centered = raw - adcMidpoint;
    sumSq += (double)centered * (double)centered;
  }

  double rmsAdc   = sqrt(sumSq / ADC_SAMPLES);
  double rmsVolt  = rmsAdc  * (ADC_VREF / ADC_RESOLUTION);
  double rmsAmps  = (rmsVolt / BURDEN_RESISTOR) * CT_RATIO;
  float  rawWatts = (float)(rmsAmps * MAINS_VOLTAGE * CALIBRATION);
  float  watts    = (rawWatts < NOISE_THRESHOLD) ? 0.0f : rawWatts;

  // ── DEBUG LINE: Shows the full calculation chain - always printed
  Serial.printf(
    "[DBG]  ADC min=%d max=%d mid=%d | rmsAdc=%.2f | rmsVolt=%.5f V | "
    "rmsAmps=%.4f A | rawWatts=%.2f W | reported=%.2f W\n",
    rawMin, rawMax, adcMidpoint,
    (float)rmsAdc, (float)rmsVolt, (float)rmsAmps, rawWatts, watts
  );

  return watts;
}

// ════════════════════════════════════════════════════════
//  calibrateAdc() — find DC midpoint at no load
// ════════════════════════════════════════════════════════
void calibrateAdc() {
  Serial.println(F("[CAL]  Calibrating ADC midpoint..."));
  Serial.println(F("[CAL]  Keep CT sensor ON THE WIRE but no current flowing"));
  delay(1000);

  long sum = 0;
  const int N = 2000;
  for (int i = 0; i < N; i++) {
    sum += analogRead(ADC_PIN);
    delayMicroseconds(150);
  }
  adcMidpoint = (int)(sum / N);

  Serial.printf("[CAL]  Midpoint = %d  (ideal ≈ 2048)\n", adcMidpoint);
  if (adcMidpoint < 1400 || adcMidpoint > 2700) {
    Serial.println(F("[CAL]  ⚠ WARNING: Midpoint is far off!"));
    Serial.println(F("[CAL]  Check: 2x 10kΩ resistors from GPIO34 to 3.3V and GND"));
    Serial.println(F("[CAL]  Using default midpoint 2048"));
    adcMidpoint = 2048;
  } else {
    Serial.println(F("[CAL]  ✓ Calibration OK"));
  }
}

// ════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to \"%s\" ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int t = 0;
  while (WiFi.status() != WL_CONNECTED) {
    esp_task_wdt_reset();
    delay(500);
    Serial.print(".");
    t++;
    if (t >= 60) {
      Serial.println(F("\n[WiFi] Timeout — retrying..."));
      WiFi.disconnect(true);
      delay(1000);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      t = 0;
    }
  }
  Serial.printf("\n[WiFi] ✓ Connected  IP=%s  RSSI=%d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());
  configTime(19800, 0, "pool.ntp.org");
}

// ════════════════════════════════════════════════════════
void checkMidnightReset() {
  struct tm t;
  if (!getLocalTime(&t)) return;
  if (t.tm_mday != lastDay && t.tm_hour == 0 && t.tm_min < 2) {
    if (lastDay != -1) { kwhToday = 0.0f; }
    lastDay = t.tm_mday;
  }
}

// ════════════════════════════════════════════════════════
void uploadReading(float watts, float kwh) {
  if (WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  doc["watts"]    = (int)roundf(watts);
  doc["kwhToday"] = kwh;
  String payload;
  serializeJson(doc, payload);

  Serial.printf("[HTTP] Uploading: %s\n", payload.c_str());

  NetworkClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(8000);

  if (!http.begin(client, supabaseUrl)) {
    Serial.println(F("[HTTP] ✗ begin() failed"));
    return;
  }
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Connection",    "close");

  int code = http.POST(payload);
  if (code == 200 || code == 201)
    Serial.printf("[HTTP] ✓ Saved! (%d)\n", code);
  else
    Serial.printf("[HTTP] ✗ Error (%d)\n", code);

  http.end();
}
