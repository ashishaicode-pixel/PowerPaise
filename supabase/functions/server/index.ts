import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";

const app = new Hono();

app.use('*', logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Constants ────────────────────────────────────────────────────────────────
const PREFIX           = "powerpaise:reading:";
const APPLIANCE_PREFIX = "powerpaise:appliance:";
const SENSOR_INTERVAL  = 120;          // seconds between sensor posts
const RATE_PER_UNIT    = 7.2;          // ₹ per kWh (WBSEDCL slab-1)
const CO2_PER_KWH      = 0.82;         // kg CO₂ per kWh (India grid factor)
// Max realistic wattage — readings above this are treated as sensor errors.
// For a 9W LED testing setup, 100W gives ample margin. Raise this if your
// household has higher-wattage appliances connected to the sensor.
const OUTLIER_WATTS    = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a UTC timestamp as IST HH:MM:SS */
function toISTTimeString(ts: number): string {
  const d = new Date(ts + 5.5 * 60 * 60 * 1000); // shift to UTC+5:30
  const h  = String(d.getUTCHours()).padStart(2, "0");
  const m  = String(d.getUTCMinutes()).padStart(2, "0");
  const s  = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Return today's date in IST as "YYYY-MM-DD" */
function todayIST(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/**
 * Core projection — uses AVERAGE WATTS (not kWh-ratio extrapolation).
 * This gives accurate realistic monthly bill regardless of how long
 * monitoring has been running (even just a few minutes).
 *
 * For a 9W LED:
 *   avgWatts = 9
 *   projMonthlyKwh = (9/1000) × 24 × 30 = 6.48 kWh
 *   bill = 6.48 × 7.2 = ₹46.66
 *
 * Outlier filtering: readings > OUTLIER_WATTS are excluded from projection
 * (they are sensor calibration errors, not real power draw).
 */
function calcStats(readings: any[]) {
  if (readings.length === 0) return null;

  const latest = readings[readings.length - 1];

  // ── Filter sensor-error readings for accurate projection ──────────────────
  const validReadings = readings.filter(
    (r: any) => (r.watts || 0) > 0 && (r.watts || 0) <= OUTLIER_WATTS
  );
  // Fallback to all readings only if every single reading is an outlier
  const projReadings  = validReadings.length >= 1 ? validReadings : readings;
  const outlierCount  = readings.length - projReadings.length;

  // Average watts across valid readings only
  const avgWatts = projReadings.reduce((s: number, r: any) => s + (r.watts || 0), 0) / projReadings.length;

  // Watts-based monthly projection (accurate for any monitoring duration)
  const projMonthlyKwh  = (avgWatts / 1000) * 24 * 30;
  const currentMonthBill = Math.round(projMonthlyKwh * RATE_PER_UNIT);

  // Avg daily kWh from watts
  const avgDailyKwh = (avgWatts / 1000) * 24;

  // Actual accumulated cost (from cumulative kWhToday odometer)
  const totalKwhAccumulated = latest.kwhToday || 0;
  const accumulatedCost     = parseFloat((totalKwhAccumulated * RATE_PER_UNIT).toFixed(4));

  // Today's kWh: filter readings by today's IST date
  const today = todayIST();
  const todayReadings = readings.filter((r: any) => {
    if (!r.createdAt) return false;
    const d = new Date(new Date(r.createdAt).getTime() + 5.5 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10) === today;
  });

  let kwhToday = 0;
  if (todayReadings.length > 1) {
    // Use ACTUAL time gaps between readings for accurate today-kWh
    for (let i = 1; i < todayReadings.length; i++) {
      const w      = todayReadings[i].watts || 0;
      const prevTs = new Date(todayReadings[i - 1].createdAt || 0).getTime();
      const currTs = new Date(todayReadings[i].createdAt || 0).getTime();
      const actualSec = prevTs > 0 && currTs > 0 ? (currTs - prevTs) / 1000 : SENSOR_INTERVAL;
      const safeSec   = Math.min(Math.max(actualSec, 10), 600);
      kwhToday += (w / 1000) * (safeSec / 3600);
    }
    kwhToday = parseFloat(kwhToday.toFixed(5));
  }

  const todayCost = parseFloat((kwhToday * RATE_PER_UNIT).toFixed(4));

  return {
    latest,
    latestWatts:       Math.round(latest.watts || 0),
    avgWatts:          Math.round(avgWatts),
    projMonthlyKwh:    parseFloat(projMonthlyKwh.toFixed(4)),
    currentMonthBill,
    avgDailyKwh:       parseFloat(avgDailyKwh.toFixed(5)),
    kwhToday,
    todayCost,
    totalKwhAccumulated,
    accumulatedCost,
    outlierCount,
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/health", (c) => c.json({ status: "ok" }));

// ─── GET /readings ─────────────────────────────────────────────────────────────
// Returns the most recent 20 readings (for sparkline + feed display).
app.get("/make-server-091ae39b/readings", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const sorted = (items as any[])
      .sort((a: any, b: any) => (a.__key || "").localeCompare(b.__key || ""))
      .map((item: any) => item.value ?? item)
      .slice(-20);
    return c.json({ readings: sorted, count: sorted.length });
  } catch (err) {
    console.log("Error fetching readings:", err);
    return c.json({ error: `Failed to fetch readings: ${err}` }, 500);
  }
});

// ─── POST /readings ────────────────────────────────────────────────────────────
// Called by the REAL sensor hardware every 120 seconds.
// The frontend should NEVER call this — only the sensor should.
app.post("/make-server-091ae39b/readings", async (c) => {
  try {
    const body = await c.req.json();
    const { watts } = body;

    if (watts == null || typeof watts !== "number") {
      return c.json({ error: "watts must be a number" }, 400);
    }
    if (watts < 0 || watts > 50000) {
      return c.json({ error: "watts out of expected range (0–50000)" }, 400);
    }

    // Load all existing readings to compute cumulative kWh (odometer)
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    const ts = Date.now();
    let kwhToday = 0;
    if (readings.length > 0) {
      const last     = readings[readings.length - 1];
      const lastTs   = last.id || (ts - SENSOR_INTERVAL * 1000);
      // Use ACTUAL elapsed time between readings for accurate kWh accumulation
      // This handles both real 120-s sensor and any irregular intervals.
      const elapsed  = (ts - lastTs) / 1000;                          // seconds
      const safeSec  = Math.min(Math.max(elapsed, 10), 600);          // clamp 10 s – 10 min
      kwhToday = (last.kwhToday || 0) + (watts / 1000) * (safeSec / 3600);
    }
    // First reading: kwhToday stays 0 (energy accumulates from the NEXT reading)

    const reading = {
      id:        ts,
      time:      toISTTimeString(ts),
      watts:     Math.round(watts),
      kwhToday:  parseFloat(kwhToday.toFixed(5)),
      createdAt: new Date(ts).toISOString(),
    };

    await kv.set(`${PREFIX}${ts}`, reading);
    console.log(`Sensor reading saved: ${watts}W, kwhTotal=${reading.kwhToday}`);
    return c.json({ reading });
  } catch (err) {
    console.log("Error adding reading:", err);
    return c.json({ error: `Failed to add reading: ${err}` }, 500);
  }
});

// ─── POST /readings/seed ───────────────────────────────────────────────────────
// Seeds realistic 9W LED readings only if the DB is completely empty.
// Uses actual timestamp gaps (120 s) for precise kWh accumulation.
app.post("/make-server-091ae39b/readings/seed", async (c) => {
  try {
    const existing = await kv.getByPrefix(PREFIX);
    if ((existing as any[]).length > 0) {
      return c.json({ message: "Already has data", count: (existing as any[]).length });
    }

    // 60 readings at exact 120-second intervals → 118 minutes of history ending NOW
    // kWh per reading = watts/1000 × 120/3600 = 9 × 0.0003 = 0.0003 kWh each
    // Total after 59 intervals: ~0.01770 kWh → cost ₹0.127  (realistic for ~2 h session)
    const wattValues = [
      9, 9, 8, 9, 10, 9, 9, 8, 9, 11,
      9, 10, 9, 8, 9, 9, 10, 9, 9, 8,
      9, 9, 10, 9, 8, 9, 11, 9, 9, 10,
      9, 8, 9, 9, 10, 9, 9, 8, 9, 10,
      9, 9, 8, 9, 10, 9, 9, 9, 8, 9,
      10, 9, 9, 8, 9, 11, 9, 10, 9, 9,
    ];
    const N   = wattValues.length;                // 60
    const now = Date.now();

    let kwhAccum = 0;
    const readings = [];
    for (let i = 0; i < N; i++) {
      const ts = now - (N - 1 - i) * SENSOR_INTERVAL * 1000; // exact 120 s steps
      const w  = wattValues[i];
      if (i > 0) {
        // Use actual step (SENSOR_INTERVAL seconds) — same formula as POST /readings
        kwhAccum += (w / 1000) * (SENSOR_INTERVAL / 3600);
      }
      const reading = {
        id:        ts,
        time:      toISTTimeString(ts),
        watts:     w,
        kwhToday:  parseFloat(kwhAccum.toFixed(5)),
        createdAt: new Date(ts).toISOString(),
      };
      await kv.set(`${PREFIX}${ts}`, reading);
      readings.push(reading);
    }
    return c.json({ message: "Seeded", count: readings.length });
  } catch (err) {
    console.log("Error seeding:", err);
    return c.json({ error: `Failed to seed: ${err}` }, 500);
  }
});

// ─── DELETE /readings/reset ───────────────────────────────────────────────────
app.delete("/make-server-091ae39b/readings/reset", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    await Promise.all(
      (items as any[]).map((item: any) =>
        kv.del(item.__key || `${PREFIX}${item.id}`)
      )
    );
    return c.json({ message: "All readings deleted", deletedCount: items.length });
  } catch (err) {
    console.log("Error resetting:", err);
    return c.json({ error: `Failed to reset: ${err}` }, 500);
  }
});

// ─── GET /stats ────────────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/stats", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) {
      return c.json({
        currentMonthBill: 0,
        unitsUsed:        0,
        avgDailyKwh:      0,
        savedThisMonth:   0,
        todayCost:        0,
        kwhToday:         0,
        latestWatts:      0,
        avgWatts:         0,
        totalKwhAccumulated: 0,
        accumulatedCost:  0,
        readingCount:     0,
      });
    }

    const s = calcStats(readings)!;

    // Comparison: last month simulated as 15% higher usage
    const lastMonthBill  = Math.round(s.currentMonthBill * 1.15);
    const savedThisMonth = Math.max(0, lastMonthBill - s.currentMonthBill);

    return c.json({
      currentMonthBill:    s.currentMonthBill,
      unitsUsed:           parseFloat(s.projMonthlyKwh.toFixed(3)),
      avgDailyKwh:         s.avgDailyKwh,
      savedThisMonth,
      todayCost:           s.todayCost,
      kwhToday:            s.kwhToday,
      latestWatts:         s.latestWatts,
      avgWatts:            s.avgWatts,
      totalKwhAccumulated: s.totalKwhAccumulated,
      accumulatedCost:     s.accumulatedCost,
      readingCount:        readings.length,
      outlierCount:        s.outlierCount,
    });
  } catch (err) {
    console.log("Error calculating stats:", err);
    return c.json({ error: `Failed to calculate stats: ${err}` }, 500);
  }
});

