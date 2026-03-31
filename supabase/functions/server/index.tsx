import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
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
const PREFIX = "powerpaise:reading:";
const APPLIANCE_PREFIX = "powerpaise:appliance:";
const POLL_SECONDS = 120;

// ─── Helper: generate next watts from previous ────────────────────────────────
function generateNextWatts(prevWatts: number): number {
  const delta = prevWatts * (0.07 * (Math.random() - 0.35));
  return Math.round(Math.max(700, Math.min(3400, prevWatts + delta)));
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/make-server-091ae39b/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── GET /readings — fetch all stored readings (sorted, last 12) ──────────────
app.get("/make-server-091ae39b/readings", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    // Sort by key (which embeds timestamp ms) ascending
    const sorted = (items as any[])
      .sort((a: any, b: any) => {
        const ka = a.__key || "";
        const kb = b.__key || "";
        return ka.localeCompare(kb);
      })
      .map((item: any) => item.value ?? item)
      .slice(-12);
    return c.json({ readings: sorted });
  } catch (err) {
    console.log("Error fetching readings:", err);
    return c.json({ error: `Failed to fetch readings: ${err}` }, 500);
  }
});

// ─── POST /readings — store a new reading ────────────────────────────────────
app.post("/make-server-091ae39b/readings", async (c) => {
  try {
    const body = await c.req.json();
    const { watts, kwhToday } = body;
    if (watts == null || kwhToday == null) {
      return c.json({ error: "watts and kwhToday are required" }, 400);
    }
    const now = new Date();
    const key = `${PREFIX}${now.getTime()}`;
    const reading = {
      id: now.getTime(),
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      watts: Math.round(watts),
      kwhToday: parseFloat(parseFloat(kwhToday).toFixed(3)),
      createdAt: now.toISOString(),
    };
    await kv.set(key, reading);
    return c.json({ reading });
  } catch (err) {
    console.log("Error storing reading:", err);
    return c.json({ error: `Failed to store reading: ${err}` }, 500);
  }
});

// ─── POST /readings/seed — seed 8 historical readings if DB is empty ──────────
app.post("/make-server-091ae39b/readings/seed", async (c) => {
  try {
    const existing = await kv.getByPrefix(PREFIX);
    if ((existing as any[]).length > 0) {
      return c.json({ message: "Already seeded", count: (existing as any[]).length });
    }

    const wattsSeed = [1480, 1630, 1910, 2200, 2370, 2080, 1960, 2280];
    let kwh = 5.8;
    const now = Date.now();
    const readings = [];

    for (let i = 0; i < wattsSeed.length; i++) {
      const ts = now - (wattsSeed.length - 1 - i) * POLL_SECONDS * 1000;
      const w = wattsSeed[i] + Math.round((Math.random() - 0.5) * 100);
      kwh += (w / 1000) * (POLL_SECONDS / 3600);
      const t = new Date(ts);
      const reading = {
        id: ts,
        time: t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        watts: w,
        kwhToday: parseFloat(kwh.toFixed(3)),
        createdAt: t.toISOString(),
      };
      await kv.set(`${PREFIX}${ts}`, reading);
      readings.push(reading);
    }

    return c.json({ message: "Seeded successfully", count: readings.length, readings });
  } catch (err) {
    console.log("Error seeding readings:", err);
    return c.json({ error: `Failed to seed readings: ${err}` }, 500);
  }
});

