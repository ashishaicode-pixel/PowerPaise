import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

// ─── Supabase REST helper (uses built-in env vars, always available) ───────────
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function pgQuery(sql: string, params: unknown[] = []) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_sql`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ query: sql, params }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DB error: ${err}`);
  }
  return res.json();
}

// Direct table access via PostgREST (simpler and more reliable)
async function dbSelect(table: string, filter?: string) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter ? `?${filter}` : "?select=*"}`;
  const res = await fetch(url, {
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`DB select error: ${await res.text()}`);
  return res.json();
}

async function dbInsert(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB insert error: ${await res.text()}`);
  return res.json();
}

async function dbUpdate(table: string, filter: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method:  "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB update error: ${await res.text()}`);
  return res.json();
}

async function dbDelete(table: string, filter: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method:  "DELETE",
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`DB delete error: ${await res.text()}`);
  return true;
}

const app = new Hono().basePath("/make-server-091ae39b");

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
const SENSOR_INTERVAL = 120;
const RATE_PER_UNIT   = 7.2;
const CO2_PER_KWH     = 0.82;
const OUTLIER_WATTS   = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISTTimeString(ts: number): string {
  const d = new Date(ts + 5.5 * 60 * 60 * 1000);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function todayIST(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function calcStats(readings: any[]) {
  if (readings.length === 0) return null;
  const latest = readings[readings.length - 1];
  const validReadings = readings.filter((r: any) => (r.watts || 0) > 0 && (r.watts || 0) <= OUTLIER_WATTS);
  const projReadings  = validReadings.length >= 1 ? validReadings : readings;
  const outlierCount  = readings.length - projReadings.length;
  const avgWatts = projReadings.reduce((s: number, r: any) => s + (r.watts || 0), 0) / projReadings.length;
  const projMonthlyKwh   = (avgWatts / 1000) * 24 * 30;
  const currentMonthBill = Math.round(projMonthlyKwh * RATE_PER_UNIT);
  const avgDailyKwh      = (avgWatts / 1000) * 24;
  const totalKwhAccumulated = latest.kwh_today || 0;
  const accumulatedCost     = parseFloat((totalKwhAccumulated * RATE_PER_UNIT).toFixed(4));

  const today = todayIST();
  const todayReadings = readings.filter((r: any) => {
    if (!r.created_at) return false;
    const d = new Date(new Date(r.created_at).getTime() + 5.5 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10) === today;
  });

  let kwhToday = 0;
  if (todayReadings.length > 1) {
    for (let i = 1; i < todayReadings.length; i++) {
      const w        = todayReadings[i].watts || 0;
      const prevTs   = new Date(todayReadings[i - 1].created_at || 0).getTime();
      const currTs   = new Date(todayReadings[i].created_at || 0).getTime();
      const actualSec = prevTs > 0 && currTs > 0 ? (currTs - prevTs) / 1000 : SENSOR_INTERVAL;
      const safeSec   = Math.min(Math.max(actualSec, 10), 600);
      kwhToday += (w / 1000) * (safeSec / 3600);
    }
    kwhToday = parseFloat(kwhToday.toFixed(5));
  }

  const todayCost = parseFloat((kwhToday * RATE_PER_UNIT).toFixed(4));

  return {
    latest,
    latestWatts:           Math.round(latest.watts || 0),
    avgWatts:              Math.round(avgWatts),
    projMonthlyKwh:        parseFloat(projMonthlyKwh.toFixed(4)),
    currentMonthBill,
    avgDailyKwh:           parseFloat(avgDailyKwh.toFixed(5)),
    kwhToday,
    todayCost,
    totalKwhAccumulated,
    accumulatedCost,
    outlierCount,
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (c: any) => c.json({ status: "ok", storage: "postgresql" }));

// ─── GET /readings ─────────────────────────────────────────────────────────────
app.get("/readings", async (c: any) => {
  try {
    const rows = await dbSelect("sensor_readings", "select=*&order=id.asc&limit=20");
    // Map snake_case DB columns → camelCase for frontend compatibility
    const readings = rows.map((r: any) => ({
      id:        r.id,
      time:      r.time,
      watts:     r.watts,
      kwhToday:  r.kwh_today,
      createdAt: r.created_at,
    }));
    return c.json({ readings, count: readings.length });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── POST /readings ────────────────────────────────────────────────────────────
app.post("/readings", async (c: any) => {
  try {
    const body = await c.req.json();
    const { watts } = body;
    if (watts == null || typeof watts !== "number") return c.json({ error: "watts must be a number" }, 400);
    if (watts < 0 || watts > 50000) return c.json({ error: "watts out of range" }, 400);

    // Get last reading for kWh accumulation
    const lastRows = await dbSelect("sensor_readings", "select=*&order=id.desc&limit=1");
    const ts = Date.now();
    let kwhToday = 0;
    if (lastRows.length > 0) {
      const last    = lastRows[0];
      const lastTs  = last.id || (ts - SENSOR_INTERVAL * 1000);
      const elapsed = (ts - lastTs) / 1000;
      const safeSec = Math.min(Math.max(elapsed, 10), 600);
      kwhToday = (last.kwh_today || 0) + (watts / 1000) * (safeSec / 3600);
    }

    const reading = {
      id:         ts,
      time:       toISTTimeString(ts),
      watts:      Math.round(watts),
      kwh_today:  parseFloat(kwhToday.toFixed(5)),
      created_at: new Date(ts).toISOString(),
    };
    await dbInsert("sensor_readings", reading);
    console.log(`Saved: ${watts}W, kwhToday=${reading.kwh_today}`);
    return c.json({ reading });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── DELETE /readings/reset ───────────────────────────────────────────────────
app.delete("/readings/reset", async (c: any) => {
  try {
    await dbDelete("sensor_readings", "id=gte.0");
    return c.json({ message: "All readings deleted" });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── POST /readings/seed ───────────────────────────────────────────────────────
app.post("/readings/seed", async (c: any) => {
  try {
    const existing = await dbSelect("sensor_readings", "select=id&limit=1");
    if (existing.length > 0) return c.json({ message: "Already has data", count: existing.length });

    const wattValues = [
      9, 9, 8, 9, 10, 9, 9, 8, 9, 11,
      9, 10, 9, 8, 9, 9, 10, 9, 9, 8,
      9, 9, 10, 9, 8, 9, 11, 9, 9, 10,
      9, 8, 9, 9, 10, 9, 9, 8, 9, 10,
      9, 9, 8, 9, 10, 9, 9, 9, 8, 9,
      10, 9, 9, 8, 9, 11, 9, 10, 9, 9,
    ];
    const N   = wattValues.length;
    const now = Date.now();
    let kwhAccum = 0;

    for (let i = 0; i < N; i++) {
      const ts = now - (N - 1 - i) * SENSOR_INTERVAL * 1000;
      const w  = wattValues[i];
      if (i > 0) kwhAccum += (w / 1000) * (SENSOR_INTERVAL / 3600);
      await dbInsert("sensor_readings", {
        id:         ts,
        time:       toISTTimeString(ts),
        watts:      w,
        kwh_today:  parseFloat(kwhAccum.toFixed(5)),
        created_at: new Date(ts).toISOString(),
      });
    }
    return c.json({ message: "Seeded", count: N });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /stats ────────────────────────────────────────────────────────────────
app.get("/stats", async (c: any) => {
  try {
    const readings = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) {
      return c.json({
        currentMonthBill: 0, unitsUsed: 0, avgDailyKwh: 0,
        savedThisMonth: 0, todayCost: 0, kwhToday: 0,
        latestWatts: 0, avgWatts: 0, totalKwhAccumulated: 0,
        accumulatedCost: 0, readingCount: 0,
      });
    }
    const s = calcStats(readings)!;
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
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /appliances ──────────────────────────────────────────────────────────
app.get("/appliances", async (c: any) => {
  try {
    const userAppliances = await dbSelect("appliances", "select=*&order=created_at.asc");
    const readings       = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) return c.json({ appliances: [] });

    const s = calcStats(readings)!;
    const monthlyCost = Math.max(s.currentMonthBill, 1);

    if (userAppliances.length > 0) {
      return c.json({
        appliances: userAppliances.map((app: any) => ({
          id: app.id, name: app.name, percentage: app.percentage,
          cost: Math.round((monthlyCost * app.percentage) / 100), color: app.color,
        })),
      });
    }
    return c.json({
      appliances: [{ id: "default-light", name: "Light (9W LED)", percentage: 100, cost: monthlyCost, color: "#3B82F6" }],
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── POST /appliances ─────────────────────────────────────────────────────────
app.post("/appliances", async (c: any) => {
  try {
    const { name, percentage, color } = await c.req.json();
    if (!name || percentage == null || !color) return c.json({ error: "name, percentage, and color required" }, 400);
    const pct = parseFloat(percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) return c.json({ error: "percentage 0–100" }, 400);
    const id = `appliance-${Date.now()}`;
    const [appliance] = await dbInsert("appliances", { id, name, percentage: pct, color, created_at: new Date().toISOString() });
    return c.json({ appliance });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── PUT /appliances/:id ──────────────────────────────────────────────────────
app.put("/appliances/:id", async (c: any) => {
  try {
    const id = c.req.param("id");
    const { name, percentage, color } = await c.req.json();
    if (!name || percentage == null || !color) return c.json({ error: "name, percentage, and color required" }, 400);
    const [appliance] = await dbUpdate("appliances", `id=eq.${id}`, {
      name, percentage: parseFloat(percentage), color, updated_at: new Date().toISOString(),
    });
    if (!appliance) return c.json({ error: "Not found" }, 404);
    return c.json({ appliance });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── DELETE /appliances/:id ───────────────────────────────────────────────────
app.delete("/appliances/:id", async (c: any) => {
  try {
    const id = c.req.param("id");
    await dbDelete("appliances", `id=eq.${id}`);
    return c.json({ message: "Deleted" });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /ai-tips ─────────────────────────────────────────────────────────────
app.get("/ai-tips", async (c: any) => {
  try {
    const readings = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) return c.json({ error: "No readings" }, 404);
    const s = calcStats(readings)!;
    const monthlyCost = Math.max(s.currentMonthBill, 1);
    const userAppliances = (await dbSelect("appliances", "select=*")).filter((a: any) => a.percentage > 0);

    const tips: any[] = [];
    if (userAppliances.length > 0) {
      const top = userAppliances.sort((a: any, b: any) => b.percentage - a.percentage)[0];
      tips.push({
        icon: "ThermometerSnowflake", title: `Optimize ${top.name} Usage`,
        description: `Your ${top.name} consumes ${top.percentage}% of your electricity. Reduce idle usage during off-peak hours.`,
        savings: Math.round((monthlyCost * top.percentage / 100) * 0.25), priority: "high",
      });
    }
    tips.push({ icon: "AlertTriangle", title: "Shift Load to Off-Peak Hours", description: `Run appliances before 6 PM or after 10 PM. WBSEDCL ToD tariff is lower outside peak hours.`, savings: Math.round(monthlyCost * 0.18), priority: "high" });
    tips.push({ icon: "Sun", title: "Maximise Natural Daylight", description: `Your LED uses ${s.avgWatts}W on average. Turn off lights when natural light is adequate.`, savings: Math.round(monthlyCost * 0.12), priority: "medium" });
    tips.push({ icon: "Tv", title: "Eliminate Standby Drain", description: "Electronics in standby waste ~10% of your bill. Use smart power strips.", savings: Math.round(monthlyCost * 0.10), priority: "low" });
    tips.push({ icon: "Droplets", title: "Refrigerator Temperature Setting", description: "Set fridge to 3–4 °C and freezer to −18 °C. Each extra degree costs 5% more energy.", savings: Math.round(monthlyCost * 0.08), priority: "medium" });

    const total   = tips.reduce((s, t) => s + t.savings, 0);
    const savePct = Math.round((total / monthlyCost) * 100);
    return c.json({ tips: tips.slice(0, 5), totalPotentialSavings: total, savingsPercentage: savePct, currentMonthlyBill: monthlyCost });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /user-stats ──────────────────────────────────────────────────────────
app.get("/user-stats", async (c: any) => {
  try {
    const readings = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) return c.json({ error: "No readings" }, 404);
    const s = calcStats(readings)!;
    const currentBill     = s.currentMonthBill;
    const lastMonthBill   = Math.round(currentBill * 1.15);
    const moneySaved      = Math.max(0, lastMonthBill - currentBill);
    const lifetimeSavings = Math.round(moneySaved * 2.4);
    const firstDate       = new Date(readings[0].created_at || Date.now());
    const latestDate      = new Date(s.latest.created_at || Date.now());
    const streak          = Math.max(1, Math.floor((latestDate.getTime() - firstDate.getTime()) / 86400000));

    const badges = [
      { icon: "TrendingUp", name: "Early Adopter", description: "Started tracking electricity usage", earned: true, progress: 100 },
      { icon: "Flame", name: "7-Day Streak", description: "Use the app for 7 days", earned: streak >= 7, progress: Math.min(Math.round((streak / 7) * 100), 100) },
      { icon: "Award", name: "Data Collector", description: "Log 20 sensor readings", earned: readings.length >= 20, progress: Math.min(Math.round((readings.length / 20) * 100), 100) },
      { icon: "Sparkles", name: "Energy Hero", description: "Save 15% vs previous month", earned: moneySaved > 0 && (moneySaved / lastMonthBill) >= 0.15, progress: moneySaved > 0 ? Math.min(Math.round((moneySaved / lastMonthBill / 0.15) * 100), 100) : 0 },
      { icon: "Users", name: "Community Member", description: "Join the Kalyani leaderboard", earned: readings.length >= 5, progress: Math.min(Math.round((readings.length / 5) * 100), 100) },
      { icon: "Coins", name: "₹50 Saver", description: "Save ₹50 total", earned: lifetimeSavings >= 50, progress: Math.min(Math.round((lifetimeSavings / 50) * 100), 100) },
    ];
    return c.json({ streak, lifetimeSavings, badges, earnedBadges: badges.filter(b => b.earned).length, totalBadges: badges.length });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /leaderboard ─────────────────────────────────────────────────────────
app.get("/leaderboard", async (c: any) => {
  try {
    const readings = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) return c.json({ error: "No readings" }, 404);
    const s = calcStats(readings)!;
    const userBill    = s.currentMonthBill;
    const userUnits   = parseFloat(s.projMonthlyKwh.toFixed(2));
    const userSavings = Math.max(0, Math.round(userBill * 0.15));
    const names  = ["Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sneha Gupta", "Vikram Singh", "Anita Reddy"];
    const blocks = ["Block A", "Block B", "Block C", "Block D"];
    const leaderboard = [
      { rank: 1, name: names[0], area: `Kalyani, ${blocks[0]}`, units: +(userUnits * 0.7).toFixed(2),  savings: Math.round(userSavings * 1.8) },
      { rank: 2, name: names[1], area: `Kalyani, ${blocks[1]}`, units: +(userUnits * 0.82).toFixed(2), savings: Math.round(userSavings * 1.4) },
      { rank: 3, name: names[2], area: `Kalyani, ${blocks[2]}`, units: +(userUnits * 0.91).toFixed(2), savings: Math.round(userSavings * 1.1) },
      { rank: 4, name: "You (Kalyani)", area: "Kalyani, Block A", units: userUnits, savings: userSavings, isCurrentUser: true },
      { rank: 5, name: names[3], area: `Kalyani, ${blocks[3]}`, units: +(userUnits * 1.08).toFixed(2), savings: Math.round(userSavings * 0.7) },
      { rank: 6, name: names[4], area: `Kalyani, ${blocks[0]}`, units: +(userUnits * 1.18).toFixed(2), savings: Math.round(userSavings * 0.5) },
    ];
    return c.json({ leaderboard, userRank: 4, spotsToTop: 3 });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /monthly-report ──────────────────────────────────────────────────────
app.get("/monthly-report", async (c: any) => {
  try {
    const readings = await dbSelect("sensor_readings", "select=*&order=id.asc");
    if (readings.length === 0) return c.json({ error: "No readings" }, 404);
    const s = calcStats(readings)!;
    const currentUnits = parseFloat(s.projMonthlyKwh.toFixed(3));
    const currentCost  = s.currentMonthBill;
    const prevUnits    = parseFloat((currentUnits * 1.15).toFixed(3));
    const prevCost     = Math.round(prevUnits * RATE_PER_UNIT);
    const unitsSaved   = parseFloat((prevUnits - currentUnits).toFixed(3));
    const moneySaved   = prevCost - currentCost;
    const carbon       = parseFloat((unitsSaved * CO2_PER_KWH).toFixed(3));
    const reduction    = Math.round((unitsSaved / prevUnits) * 100);
    const monthLabels  = ["Oct", "Nov", "Dec", "Jan", "Feb", "Apr"];
    const multipliers  = [1.35, 1.28, 1.20, 1.12, 1.07, 1.00];
    const monthlyData  = monthLabels.map((month, i) => ({
      month,
      units: parseFloat((currentUnits * multipliers[i]).toFixed(3)),
      cost:  Math.round(currentUnits * multipliers[i] * RATE_PER_UNIT),
    }));
    const avgUnits = parseFloat((monthlyData.reduce((s, m) => s + m.units, 0) / 6).toFixed(3));
    const avgCost  = Math.round(monthlyData.reduce((s, m) => s + m.cost, 0) / 6);
    return c.json({ currentMonth: { units: currentUnits, cost: currentCost }, savings: { units: unitsSaved, money: moneySaved, carbon }, monthlyData, averages: { units: avgUnits, cost: avgCost }, reduction });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

Deno.serve(app.fetch);