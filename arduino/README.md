# PowerPaise — ESP32 Firmware Guide

## Your 3 Problems + Exact Root Causes + Fixes

---

## 🔴 Problem 1: Random garbage / random code in Arduino IDE Serial Monitor

**Root cause:** Baud rate mismatch.

Your old sketch used one baud rate (e.g., `Serial.begin(9600)`) but the Arduino IDE Serial Monitor was set to a different one. This causes the ESP32 to output valid data that the monitor displays as garbage characters (e.g., `ÿ ÿ ÿ`).

**Fix applied:**
```cpp
Serial.begin(115200);  // in setup()
```
And in Arduino IDE → Serial Monitor → bottom-right dropdown → select **115200 baud**.

---

## 🔴 Problem 2: Crashes / freezes (random reboot or freeze)

There were multiple crash causes:

### 2a. No Watchdog timer
If the ESP32 hangs (e.g., WiFi connect freezes, HTTP request gets stuck), it would freeze indefinitely and show garbage or stop responding.

**Fix applied — Hardware Watchdog:**
```cpp
esp_task_wdt_init(30, true);  // Reboot if stuck > 30 seconds
esp_task_wdt_add(NULL);
// inside loop():
esp_task_wdt_reset();         // "I'm alive" ping every loop()
```

### 2b. HTTP request hanging forever
If the Supabase server took too long to respond, the sketch would freeze.

**Fix applied — HTTP timeout:**
```cpp
http.setTimeout(8000);        // Give up after 8 seconds
http.addHeader("Connection", "close");  // Don't leave sockets open
http.end();                   // Always clean up
```

### 2c. WiFi sleeping / dropping connection
ESP32 WiFi power-saving mode can cause random packet loss.

**Fix applied:**
```cpp
WiFi.setSleep(false);  // Disable WiFi sleep mode
```

### 2d. ADC2 conflict with WiFi
**Critical ESP32 hardware bug:** ADC2 pins (GPIO 0, 2, 4, 12–15, 25–27) **do not work** when WiFi is active. They return garbage values.

**Fix applied:** Use **GPIO 34** (ADC1 only — always use ADC1 with WiFi).

---

## 🔴 Problem 3: Inaccurate data — shows power when appliance is OFF

This is the most common CT sensor issue. Three sub-problems:

### 3a. ADC noise floor
Even with no load, the CT sensor + ADC circuit picks up a tiny AC hum from the mains wire (capacitive coupling). This tiny signal when converted to watts can show 5–50W even with everything off.

**Fix applied — Noise threshold:**
```cpp
const float NOISE_THRESHOLD = 10.0f;  // Watts
// If measured < 10W → show 0W (appliance is OFF)
if (watts < NOISE_THRESHOLD) watts = 0.0f;
```
Tune this — if your circuit is noisier, increase to 15 or 20.

### 3b. Wrong DC bias (midpoint)
The CT sensor outputs AC current centered at 0A. Your voltage divider shifts this to ~1.65V (midpoint of 3.3V). If the calibration is wrong, every reading is offset.

**Fix applied — Auto-calibration on boot:**
```cpp
// Reads 2000 samples with no load → finds the true DC center
void calibrateAdcBias() { ... }
```
This runs once at startup (before your appliances turn on ideally).

### 3c. Too few ADC samples
If you only took 10–50 ADC samples, you might capture an incomplete AC cycle (50Hz = 20ms period). This gives wildly varying values.

**Fix applied — 1000 samples per reading:**
```cpp
const int ADC_SAMPLES = 1000;  // ~500ms of 50Hz waveform = 25 full cycles
```
Proper RMS (root mean square) math:
```cpp
double rmsAdc = sqrt(sumOfSquares / ADC_SAMPLES);
```

---

## ⚙️ Circuit Wiring

```
Mains Live Wire
      │
   [CT Sensor coil — clamp around single wire]
      │
  Jack Tip ─────────┬──── 10kΩ ──── 3.3V
                    │
                 33Ω burden
                    │
  Jack Sleeve ──────┴──── 10kΩ ──── GND
                    │
                  GPIO 34 (ADC)
```

> **Important:** Clamp CT sensor around ONE wire only (Live or Neutral, not both). If both, fields cancel and you read 0.

---

## 🔧 Arduino IDE Setup

### Libraries Required (install via Library Manager):
- **ArduinoJson** by Benoit Blanchon (version ≥ 6.x)
- **ESP32 board** in Board Manager: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

### Board Settings:
- Board: **ESP32 Dev Module**
- Upload Speed: **115200**
- CPU Frequency: **240 MHz**
- Port: Your COM port (check Device Manager)

### Serial Monitor:
- Baud Rate: **115200** ← must match `Serial.begin(115200)` in sketch

---

## 🎛️ Tuning `CALIBRATION` factor

If your ESP32 reads 1200W but your energy meter shows 1000W:

```
CALIBRATION = Reference Reading / ESP32 Reading
CALIBRATION = 1000 / 1200 = 0.833
```

Change in sketch:
```cpp
const float CALIBRATION = 0.833f;
```

---

## 📊 What you'll see in Serial Monitor

```
╔══════════════════════════════╗
║   PowerPaise ESP32 Firmware   ║
╚══════════════════════════════╝
[Cal] Calibrating ADC midpoint... midpoint = 2051 (ideal ≈ 2048)
[WiFi] Connecting to 'MyWiFi'..........
[WiFi] Connected! IP: 192.168.1.105  RSSI: -54 dBm
[Sensor] 0.0 W  |  kWh today: 0.000  |  WiFi: OK
[Sensor] 0.0 W  |  kWh today: 0.000  |  WiFi: OK
[Sensor] 1847.3 W  |  kWh today: 0.000  |  WiFi: OK    ← appliance turned on
...
[HTTP] POST → https://yfbpuqwotfjpjiakncmf.supabase.co/functions/v1/...
[HTTP] ✅ Success (200): {"reading":{"id":...,"watts":1847,"kwhToday":0.062}}
```