// ─── GET /appliances ──────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/appliances", async (c) => {
  try {
    const applianceItems = await kv.getByPrefix(APPLIANCE_PREFIX);
    const userAppliances = (applianceItems as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) {
      return c.json({ appliances: [] });
    }

    const s = calcStats(readings)!;
    const monthlyCost = Math.max(s.currentMonthBill, 1);

    if (userAppliances.length > 0) {
      const appliances = userAppliances.map((app: any) => ({
        id:         app.id,
        name:       app.name,
        percentage: app.percentage,
        cost:       Math.round((monthlyCost * app.percentage) / 100),
        color:      app.color,
      }));
      return c.json({ appliances });
    }

    // Default: single 9W LED at 100%
    return c.json({
      appliances: [{
        id:         "default-light",
        name:       "Light (9W LED)",
        percentage: 100,
        cost:       monthlyCost,
        color:      "#3B82F6",
      }],
    });
  } catch (err) {
    console.log("Error fetching appliances:", err);
    return c.json({ error: `Failed to fetch appliances: ${err}` }, 500);
  }
});

// ─── POST /appliances ─────────────────────────────────────────────────────────
app.post("/make-server-091ae39b/appliances", async (c) => {
  try {
    const { name, percentage, color } = await c.req.json();
    if (!name || percentage == null || !color) {
      return c.json({ error: "name, percentage, and color are required" }, 400);
    }
    const pct = parseFloat(percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return c.json({ error: "percentage must be 0–100" }, 400);
    }
    const id        = `appliance-${Date.now()}`;
    const appliance = { id, name, percentage: pct, color, createdAt: new Date().toISOString() };
    await kv.set(`${APPLIANCE_PREFIX}${id}`, appliance);
    return c.json({ appliance });
  } catch (err) {
    console.log("Error adding appliance:", err);
    return c.json({ error: `Failed to add appliance: ${err}` }, 500);
  }
});

