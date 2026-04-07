/*
 * ╔══════════════════════════════════════════════════════════════╗
 *  PowerPaise — ESP32 Energy Monitor  |  Final Production Build
 *  CT Sensor → ESP32 (GPIO 34) → Supabase → PowerPaise Frontend
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *  CALIBRATION GUIDE (do this once, takes 2 minutes):
 *  ─────────────────────────────────────────────────
 *  1. Upload this sketch
 *  2. Turn ON a known appliance (e.g. your phone charger + a bulb)
 *  3. Look at "Current" in Serial Monitor
 *  4. Compare with a clamp meter or check appliance label (Watts ÷ 230)
 *  5. If ESP32 reads 2.0A but real is 5.0A → set CALIBRATION = 2000 × (5.0/2.0) = 5000
 *  6. Re-upload, check again — repeat until it matches
 *
 *  HOW ENERGY IS CALCULATED:
 *  ─────────────────────────
 *  Energy (kWh) = Power (kW) × Time (hours)
 *  Resets every time ESP32 reboots (not persisted to flash)
 *
 *  HARDWARE SETUP (your current wiring — software compensated):
 *  ─────────────────────────────────────────────────────────────
 *  CT Sensor → 33Ω burden → GPIO 34
 *  Your signal AVG=4094: code detects this and compensates.
 *  For perfect accuracy, add 10kΩ from GPIO34 to GND (bias fix).
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_task_wdt.h>
#include <math.h>

// ════════════════════════════════════════════════════════════════
//   ★  SETTINGS — ONLY CHANGE THESE  ★
// ════════════════════════════════════════════════════════════════

const char* WIFI_SSID     = "realme C55 7824";
const char* WIFI_PASSWORD = "sspu2626";

// Supabase — do not change
const char* SUPABASE_URL = "https://yfbpuqwotfjpjiakncmf.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYnB1cXdvdGZqcGppYWtuY21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg5NjgsImV4cCI6MjA5MDUyNDk2OH0.Jrid3VVf4Hf5mwoFiu-F8nvGiD_FeELVUvgW6Q4qUr0";
const char* TABLE_NAME   = "power_data";

// ── CT Sensor calibration ──────────────────────────────────────
// This is the most important number. Start with the value for
// your sensor, then fine-tune using the guide above.
//
//   SCT-013-000  (100A bare output, 33Ω burden added by you) → 2000.0
//   SCT-013-030  (3.5mm plug, 30A max, built-in burden)      → 1000.0
//   SCT-013-020  (3.5mm plug, 20A max, built-in burden)      → 1000.0
//   SCT-013-010  (3.5mm plug, 10A max, built-in burden)      → 1000.0
//
//   ↓ Change this number ↓
#define CALIBRATION     2000.0f

// ── Electricity rate (₹ per kWh) ──────────────────────────────
#define RATE_PER_KWH    8.0f      // Indian average ~₹8/unit

// ── Minimum watts to count as ON (anything below = OFF) ───────
#define NOISE_WATTS     15.0f     // 15W minimum — ignores sensor noise

// ════════════════════════════════════════════════════════════════
//   Hardware pins & ADC constants (don't need to change)
// ════════════════════════════════════════════════════════════════
#define CT_PIN          34
#define LED_PIN         2
#define SAMPLES         1000      // 1000 samples ≈ 25 full 50Hz cycles
#define BURDEN_OHMS     33.0f
#define MAINS_VOLTS     230.0f

// ════════════════════════════════════════════════════════════════
//   State variables
// ════════════════════════════════════════════════════════════════
float         g_energyKWh    = 0.0f;
bool          g_deviceOn     = false;
bool          g_prevDeviceOn = false;
unsigned long g_lastEnergyTs = 0;
unsigned long g_lastUploadTs = 0;
unsigned long g_lastWifiTs   = 0;
unsigned long g_onStartTs    = 0;    // When device last turned ON
bool          g_wifiOK       = false;
bool          g_supaOK       = false;

// ════════════════════════════════════════════════════════════════
//   measureCurrent()
//
//   Reads the CT sensor and returns RMS current in Amps.
//
//   Automatically detects your signal bias and compensates:
//   ┌─────────────────────────────────────────────────────────┐
//   │ Your hardware: AVG ≈ 4094 (top-clipped at 3.3V)        │
//   │ Fix: uses (4095-sample) as deviation, ×√2 to recover   │
//   │      the missing positive half of the AC waveform       │
//   └─────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════
float measureCurrent() {
  // ── 1. Find average to detect bias mode ──
  long   avgSum = 0;
  for (int i = 0; i < 300; i++) {
    avgSum += analogRead(CT_PIN);
    delayMicroseconds(100);
  }
  int avg = (int)(avgSum / 300);

  // ── 2. Collect samples & compute sum-of-squares ──
  double sumSq  = 0.0;
  int    rawMin = 4095, rawMax = 0;

  for (int i = 0; i < SAMPLES; i++) {
    int raw = analogRead(CT_PIN);
    if (raw < rawMin) rawMin = raw;
    if (raw > rawMax) rawMax = raw;

    double dev;
    if (avg > 3500) {
      // TOP-CLIPPED: signal rides near 3.3V, swings downward
      // Your case — AVG=4094. Measure deviation below ceiling.
      dev = (double)(4095 - raw);
    } else if (avg < 600) {
      // BOTTOM-CLIPPED: signal rides near 0V, swings upward
      dev = (double)raw;
    } else {
      // CENTERED: correct hardware (add 10kΩ GPIO34→GND to reach here)
      dev = (double)(raw - avg);
    }
    sumSq += dev * dev;
    delayMicroseconds(200);
  }

  // ── 3. Compute RMS ──
  double rmsADC = sqrt(sumSq / SAMPLES);

  // Apply ×√2 compensation for half-wave (top/bottom clipped only)
  double voltRMS;
  if (avg > 3500 || avg < 600) {
    // Half-wave → multiply by √2 to estimate full-wave equivalent
    voltRMS = rmsADC * (3.3 / 4095.0) * 1.41421356;
  } else {
    // Full-wave — no compensation needed
    voltRMS = rmsADC * (3.3 / 4095.0);
  }

  double current = (voltRMS / BURDEN_OHMS) * CALIBRATION;

  // ── 4. Debug output every reading ──
  Serial.printf("  [raw] avg=%d swing=%d rmsADC=%.2f voltRMS=%.5fV  → %.4fA\n",
    avg, rawMax - rawMin, (float)rmsADC, (float)voltRMS, (float)current);

  // ── 5. Safety & noise floor ──
  if (isnan(current) || isinf(current) || current > 100.0) return 0.0f;
  float watts = (float)current * MAINS_VOLTS;
  if (watts < NOISE_WATTS) return 0.0f;   // Below noise floor → OFF

  return (float)current;
}

// ════════════════════════════════════════════════════════════════
//   WiFi helpers
// ════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("\n[WiFi] Connecting to \"%s\" ", WIFI_SSID);
  WiFi.disconnect(true);
  delay(300);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);            // No power-save → stable connection
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    g_wifiOK = true;
    digitalWrite(LED_PIN, HIGH);
    Serial.printf("\n[WiFi] ✓ Connected  IP=%s  RSSI=%d dBm\n",
      WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    g_wifiOK = false;
    Serial.println("\n[WiFi] ✗ Failed — running offline");
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) { g_wifiOK = true; return; }
  g_wifiOK = false; g_supaOK = false;
  Serial.print("[WiFi] Reconnecting");
  WiFi.disconnect(); delay(300);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 15 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    g_wifiOK = true; digitalWrite(LED_PIN, HIGH);
    Serial.println(" ✓");
  } else Serial.println(" ✗");
}

// ════════════════════════════════════════════════════════════════
//   Supabase helpers
// ════════════════════════════════════════════════════════════════
int supabasePost(const String& json) {
  if (!g_wifiOK) return -1;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/" + TABLE_NAME);
  http.setTimeout(10000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer",        "return=minimal");
  int code = http.POST(json);
  if (code != 200 && code != 201)
    Serial.println("[HTTP] Error: " + http.getString().substring(0, 120));
  http.end();
  return code;
}

void testSupabase() {
  Serial.print("[Supa] Testing connection... ");
  String j = "{\"current_a\":0,\"power_w\":0,\"energy_kwh\":0,"
             "\"cost_rs\":0,\"status\":\"BOOT\",\"device_on\":false,"
             "\"rssi\":" + String(WiFi.RSSI()) + "}";
  int code = supabasePost(j);
  g_supaOK = (code == 200 || code == 201);
  Serial.println(g_supaOK ? "✓ Connected" : "✗ Failed HTTP " + String(code));
}

void uploadReading(float current, float power, float kwh, bool isOn) {
  if (!g_wifiOK) return;

  // Cost per hour of current usage (instantaneous)
  float costPerHr = (power / 1000.0f) * RATE_PER_KWH;

  String json;
  json.reserve(180);
  json  = "{";
  json += "\"current_a\":"  + String(current,   4) + ",";
  json += "\"power_w\":"    + String(power,     2) + ",";
  json += "\"energy_kwh\":" + String(kwh,       5) + ",";
  json += "\"cost_rs\":"    + String(kwh * RATE_PER_KWH, 4) + ",";
  json += "\"status\":\""   + String(isOn ? "ON" : "OFF") + "\",";
  json += "\"device_on\":"  + String(isOn ? "true" : "false") + ",";
  json += "\"rssi\":"       + String(WiFi.RSSI());
  json += "}";

  Serial.print("[HTTP] Uploading → ");
  int code = supabasePost(json);
  if (code == 200 || code == 201) {
    g_supaOK = true;
    Serial.printf("✓ OK  (%.1fW  %.5f kWh  %s)\n", power, kwh, isOn ? "ON" : "OFF");
    digitalWrite(LED_PIN, LOW); delay(60); digitalWrite(LED_PIN, HIGH);
  } else {
    g_supaOK = false;
    Serial.println("✗ Failed HTTP " + String(code));
  }
}

// ════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(800);

  esp_task_wdt_deinit();           // Disable watchdog (simple build)
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  analogReadResolution(12);        // 12-bit ADC: 0–4095
  analogSetAttenuation(ADC_11db);  // Full 0–3.3V range

  Serial.println(F("\n╔══════════════════════════════════════════╗"));
  Serial.println(F(  "║   PowerPaise Energy Monitor — v3.0      ║"));
  Serial.println(F(  "╚══════════════════════════════════════════╝"));
  Serial.printf( "   CT Pin       : GPIO %d\n",  CT_PIN);
  Serial.printf( "   Calibration  : %.1f\n",     (float)CALIBRATION);
  Serial.printf( "   Noise floor  : %.1f W\n",   (float)NOISE_WATTS);
  Serial.printf( "   Rate         : Rs.%.1f/kWh\n", (float)RATE_PER_KWH);
  Serial.println(F("──────────────────────────────────────────\n"));

  connectWiFi();
  if (g_wifiOK) testSupabase();

  g_lastUploadTs = millis();
  g_lastWifiTs   = millis();

  Serial.println(F("\n[SYS] Ready — measuring every 3 seconds\n"));
}

// ════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── WiFi maintenance every 30 s ──
  if (now - g_lastWifiTs >= 30000) {
    maintainWiFi();
    g_lastWifiTs = now;
  }

  // ── Measure current ──────────────────────────────────────────
  float current = measureCurrent();
  float power   = current * MAINS_VOLTS;
  g_deviceOn    = (current > 0.0f);

  // ── Energy accumulation ──────────────────────────────────────
  // Add energy only when device is ON in both this and last cycle
  if (g_deviceOn && g_prevDeviceOn && g_lastEnergyTs > 0) {
    float hours   = (now - g_lastEnergyTs) / 3600000.0f;
    g_energyKWh  += (power / 1000.0f) * hours;
    if (g_energyKWh > 9999.0f) g_energyKWh = 0.0f; // overflow guard
  }
  if (g_deviceOn) g_lastEnergyTs = now;
  g_prevDeviceOn = g_deviceOn;

  // ── Derived values ───────────────────────────────────────────
  float costTotal = g_energyKWh * RATE_PER_KWH;   // ₹ spent so far
  float costPerHr = (power / 1000.0f) * RATE_PER_KWH; // ₹/hour right now

  // ── Serial Monitor output ────────────────────────────────────
  Serial.println(F("╔══════════════════════════════════════════╗"));
  Serial.printf(  "║  WiFi    : %s%-28s║\n",
    g_wifiOK ? "✓ " : "✗ ",
    g_wifiOK ? (WiFi.RSSI() > -70 ? "Good signal" : "Weak signal") : "OFFLINE");
  Serial.printf(  "║  Supabase: %s%-28s║\n",
    g_supaOK ? "✓ " : "✗ ",
    g_supaOK ? "Connected" : "Offline");
  Serial.println(F("╠══════════════════════════════════════════╣"));
  Serial.printf(  "║  Status  : %-30s║\n", g_deviceOn ? "🟢 ON" : "🔴 OFF");
  Serial.printf(  "║  Current : %-6.3f A%22s║\n", current, "");
  Serial.printf(  "║  Power   : %-7.1f W%21s║\n", power, "");
  Serial.printf(  "║  Energy  : %-9.5f kWh%18s║\n", g_energyKWh, "");
  Serial.printf(  "║  Cost/hr : Rs. %-6.2f%23s║\n", costPerHr, "");
  Serial.printf(  "║  Total ₹ : Rs. %-6.4f%23s║\n", costTotal, "");
  Serial.println(F("╚══════════════════════════════════════════╝\n"));

  // ── Upload to Supabase every 5 seconds ───────────────────────
  if (g_wifiOK && (now - g_lastUploadTs >= 5000)) {
    g_lastUploadTs = now;
    uploadReading(current, power, g_energyKWh, g_deviceOn);
  }

  delay(3000);
}
