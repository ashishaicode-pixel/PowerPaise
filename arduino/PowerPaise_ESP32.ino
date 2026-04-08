#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <esp_task_wdt.h>
#include <math.h>

// ========== CONFIG — SIRF YEH BADLO ==========
const char* WIFI_SSID     = "realme c550";
const char* WIFI_PASSWORD = "123456789k";
const char* SUPABASE_URL  = "https://yfbpuqwotfjpjiakncmf.supabase.co";
const char* SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmYnB1cXdvdGZqcGppYWtuY21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg5NjgsImV4cCI6MjA5MDUyNDk2OH0.Jrid3VVf4Hf5mwoFiu-F8nvGiD_FeELVUvgW6Q4qUr0";
const char* TABLE_NAME    = "power_data";

#define CT_PIN      34
#define LED_PIN     2
#define SAMPLES     400
#define VOLTAGE_AC  230.0
#define CALIBRATION 30.0
// ==============================================

WebServer server(80);

// Global state
float         current       = 0.0;
float         power         = 0.0;
float         energyKWh     = 0.0;
float         costPerHour   = 0.0;
bool          deviceIsOn    = false;
bool          wasDeviceOn   = false;
bool          wifiOK        = false;
bool          supabaseOK    = false;
bool          ctSensorOK    = false;
int           uploadCount   = 0;
int           failCount     = 0;
unsigned long lastUpload    = 0;
unsigned long lastWifiCheck = 0;
unsigned long lastEnergyTime= 0;
unsigned long lastPrint     = 0;

// ========================================
// LED
// ========================================
void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW); }
void blink(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    ledOn();  delay(onMs);
    ledOff(); delay(offMs);
  }
}

// ========================================
// WIFI
// ========================================
void connectWiFi() {
  Serial.println("\n=== WiFi Connection ===");

  WiFi.mode(WIFI_OFF);
  delay(500);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  delay(300);

  // Scan first
  Serial.println("Scanning networks...");
  int n = WiFi.scanNetworks();
  bool found = false;
  for (int i = 0; i < n; i++) {
    Serial.println("  " + WiFi.SSID(i) + " | " + String(WiFi.RSSI(i)) + " dBm");
    if (WiFi.SSID(i) == String(WIFI_SSID)) found = true;
  }

  if (!found) {
    Serial.println("ERROR: '" + String(WIFI_SSID) + "' not found!");
    Serial.println("Check hotspot name (case sensitive) and make sure it is ON.");
    wifiOK = false;
    blink(5, 100, 100);
    return;
  }

  Serial.println("Network found! Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    ledOn(); delay(200); ledOff(); delay(300);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    ledOn();
    Serial.println("WiFi     : CONNECTED [OK]");
    Serial.println("IP       : " + WiFi.localIP().toString());
    Serial.println("RSSI     : " + String(WiFi.RSSI()) + " dBm");
    Serial.println("Open this in phone browser: http://" + WiFi.localIP().toString());
    blink(3, 150, 100);
    ledOn();
  } else {
    wifiOK = false;
    ledOff();
    int s = WiFi.status();
    Serial.println("WiFi     : FAILED [X]");
    if (s == 4) Serial.println("Reason   : Wrong password");
    if (s == 1) Serial.println("Reason   : SSID not found");
    Serial.println("Code     : " + String(s));
    blink(5, 100, 100);
  }
  Serial.println("=======================\n");
}

void checkWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    return;
  }
  wifiOK     = false;
  supabaseOK = false;
  ledOff();
  Serial.print("WiFi lost, reconnecting");
  WiFi.disconnect();
  delay(500);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    ledOn();
    Serial.println("WiFi     : Reconnected [OK]");
    Serial.println("IP       : " + WiFi.localIP().toString());
  } else {
    Serial.println("WiFi     : Still offline [X]");
  }
}

// ========================================
// CT SENSOR — Appliance ON/OFF Detection
// ========================================
float readCurrent() {
  // Step 1: Find DC midpoint
  long sum = 0;
  for (int i = 0; i < 200; i++) {
    sum += analogRead(CT_PIN);
    delayMicroseconds(150);
  }
  int midpoint = sum / 200;

  // Midpoint sanity check — if wildly off, sensor not connected
  if (midpoint < 300 || midpoint > 3800) {
    ctSensorOK = false;
    return 0.0;
  }

  // Step 2: Collect samples and calculate RMS
  long  sumSq        = 0;
  int   maxVal       = 0;
  int   minVal       = 4095;
  int   zeroCross    = 0;
  int   lastSign     = 0;

  for (int i = 0; i < SAMPLES; i++) {
    int raw      = analogRead(CT_PIN);
    if (raw > maxVal) maxVal = raw;
    if (raw < minVal) minVal = raw;

    int adj  = raw - midpoint;
    sumSq   += (long)adj * adj;

    // Count zero crossings — confirms AC waveform
    int sign = (adj > 20) ? 1 : (adj < -20) ? -1 : 0;
    if (lastSign != 0 && sign != 0 && sign != lastSign) zeroCross++;
    if (sign != 0) lastSign = sign;

    delayMicroseconds(200);
  }

  int peakPeak = maxVal - minVal;

  // Step 3: Validate signal
  // AC signal must have zero crossings AND enough amplitude
  // If no crossings → DC noise / nothing connected → OFF
  if (zeroCross < 2 || peakPeak < 100) {
    ctSensorOK = false;
    return 0.0;
  }

  ctSensorOK = true;

  float rmsADC  = sqrt((float)sumSq / SAMPLES);
  float voltRMS = (rmsADC / 4095.0) * 3.3;
  float result  = (voltRMS / 33.0) * CALIBRATION;

  if (isnan(result) || isinf(result)) return 0.0;
  if (result > 100.0 || result < 0.05) return 0.0;

  return result;
}