// ─── PUT /appliances/:id ──────────────────────────────────────────────────────
app.put("/make-server-091ae39b/appliances/:id", async (c) => {
  try {
    const id  = c.req.param("id");
    const { name, percentage, color } = await c.req.json();
    if (!name || percentage == null || !color) {
      return c.json({ error: "name, percentage, and color are required" }, 400);
    }
    const key      = `${APPLIANCE_PREFIX}${id}`;
    const existing = await kv.get(key);
    if (!existing) return c.json({ error: "Appliance not found" }, 404);
    const appliance = {
      id, name,
      percentage: parseFloat(percentage),
      color,
      createdAt:  (existing as any).createdAt,
      updatedAt:  new Date().toISOString(),
    };
    await kv.set(key, appliance);
    return c.json({ appliance });
  } catch (err) {
    console.log("Error updating appliance:", err);
    return c.json({ error: `Failed to update appliance: ${err}` }, 500);
  }
});

// ─── DELETE /appliances/:id ───────────────────────────────────────────────────
app.delete("/make-server-091ae39b/appliances/:id", async (c) => {
  try {
    const id  = c.req.param("id");
    const key = `${APPLIANCE_PREFIX}${id}`;
    if (!(await kv.get(key))) return c.json({ error: "Appliance not found" }, 404);
    await kv.del(key);
    return c.json({ message: "Deleted" });
  } catch (err) {
    console.log("Error deleting appliance:", err);
    return c.json({ error: `Failed to delete appliance: ${err}` }, 500);
  }
});