// ─── GET /stats — calculate statistics from readings ──────────────────────────
app.get("/make-server-091ae39b/stats", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.id - b.id);

    if (readings.length === 0) {
      return c.json({ error: "No readings found" }, 404);
    }

    const latestReading = readings[readings.length - 1];
    const RATE_PER_UNIT = 7.2;
    const DAYS_ELAPSED = 22;
    const DAYS_IN_MONTH = 30;

    // Calculate stats
    const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
    const projMonthlyKwh = avgDailyKwh * DAYS_IN_MONTH;
    const currentMonthBill = Math.round(projMonthlyKwh * RATE_PER_UNIT);
    const todayCost = parseFloat((latestReading.kwhToday * RATE_PER_UNIT).toFixed(1));

    // For monthly comparison, simulate last month as 10% higher
    const lastMonthBill = Math.round(currentMonthBill * 1.15);
    const savedThisMonth = lastMonthBill - currentMonthBill;

    const stats = {
      currentMonthBill,
      unitsUsed: Math.round(projMonthlyKwh),
      avgDailyKwh: parseFloat(avgDailyKwh.toFixed(2)),
      savedThisMonth,
      todayCost,
      kwhToday: latestReading.kwhToday,
    };

    return c.json(stats);
  } catch (err) {
    console.log("Error calculating stats:", err);
    return c.json({ error: `Failed to calculate stats: ${err}` }, 500);
  }
});

// ─── GET /appliances — return appliance breakdown (only Light) ────────────────
app.get("/make-server-091ae39b/appliances", async (c) => {
  try {
    // Fetch user-defined appliances
    const applianceItems = await kv.getByPrefix(APPLIANCE_PREFIX);
    const userAppliances = (applianceItems as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));

    // If user has defined appliances, return them with calculated costs
    if (userAppliances.length > 0) {
      const items = await kv.getByPrefix(PREFIX);
      const readings = (items as any[])
        .map((item: any) => item.value ?? item)
        .sort((a: any, b: any) => a.id - b.id);

      if (readings.length === 0) {
        return c.json({ error: "No readings found" }, 404);
      }

      const latestReading = readings[readings.length - 1];
      const RATE_PER_UNIT = 7.2;
      const DAYS_ELAPSED = 22;
      const DAYS_IN_MONTH = 30;

      const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
      const projMonthlyKwh = avgDailyKwh * DAYS_IN_MONTH;
      const monthlyCost = Math.round(projMonthlyKwh * RATE_PER_UNIT);

      // Calculate cost for each appliance based on percentage
      const appliances = userAppliances.map((app: any) => ({
        id: app.id,
        name: app.name,
        percentage: app.percentage,
        cost: Math.round((monthlyCost * app.percentage) / 100),
        color: app.color,
      }));

      return c.json({ appliances });
    }

    // Default: return Light appliance at 100%
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.id - b.id);

    if (readings.length === 0) {
      return c.json({ error: "No readings found" }, 404);
    }

    const latestReading = readings[readings.length - 1];
    const RATE_PER_UNIT = 7.2;
    const DAYS_ELAPSED = 22;
    const DAYS_IN_MONTH = 30;

    const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
    const projMonthlyKwh = avgDailyKwh * DAYS_IN_MONTH;
    const monthlyCost = Math.round(projMonthlyKwh * RATE_PER_UNIT);

    const appliances = [
      {
        id: "default-light",
        name: "Light",
        percentage: 100,
        cost: monthlyCost,
        color: "#3B82F6",
      },
    ];

    return c.json({ appliances });
  } catch (err) {
    console.log("Error fetching appliances:", err);
    return c.json({ error: `Failed to fetch appliances: ${err}` }, 500);
  }
});

// ─── POST /appliances — add a new appliance ────────────────────────────────────
app.post("/make-server-091ae39b/appliances", async (c) => {
  try {
    const body = await c.req.json();
    const { name, percentage, color } = body;

    if (!name || percentage == null || !color) {
      return c.json({ error: "name, percentage, and color are required" }, 400);
    }

    if (percentage < 0 || percentage > 100) {
      return c.json({ error: "percentage must be between 0 and 100" }, 400);
    }

    const id = `appliance-${Date.now()}`;
    const appliance = {
      id,
      name,
      percentage: parseFloat(percentage),
      color,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`${APPLIANCE_PREFIX}${id}`, appliance);
    return c.json({ appliance });
  } catch (err) {
    console.log("Error adding appliance:", err);
    return c.json({ error: `Failed to add appliance: ${err}` }, 500);
  }
});