// ========================================
// SUPABASE UPLOAD
// ========================================
bool uploadToSupabase(String json) {
  if (!wifiOK) return false;

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

  int code = http.POST(json);

  if (code != 200 && code != 201) {
    String resp = http.getString();
    Serial.println("Supabase error " + String(code) + ": " + resp.substring(0, 100));
    if (code == 401) Serial.println("Fix: Wrong anon key");
    if (code == 404) Serial.println("Fix: Wrong table name");
    if (code == 403) Serial.println("Fix: Disable RLS in Supabase");
  }

  http.end();
  return (code == 200 || code == 201);
}

// ========================================
// WEB DASHBOARD — Phone pe kholo
// ========================================
void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<meta http-equiv='refresh' content='4'>";
  html += "<title>PowerPaise</title>";
  html += "<style>";
  html += "body{font-family:Arial,sans-serif;background:#0d1117;color:#fff;";
  html += "margin:0;padding:15px;text-align:center;}";
  html += "h1{color:#00d9ff;font-size:22px;margin:10px 0;}";
  html += ".sub{color:#555;font-size:12px;margin-bottom:15px;}";
  html += ".row{display:flex;gap:10px;justify-content:center;margin:8px 0;}";
  html += ".badge{background:#161b22;border:1px solid #30363d;";
  html += "border-radius:8px;padding:8px 16px;font-size:13px;}";
  html += ".ok{color:#00ff88;}.fail{color:#ff4757;}";
  html += ".device{font-size:36px;font-weight:bold;padding:20px;";
  html += "border-radius:12px;margin:15px auto;max-width:300px;}";
  html += ".device-on{background:#00ff88;color:#000;}";
  html += ".device-off{background:#21262d;color:#ff4757;border:2px solid #ff4757;}";
  html += ".card{background:#161b22;border:1px solid #30363d;";
  html += "border-radius:12px;padding:15px;margin:10px auto;max-width:340px;}";
  html += ".metric{display:flex;justify-content:space-between;";
  html += "padding:8px 0;border-bottom:1px solid #21262d;font-size:15px;}";
  html += ".metric:last-child{border-bottom:none;}";
  html += ".lbl{color:#8b949e;}.val{color:#00d9ff;font-weight:bold;}";
  html += ".foot{font-size:11px;color:#555;margin-top:15px;}";
  html += "</style></head><body>";

  html += "<h1>PowerPaise</h1>";
  html += "<div class='sub'>Live Energy Monitor</div>";

  // Status badges
  html += "<div class='row'>";
  html += "<div class='badge'>WiFi: <span class='" + String(wifiOK ? "ok'>Connected" : "fail'>Offline") + "</span></div>";
  html += "<div class='badge'>Cloud: <span class='" + String(supabaseOK ? "ok'>Synced" : "fail'>Offline") + "</span></div>";
  html += "<div class='badge'>Sensor: <span class='" + String(ctSensorOK ? "ok'>Active" : "fail'>No Signal") + "</span></div>";
  html += "</div>";

  // Appliance ON/OFF
  if (deviceIsOn) {
    html += "<div class='device device-on'>APPLIANCE ON</div>";
  } else {
    html += "<div class='device device-off'>APPLIANCE OFF</div>";
  }

  // Readings
  html += "<div class='card'>";
  html += "<div class='metric'><span class='lbl'>Current</span><span class='val'>" + String(current, 3) + " A</span></div>";
  html += "<div class='metric'><span class='lbl'>Power</span><span class='val'>" + String(power, 1) + " W</span></div>";
  html += "<div class='metric'><span class='lbl'>Energy Used</span><span class='val'>" + String(energyKWh, 5) + " kWh</span></div>";
  html += "<div class='metric'><span class='lbl'>Cost / Hour</span><span class='val'>Rs." + String(costPerHour, 4) + "</span></div>";
  html += "<div class='metric'><span class='lbl'>Total Cost</span><span class='val'>Rs." + String(energyKWh * 8.0, 4) + "</span></div>";
  html += "</div>";

  // Footer
  html += "<div class='foot'>";
  html += "Uploads: " + String(uploadCount) + " | Fails: " + String(failCount);
  if (wifiOK) html += "<br>RSSI: " + String(WiFi.RSSI()) + " dBm";
  html += "<br>Uptime: " + String(millis() / 1000) + " sec";
  html += "<br><br>Auto-refreshes every 4 sec";
  html += "</div>";

  html += "</body></html>";
  server.send(200, "text/html", html);
}