// ─── GET /ai-tips ─────────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/ai-tips", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) return c.json({ error: "No readings" }, 404);

    const s           = calcStats(readings)!;
    const monthlyCost = Math.max(s.currentMonthBill, 1);

    const applianceItems = await kv.getByPrefix(APPLIANCE_PREFIX);
    const userAppliances = (applianceItems as any[])
      .map((item: any) => item.value ?? item)
      .filter((app: any) => app.percentage > 0);

    const tips: any[] = [];

    if (userAppliances.length > 0) {
      const top = userAppliances.sort((a: any, b: any) => b.percentage - a.percentage)[0];
      tips.push({
        icon:        "ThermometerSnowflake",
        title:       `Optimize ${top.name} Usage`,
        description: `Your ${top.name} consumes ${top.percentage}% of your electricity. Reduce idle usage during off-peak hours.`,
        savings:     Math.round((monthlyCost * top.percentage / 100) * 0.25),
        priority:    "high",
      });
    }

    tips.push({
      icon:        "AlertTriangle",
      title:       "Shift Load to Off-Peak Hours",
      description: `Run appliances before 6 PM or after 10 PM. WBSEDCL ToD tariff is lower outside peak hours.`,
      savings:     Math.round(monthlyCost * 0.18),
      priority:    "high",
    });
    tips.push({
      icon:        "Sun",
      title:       "Maximise Natural Daylight",
      description: `Your 9W LED uses ${s.avgWatts}W on average. Turn off lights when natural light is adequate — every hour off saves ₹${(9 / 1000 * RATE_PER_UNIT).toFixed(3)}.`,
      savings:     Math.round(monthlyCost * 0.12),
      priority:    "medium",
    });
    tips.push({
      icon:        "Tv",
      title:       "Eliminate Standby Drain",
      description: "Electronics in standby waste ~10% of your bill. Use smart power strips.",
      savings:     Math.round(monthlyCost * 0.10),
      priority:    "low",
    });
    tips.push({
      icon:        "Droplets",
      title:       "Refrigerator Temperature Setting",
      description: "Set fridge to 3–4 °C and freezer to −18 °C. Each extra degree costs 5% more energy.",
      savings:     Math.round(monthlyCost * 0.08),
      priority:    "medium",
    });

    const total   = tips.reduce((s, t) => s + t.savings, 0);
    const savePct = Math.round((total / monthlyCost) * 100);

    return c.json({
      tips:                  tips.slice(0, 5),
      totalPotentialSavings: total,
      savingsPercentage:     savePct,
      currentMonthlyBill:    monthlyCost,
    });
  } catch (err) {
    console.log("Error generating tips:", err);
    return c.json({ error: `Failed to generate tips: ${err}` }, 500);
  }
});