// ─── PUT /appliances/:id — update an appliance ─────────────────────────────────
app.put("/make-server-091ae39b/appliances/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { name, percentage, color } = body;

    if (!name || percentage == null || !color) {
      return c.json({ error: "name, percentage, and color are required" }, 400);
    }

    if (percentage < 0 || percentage > 100) {
      return c.json({ error: "percentage must be between 0 and 100" }, 400);
    }

    const key = `${APPLIANCE_PREFIX}${id}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json({ error: "Appliance not found" }, 404);
    }

    const appliance = {
      id,
      name,
      percentage: parseFloat(percentage),
      color,
      createdAt: (existing as any).createdAt,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(key, appliance);
    return c.json({ appliance });
  } catch (err) {
    console.log("Error updating appliance:", err);
    return c.json({ error: `Failed to update appliance: ${err}` }, 500);
  }
});

// ─── DELETE /appliances/:id — delete an appliance ──────────────────────────────
app.delete("/make-server-091ae39b/appliances/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const key = `${APPLIANCE_PREFIX}${id}`;
    
    const existing = await kv.get(key);
    if (!existing) {
      return c.json({ error: "Appliance not found" }, 404);
    }

    await kv.del(key);
    return c.json({ message: "Appliance deleted successfully" });
  } catch (err) {
    console.log("Error deleting appliance:", err);
    return c.json({ error: `Failed to delete appliance: ${err}` }, 500);
  }
});

// ─── GET /ai-tips — generate AI tips based on real usage ───────────────────────
app.get("/make-server-091ae39b/ai-tips", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.id - b.id);

    if (readings.length === 0) {
      return c.json({ error: "No readings found" }, 404);
    }

    const latestReading = readings[readings.length - 1];
    const RATE_PER_UNIT = 7.2;
    const DAYS_ELAPSED = 22;
    const DAYS_IN_MONTH = 30;

    const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
    const projMonthlyKwh = avgDailyKwh * DAYS_IN_MONTH;
    const monthlyCost = Math.round(projMonthlyKwh * RATE_PER_UNIT);

    // Get appliances to calculate personalized tips
    const applianceItems = await kv.getByPrefix(APPLIANCE_PREFIX);
    const userAppliances = (applianceItems as any[])
      .map((item: any) => item.value ?? item)
      .filter((app: any) => app.percentage > 0);

    // Calculate potential savings based on actual usage
    const tips = [];
    
    // Tip 1: Based on highest consuming appliance
    if (userAppliances.length > 0) {
      const topAppliance = userAppliances.sort((a: any, b: any) => b.percentage - a.percentage)[0];
      const applianceCost = Math.round((monthlyCost * topAppliance.percentage) / 100);
      const potentialSaving = Math.round(applianceCost * 0.25); // 25% saving potential
      
      tips.push({
        icon: 'ThermometerSnowflake',
        title: `Optimize ${topAppliance.name} Usage`,
        description: `Your ${topAppliance.name} consumes ${topAppliance.percentage}% of your electricity. Consider reducing usage during peak hours.`,
        savings: potentialSaving,
        priority: 'high',
      });
    }

    // Tip 2: Peak hour avoidance (calculated from current usage)
    const peakHourSaving = Math.round(monthlyCost * 0.18); // 18% potential saving
    tips.push({
      icon: 'AlertTriangle',
      title: 'Avoid Peak Hours',
      description: 'Run heavy appliances before 6 PM or after 10 PM when tariff is lower.',
      savings: peakHourSaving,
      priority: 'high',
    });

    // Tip 3: LED switch potential (if lights exist)
    const lightAppliance = userAppliances.find((app: any) => 
      app.name.toLowerCase().includes('light') || app.name.toLowerCase().includes('bulb')
    );
    if (lightAppliance) {
      const lightCost = Math.round((monthlyCost * lightAppliance.percentage) / 100);
      const ledSaving = Math.round(lightCost * 0.75); // 75% saving with LED
      tips.push({
        icon: 'Sun',
        title: 'Switch to LED Bulbs',
        description: 'LED bulbs use 75% less energy than traditional bulbs and last 25x longer.',
        savings: ledSaving,
        priority: 'medium',
      });
    }

    // Tip 4: Standby power waste
    const standbyWaste = Math.round(monthlyCost * 0.10); // 10% typical standby waste
    tips.push({
      icon: 'Tv',
      title: 'Eliminate Standby Power Waste',
      description: 'Switch off electronics at the power strip. Standby mode wastes 10% of electricity.',
      savings: standbyWaste,
      priority: 'low',
    });

    // Tip 5: Off-peak pre-cooling (if AC exists)
    const acAppliance = userAppliances.find((app: any) => 
      app.name.toLowerCase().includes('ac') || app.name.toLowerCase().includes('air')
    );
    if (acAppliance) {
      const acCost = Math.round((monthlyCost * acAppliance.percentage) / 100);
      const preCoolSaving = Math.round(acCost * 0.15); // 15% saving
      tips.push({
        icon: 'Clock',
        title: 'Pre-cool Before Peak Hours',
        description: 'Cool your room at 5 PM (off-peak) to reduce AC use during peak hours.',
        savings: preCoolSaving,
        priority: 'medium',
      });
    }

    // Tip 6: Temperature optimization
    tips.push({
      icon: 'Droplets',
      title: 'Optimize Appliance Settings',
      description: 'Set refrigerator to 3-4°C and freezer to -18°C. Each degree colder wastes 5% energy.',
      savings: Math.round(monthlyCost * 0.08),
      priority: 'medium',
    });

    // Calculate total potential savings
    const totalSavings = tips.reduce((sum, tip) => sum + tip.savings, 0);
    const savingsPercentage = Math.round((totalSavings / monthlyCost) * 100);

    return c.json({
      tips: tips.slice(0, 6), // Return top 6 tips
      totalPotentialSavings: totalSavings,
      savingsPercentage,
      currentMonthlyBill: monthlyCost,
    });
  } catch (err) {
    console.log("Error generating AI tips:", err);
    return c.json({ error: `Failed to generate AI tips: ${err}` }, 500);
  }
});

// ─── GET /user-stats — get user achievement stats ──────────────────────────────
app.get("/make-server-091ae39b/user-stats", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.id - b.id);

    if (readings.length === 0) {
      return c.json({ error: "No readings found" }, 404);
    }

    const latestReading = readings[readings.length - 1];
    const RATE_PER_UNIT = 7.2;
    const DAYS_ELAPSED = 22;

    // Calculate current month stats
    const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
    const currentMonthUnits = Math.round(avgDailyKwh * 30);
    const currentMonthCost = Math.round(currentMonthUnits * RATE_PER_UNIT);

    // Simulated previous month (15% higher than current)
    const prevMonthUnits = Math.round(currentMonthUnits * 1.15);
    const prevMonthCost = Math.round(prevMonthUnits * RATE_PER_UNIT);

    // Calculate savings
    const unitsSaved = prevMonthUnits - currentMonthUnits;
    const moneySaved = prevMonthCost - currentMonthCost;

    // Calculate total lifetime savings (simulate 3 months of data)
    const lifetimeSavings = Math.round(moneySaved * 2.4); // 2.4 months worth

    // Calculate streak (days since first reading)
    const firstReading = readings[0];
    const firstDate = new Date(firstReading.ts);
    const latestDate = new Date(latestReading.ts);
    const daysDiff = Math.floor((latestDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const streak = Math.max(1, daysDiff);

    // Calculate badges earned based on real data
    const badges = [
      {
        icon: 'Sparkles',
        name: 'Energy Hero',
        description: 'Save 15% or more from previous month',
        earned: unitsSaved > 0 && ((unitsSaved / prevMonthUnits) * 100) >= 15,
        progress: unitsSaved > 0 ? Math.min(Math.round((unitsSaved / prevMonthUnits) * 100 / 15 * 100), 100) : 0,
      },
      {
        icon: 'Flame',
        name: '7-Day Streak',
        description: 'Check app daily for 7 days',
        earned: streak >= 7,
        progress: Math.min(Math.round((streak / 7) * 100), 100),
      },
      {
        icon: 'Award',
        name: 'First Week Complete',
        description: 'Track your usage for a full week',
        earned: readings.length >= 7,
        progress: Math.min(Math.round((readings.length / 7) * 100), 100),
      },
      {
        icon: 'TrendingUp',
        name: 'Early Adopter',
        description: 'Start tracking your electricity usage',
        earned: true,
        progress: 100,
      },
      {
        icon: 'Users',
        name: 'Data Collector',
        description: 'Collect 30 days of meter readings',
        earned: readings.length >= 30,
        progress: Math.min(Math.round((readings.length / 30) * 100), 100),
      },
      {
        icon: 'Coins',
        name: '₹500 Saver',
        description: 'Save ₹500 in total',
        earned: lifetimeSavings >= 500,
        progress: Math.min(Math.round((lifetimeSavings / 500) * 100), 100),
      },
    ];

    const earnedBadges = badges.filter(b => b.earned).length;

    return c.json({
      streak,
      lifetimeSavings,
      badges,
      earnedBadges,
      totalBadges: badges.length,
      currentMonthUnits,
      unitsSaved,
      savingsPercentage: prevMonthUnits > 0 ? Math.round((unitsSaved / prevMonthUnits) * 100) : 0,
    });
  } catch (err) {
    console.log("Error fetching user stats:", err);
    return c.json({ error: `Failed to fetch user stats: ${err}` }, 500);
  }
});

// ─── GET /leaderboard — get community leaderboard ───────────────────────────────
app.get("/make-server-091ae39b/leaderboard", async (c) => {
  try {
    const items = await kv.getByPrefix(PREFIX);
    const readings = (items as any[])
      .map((item: any) => item.value ?? item)
      .sort((a: any, b: any) => a.id - b.id);

    if (readings.length === 0) {
      return c.json({ error: "No readings found" }, 404);
    }

    const latestReading = readings[readings.length - 1];
    const RATE_PER_UNIT = 7.2;
    const DAYS_ELAPSED = 22;

    const avgDailyKwh = latestReading.kwhToday / DAYS_ELAPSED;
    const currentMonthUnits = Math.round(avgDailyKwh * 30);
    const prevMonthUnits = Math.round(currentMonthUnits * 1.15);
    const userSavings = Math.round((prevMonthUnits - currentMonthUnits) * RATE_PER_UNIT);

    // Generate simulated leaderboard based on user's performance
    const leaderboard = [
      { rank: 1, name: 'Rajesh Kumar', area: 'Kalyani, Block A', units: Math.round(currentMonthUnits * 0.80), savings: Math.round(userSavings * 1.4) },
      { rank: 2, name: 'Priya Sharma', area: 'Kalyani, Block C', units: Math.round(currentMonthUnits * 0.87), savings: Math.round(userSavings * 1.3) },
      { rank: 3, name: 'Amit Patel', area: 'Kalyani, Block B', units: Math.round(currentMonthUnits * 0.93), savings: Math.round(userSavings * 1.1) },
      { rank: 4, name: 'You (Kalyani)', area: 'Kalyani, Block A', units: currentMonthUnits, savings: userSavings, isCurrentUser: true },
      { rank: 5, name: 'Sneha Gupta', area: 'Kalyani, Block D', units: Math.round(currentMonthUnits * 1.07), savings: Math.round(userSavings * 0.88) },
      { rank: 6, name: 'Vikram Singh', area: 'Kalyani, Block C', units: Math.round(currentMonthUnits * 1.13), savings: Math.round(userSavings * 0.81) },
    ];

    return c.json({
      leaderboard,
      userRank: 4,
      spotsToTop: 3,
    });
  } catch (err) {
    console.log("Error fetching leaderboard:", err);
    return c.json({ error: `Failed to fetch leaderboard: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);