// ========================================
// SETUP
// ========================================
void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n========================================");
  Serial.println("   PowerPaise Energy Monitor v3.0");
  Serial.println("========================================");

  esp_task_wdt_deinit();
  pinMode(LED_PIN, OUTPUT);
  ledOff();
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // LED self test
  Serial.print("LED Test: ");
  blink(3, 200, 200);
  Serial.println("OK");

  // Connect WiFi
  connectWiFi();

  if (wifiOK) {
    // Start web server
    server.on("/", handleRoot);
    server.begin();
    Serial.println("Web Dashboard: http://" + WiFi.localIP().toString());

    // Test Supabase
    Serial.print("Supabase Test: ");
    String testJson = "{\"current_a\":0,\"power_w\":0,\"energy_kwh\":0,";
    testJson += "\"cost_rs\":0,\"status\":\"BOOT\",\"device_on\":false,";
    testJson += "\"rssi\":" + String(WiFi.RSSI()) + "}";

    if (uploadToSupabase(testJson)) {
      supabaseOK = true;
      uploadCount++;
      Serial.println("CONNECTED [OK]");
      blink(2, 200, 100);
      ledOn();
    } else {
      Serial.println("FAILED [X]");
      Serial.println("Add correct SUPABASE_KEY in config.");
    }
  } else {
    Serial.println("Running offline — no WiFi.");
  }

  lastUpload    = millis();
  lastWifiCheck = millis();

  Serial.println("\n=== READY ===");
  Serial.println("Appliance detection started...\n");
}

// ========================================
// LOOP
// ========================================
void loop() {
  unsigned long now = millis();

  // Web server clients
  if (wifiOK) server.handleClient();

  // WiFi check every 30 sec
  if (now - lastWifiCheck > 30000) {
    checkWiFi();
    lastWifiCheck = now;
  }

  // CT Sensor reading
  current    = readCurrent();
  deviceIsOn = ctSensorOK && (current > 0.05);
  power      = deviceIsOn ? (current * VOLTAGE_AC) : 0.0;

  // Energy accumulation
  if (deviceIsOn && wasDeviceOn && lastEnergyTime > 0) {
    float hours = (now - lastEnergyTime) / 3600000.0;
    energyKWh  += (power / 1000.0) * hours;
  }
  if (deviceIsOn) lastEnergyTime = now;
  else            lastEnergyTime = 0;
  wasDeviceOn = deviceIsOn;

  costPerHour = (power / 1000.0) * 8.0;

  // Serial Monitor print every 3 sec
  if (now - lastPrint > 3000) {
    Serial.println("================================");
    Serial.print("WiFi      : "); Serial.println(wifiOK ? "CONNECTED [OK]" : "OFFLINE [X]");
    Serial.print("Supabase  : "); Serial.println(supabaseOK ? "CONNECTED [OK]" : "OFFLINE [X]");
    Serial.print("CT Sensor : "); Serial.println(ctSensorOK ? "ACTIVE [OK]" : "NO SIGNAL [X]");
    Serial.println("--------------------------------");
    Serial.print("Appliance : "); Serial.println(deviceIsOn ? "ON [RUNNING]" : "OFF [IDLE]");
    Serial.println("--------------------------------");
    Serial.print("Current   : "); Serial.print(current, 3); Serial.println(" A");
    Serial.print("Power     : "); Serial.print(power, 1);   Serial.println(" W");
    Serial.print("Energy    : "); Serial.print(energyKWh, 5); Serial.println(" kWh");
    Serial.print("Cost/hr   : Rs."); Serial.println(costPerHour, 4);
    Serial.print("Uploads   : "); Serial.print(uploadCount);
    Serial.print(" | Fails: "); Serial.println(failCount);
    if (wifiOK) {
      Serial.print("Dashboard : http://"); Serial.println(WiFi.localIP());
    }
    Serial.println("================================\n");
    lastPrint = now;
  }

  // Upload every 5 sec
  if (wifiOK && (now - lastUpload >= 5000)) {
    String json = "{";
    json += "\"current_a\":"  + String(current, 3) + ",";
    json += "\"power_w\":"    + String(power, 1)   + ",";
    json += "\"energy_kwh\":" + String(energyKWh, 5) + ",";
    json += "\"cost_rs\":"    + String(costPerHour, 4) + ",";
    json += "\"status\":\""   + String(deviceIsOn ? "ON" : "OFF") + "\",";
    json += "\"device_on\":"  + String(deviceIsOn ? "true" : "false") + ",";
    json += "\"rssi\":"       + String(WiFi.RSSI());
    json += "}";

    if (uploadToSupabase(json)) {
      supabaseOK = true;
      uploadCount++;
      blink(1, 60, 0);
      ledOn();
    } else {
      supabaseOK = false;
      failCount++;
    }
    lastUpload = now;
  }

  delay(100);
}