// ─── GET /user-stats ──────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/user-stats", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) return c.json({ error: "No readings" }, 404);

    const s            = calcStats(readings)!;
    const currentBill  = s.currentMonthBill;
    const lastMonthBill = Math.round(currentBill * 1.15);
    const moneySaved   = Math.max(0, lastMonthBill - currentBill);
    const lifetimeSavings = Math.round(moneySaved * 2.4);

    const firstDate  = new Date(readings[0].createdAt || Date.now());
    const latestDate = new Date(s.latest.createdAt   || Date.now());
    const daysDiff   = Math.max(1, Math.floor((latestDate.getTime() - firstDate.getTime()) / 86400000));
    const streak     = daysDiff;

    const badges = [
      {
        icon:        "TrendingUp",
        name:        "Early Adopter",
        description: "Started tracking electricity usage",
        earned:      true,
        progress:    100,
      },
      {
        icon:        "Flame",
        name:        "7-Day Streak",
        description: "Use the app for 7 days",
        earned:      streak >= 7,
        progress:    Math.min(Math.round((streak / 7) * 100), 100),
      },
      {
        icon:        "Award",
        name:        "Data Collector",
        description: "Log 20 sensor readings",
        earned:      readings.length >= 20,
        progress:    Math.min(Math.round((readings.length / 20) * 100), 100),
      },
      {
        icon:        "Sparkles",
        name:        "Energy Hero",
        description: "Save 15% vs previous month",
        earned:      moneySaved > 0 && (moneySaved / lastMonthBill) >= 0.15,
        progress:    moneySaved > 0 ? Math.min(Math.round((moneySaved / lastMonthBill / 0.15) * 100), 100) : 0,
      },
      {
        icon:        "Users",
        name:        "Community Member",
        description: "Join the Kalyani leaderboard",
        earned:      readings.length >= 5,
        progress:    Math.min(Math.round((readings.length / 5) * 100), 100),
      },
      {
        icon:        "Coins",
        name:        "₹50 Saver",
        description: "Save ₹50 total",
        earned:      lifetimeSavings >= 50,
        progress:    Math.min(Math.round((lifetimeSavings / 50) * 100), 100),
      },
    ];

    return c.json({
      streak,
      lifetimeSavings,
      badges,
      earnedBadges: badges.filter(b => b.earned).length,
      totalBadges:  badges.length,
    });
  } catch (err) {
    console.log("Error fetching user-stats:", err);
    return c.json({ error: `Failed to fetch user stats: ${err}` }, 500);
  }
});

// ─── GET /leaderboard ─────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/leaderboard", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) return c.json({ error: "No readings" }, 404);

    const s           = calcStats(readings)!;
    const userBill    = s.currentMonthBill;
    const userUnits   = parseFloat(s.projMonthlyKwh.toFixed(2));
    const userSavings = Math.max(0, Math.round(userBill * 0.15));

    const names  = ["Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sneha Gupta", "Vikram Singh", "Anita Reddy"];
    const blocks  = ["Block A", "Block B", "Block C", "Block D"];
    const seed    = Math.floor(Date.now() / 86400000); // changes daily
    const shuffle = names.sort(() => ((seed % 7) > 3 ? 1 : -1));

    const leaderboard = [
      { rank: 1, name: shuffle[0], area: `Kalyani, ${blocks[0]}`, units: +(userUnits * 0.7).toFixed(2),  savings: Math.round(userSavings * 1.8) },
      { rank: 2, name: shuffle[1], area: `Kalyani, ${blocks[1]}`, units: +(userUnits * 0.82).toFixed(2), savings: Math.round(userSavings * 1.4) },
      { rank: 3, name: shuffle[2], area: `Kalyani, ${blocks[2]}`, units: +(userUnits * 0.91).toFixed(2), savings: Math.round(userSavings * 1.1) },
      { rank: 4, name: "You (Kalyani)", area: "Kalyani, Block A", units: userUnits, savings: userSavings, isCurrentUser: true },
      { rank: 5, name: shuffle[3], area: `Kalyani, ${blocks[3]}`, units: +(userUnits * 1.08).toFixed(2), savings: Math.round(userSavings * 0.7) },
      { rank: 6, name: shuffle[4], area: `Kalyani, ${blocks[0]}`, units: +(userUnits * 1.18).toFixed(2), savings: Math.round(userSavings * 0.5) },
    ];

    return c.json({ leaderboard, userRank: 4, spotsToTop: 3 });
  } catch (err) {
    console.log("Error fetching leaderboard:", err);
    return c.json({ error: `Failed to fetch leaderboard: ${err}` }, 500);
  }
});

// ─── GET /monthly-report ──────────────────────────────────────────────────────
app.get("/make-server-091ae39b/monthly-report", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    if (readings.length === 0) return c.json({ error: "No readings" }, 404);

    const s            = calcStats(readings)!;
    const currentUnits = parseFloat(s.projMonthlyKwh.toFixed(3));
    const currentCost  = s.currentMonthBill;
    const prevUnits    = parseFloat((currentUnits * 1.15).toFixed(3));
    const prevCost     = Math.round(prevUnits * RATE_PER_UNIT);
    const unitsSaved   = parseFloat((prevUnits - currentUnits).toFixed(3));
    const moneySaved   = prevCost - currentCost;
    const carbon       = parseFloat((unitsSaved * CO2_PER_KWH).toFixed(3));
    const reduction    = Math.round((unitsSaved / prevUnits) * 100);

    // Simulated 6-month trend using current usage as the baseline
    const monthLabels = ["Oct", "Nov", "Dec", "Jan", "Feb", "Apr"];
    const multipliers = [1.35, 1.28, 1.20, 1.12, 1.07, 1.00];
    const monthlyData = monthLabels.map((month, i) => ({
      month,
      units: parseFloat((currentUnits * multipliers[i]).toFixed(3)),
      cost:  Math.round(currentUnits * multipliers[i] * RATE_PER_UNIT),
    }));

    const avgUnits = parseFloat((monthlyData.reduce((s, m) => s + m.units, 0) / 6).toFixed(3));
    const avgCost  = Math.round(monthlyData.reduce((s, m) => s + m.cost, 0) / 6);

    return c.json({
      currentMonth: { units: currentUnits, cost: currentCost },
      savings:      { units: unitsSaved, money: moneySaved, carbon },
      monthlyData,
      averages:     { units: avgUnits, cost: avgCost },
      reduction,
    });
  } catch (err) {
    console.log("Error generating monthly-report:", err);
    return c.json({ error: `Failed to generate monthly report: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);