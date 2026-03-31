import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  IndianRupee,
  CalendarDays,
  FlameKindling,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

// ─── Constants ────────────────────────────────────────────────────────────────
const RATE_PER_UNIT  = 7.2;   // ₹ per kWh
const DAYS_ELAPSED   = 22;    // days into current month
const DAYS_IN_MONTH  = 30;
const POLL_SECONDS   = 120;   // Supabase poll interval

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS  = { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` };

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reading {
  id: number;
  time: string;
  watts: number;
  kwhToday: number;
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────
function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 260, H = 40, P = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = H - P - ((v - min) / rng) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = pts.split(" ").pop()!.split(",");
  const area = `M${pts.split(" ")[0]} L${pts} L${last[0]},${H} L${P},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 40 }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3B82F6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#3B82F6" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LiveDataMonitor() {
  const [readings, setReadings]   = useState<Reading[]>([]);
  const [countdown, setCountdown] = useState(POLL_SECONDS);
  const [connected, setConnected] = useState(false);
  const [spinning,  setSpinning]  = useState(false);
  const [newFlash,  setNewFlash]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  const countRef  = useRef(POLL_SECONDS);
  const readRef   = useRef(readings);
  readRef.current = readings;

  // ── Supabase: fetch readings ────────────────────────────────────────────────
  const fetchReadings = useCallback(async (): Promise<Reading[]> => {
    const res  = await fetch(`${BASE_URL}/readings`, { headers: HEADERS });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "fetch failed");
    return data.readings as Reading[];
  }, []);

  // ── Supabase: post a new reading ────────────────────────────────────────────
  const postReading = useCallback(async (prevReading: Reading): Promise<Reading> => {
    const delta   = prevReading.watts * (0.07 * (Math.random() - 0.35));
    const watts   = Math.round(Math.max(700, Math.min(3400, prevReading.watts + delta)));
    const kwhToday = parseFloat(
      (prevReading.kwhToday + (watts / 1000) * (POLL_SECONDS / 3600)).toFixed(3)
    );
    const res  = await fetch(`${BASE_URL}/readings`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ watts, kwhToday }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "post failed");
    return data.reading as Reading;
  }, []);

  // ── Supabase: seed if empty ─────────────────────────────────────────────────
  const seedIfEmpty = useCallback(async () => {
    await fetch(`${BASE_URL}/readings/seed`, { method: "POST", headers: HEADERS });
  }, []);

  // ── Init: seed + fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await seedIfEmpty();
        const rows = await fetchReadings();
        setReadings(rows);
        setConnected(true);
      } catch (err) {
        console.log("LiveDataMonitor init error:", err);
        setConnected(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchReadings, seedIfEmpty]);

  // ── Countdown + auto-poll ───────────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(async () => {
      countRef.current -= 1;
      if (countRef.current <= 0) {
        const last = readRef.current[readRef.current.length - 1];
        if (last) {
          try {
            await postReading(last);
            const rows = await fetchReadings();
            setReadings(rows);
            setNewFlash(true);
            setTimeout(() => setNewFlash(false), 1000);
            setConnected(true);
          } catch (err) {
            console.log("Poll error:", err);
            setConnected(false);
          }
        }
        countRef.current = POLL_SECONDS;
      }
      setCountdown(countRef.current);
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchReadings, postReading]);

  // ── Manual refresh ──────────────────────────────────────────────────────────
  const refresh = async () => {
    const last = readRef.current[readRef.current.length - 1];
    if (!last) return;
    setSpinning(true);
    try {
      await postReading(last);
      const rows = await fetchReadings();
      setReadings(rows);
      setNewFlash(true);
      setTimeout(() => setNewFlash(false), 1000);
      setConnected(true);
    } catch (err) {
      console.log("Refresh error:", err);
      setConnected(false);
    }
    countRef.current = POLL_SECONDS;
    setCountdown(POLL_SECONDS);
    setTimeout(() => setSpinning(false), 700);
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading || readings.length < 2) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-white">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-white font-bold text-sm tracking-widest">LIVE</span>
            <span className="text-slate-400 text-xs">· Supabase Realtime DB</span>
          </div>
        </div>
        <div className="px-4 py-8 flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
          <p className="text-sm text-slate-400">Connecting to Supabase…</p>
        </div>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const curr   = readings[readings.length - 1];
  const prev   = readings[readings.length - 2];
  const last5  = readings.slice(-5);

  const avgDailyKwh    = curr.kwhToday / DAYS_ELAPSED;
  const projMonthlyKwh = avgDailyKwh * DAYS_IN_MONTH;
  const avgMonthlyBill = Math.round(projMonthlyKwh * RATE_PER_UNIT);
  const todayCost      = parseFloat((curr.kwhToday * RATE_PER_UNIT).toFixed(1));
  const avgWatts       = Math.round(readings.reduce((s, r) => s + r.watts, 0) / readings.length);

  const wDiff    = curr.watts - prev.watts;
  const wDiffPct = Math.abs((wDiff / prev.watts) * 100).toFixed(1);
  const verdict: "up" | "down" | "flat" =
    Math.abs(wDiff) < 25 ? "flat" : wDiff > 0 ? "up" : "down";

  const verdictMap = {
    up:   { label: "More Consumption",  sub: `+${Math.abs(wDiff)} W vs prev reading`, color: "text-red-600",   bg: "bg-red-50",   border: "border-red-300",   icon: TrendingUp,   emoji: "🔴", pill: "bg-red-100 text-red-700"    },
    down: { label: "Less Consumption",  sub: `−${Math.abs(wDiff)} W vs prev reading`, color: "text-green-600", bg: "bg-green-50", border: "border-green-300", icon: TrendingDown, emoji: "🟢", pill: "bg-green-100 text-green-700" },
    flat: { label: "Stable",            sub: "Within ±25 W of prev reading",          color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", icon: Minus,        emoji: "🟡", pill: "bg-slate-100 text-slate-700" },
  }[verdict];
  const VerdictIcon = verdictMap.icon;

  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">

      {/* ═══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-white font-bold text-sm tracking-widest">LIVE</span>
            <span className="text-slate-400 text-xs">· Supabase Realtime DB</span>
          </div>
          <div className="flex items-center gap-2">
            {connected
              ? <Wifi    className="w-3.5 h-3.5 text-emerald-400" />
              : <WifiOff className="w-3.5 h-3.5 text-red-400"     />}
            <div className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5">
              <Clock className="w-3 h-3 text-slate-300" />
              <span className="text-xs text-slate-200 font-mono">{mm}:{ss}</span>
            </div>
            <button
              onClick={refresh}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors active:scale-90"
            >
              <RefreshCw className={`w-3 h-3 text-white transition-transform ${spinning ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 1 — LIVE READING ══════════════════════════════════════════ */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Current Reading · {curr.time}
        </p>
        <div className="flex items-end justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={curr.watts}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="flex items-end gap-2"
            >
              <span className="text-slate-900" style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px" }}>
                {(curr.watts / 1000).toFixed(2)}
              </span>
              <span className="text-slate-400 mb-1">kW</span>
            </motion.div>
          </AnimatePresence>

          <div className="text-right">
            <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${verdictMap.pill}`}>
              <VerdictIcon className="w-3 h-3" />
              {wDiffPct}%
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{curr.watts} W actual</p>
          </div>
        </div>

        {/* Sparkline */}
        <div className="mt-2">
          <Spark data={readings.map(r => r.watts)} />
          <div className="flex justify-between">
            <span className="text-[9px] text-slate-400">{readings[0].time}</span>
            <span className="text-[9px] text-slate-400">{curr.time}</span>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2 — SUPABASE FEED LOG ════════════════════════════════════ */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Supabase Data Feed · Last 5 Transmissions
        </p>
        <div className="space-y-1.5">
          {[...last5].reverse().map((r, i) => {
            const isLatest = i === 0;
            const prevR = [...last5].reverse()[i + 1];
            const diff = prevR ? r.watts - prevR.watts : 0;
            const up = diff > 25, dn = diff < -25;
            return (
              <AnimatePresence key={r.id}>
                <motion.div
                  initial={isLatest && newFlash ? { opacity: 0, x: -10 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${isLatest ? "bg-blue-50 border border-blue-200" : "bg-slate-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${isLatest ? "bg-blue-500" : "bg-slate-300"}`} />
                    <span className="text-xs font-mono text-slate-600">{r.time}</span>
                    {isLatest && (
                      <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-semibold">NEW</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{r.kwhToday.toFixed(2)} kWh</span>
                    <div className="flex items-center gap-1">
                      {up   && <TrendingUp   className="w-3 h-3 text-red-500"   />}
                      {dn   && <TrendingDown className="w-3 h-3 text-green-500" />}
                      {!up && !dn && <Minus  className="w-3 h-3 text-slate-400" />}
                      <span className={`text-xs font-semibold ${up ? "text-red-600" : dn ? "text-green-600" : "text-slate-500"}`}>
                        {r.watts} W
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 3 — CALCULATIONS ══════════════════════════════════════════ */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Calculated Statistics
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* Avg Monthly Bill */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 text-white">
            <div className="flex items-center gap-1.5 mb-1">
              <IndianRupee className="w-3.5 h-3.5 opacity-80" />
              <span className="text-[10px] opacity-90 font-medium">Avg Monthly Bill</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              ₹{avgMonthlyBill.toLocaleString("en-IN")}
            </p>
            <p className="text-[9px] opacity-70 mt-1">
              {projMonthlyKwh.toFixed(0)} units × ₹{RATE_PER_UNIT}
            </p>
          </div>

          {/* Avg Daily Consumption */}
          <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-3 text-white">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarDays className="w-3.5 h-3.5 opacity-80" />
              <span className="text-[10px] opacity-90 font-medium">Avg Daily Usage</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              {avgDailyKwh.toFixed(2)} <span style={{ fontSize: 13 }}>kWh</span>
            </p>
            <p className="text-[9px] opacity-70 mt-1">
              {curr.kwhToday.toFixed(2)} kWh ÷ {DAYS_ELAPSED} days
            </p>
          </div>
        </div>

        {/* Calculation breakdown rows */}
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" /> Formula Breakdown
          </p>
          {[
            { label: "Avg power (session)",  value: `${avgWatts} W`,                              icon: Zap           },
            { label: "Units used today",     value: `${curr.kwhToday.toFixed(2)} kWh`,            icon: FlameKindling },
            { label: "Avg daily units",      value: `${avgDailyKwh.toFixed(2)} kWh/day`,          icon: CalendarDays  },
            { label: "Projected 30-day",     value: `${projMonthlyKwh.toFixed(1)} kWh`,           icon: CalendarDays  },
            { label: "Today's cost so far",  value: `₹${todayCost}`,                              icon: IndianRupee   },
            { label: "Projected bill",       value: `₹${avgMonthlyBill.toLocaleString("en-IN")}`, icon: IndianRupee   },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-slate-400" />
                <span className="text-[11px] text-slate-600">{label}</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-900">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ SECTION 4 — COMPARISON VERDICT ════════════════════════════════════ */}
      <div className="px-4 pt-3 pb-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Consumption Verdict
        </p>

        {/* Side-by-side: previous vs current */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 mb-1">Previous Reading</p>
            <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }} className="text-slate-700">
              {prev.watts} W
            </p>
            <p className="text-[9px] text-slate-400 mt-1">{prev.time}</p>
          </div>
          <div className={`border rounded-xl p-3 text-center ${verdictMap.bg} ${verdictMap.border}`}>
            <p className="text-[10px] text-slate-500 mb-1">Current Reading</p>
            <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }} className={verdictMap.color}>
              {curr.watts} W
            </p>
            <p className="text-[9px] text-slate-400 mt-1">{curr.time}</p>
          </div>
        </div>

        {/* Verdict banner */}
        <motion.div
          key={verdict}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`rounded-xl border p-4 ${verdictMap.bg} ${verdictMap.border}`}
        >
          <div className="flex items-center gap-3">
            <div className="text-2xl">{verdictMap.emoji}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <VerdictIcon className={`w-4 h-4 ${verdictMap.color}`} />
                <p className={`font-bold text-sm ${verdictMap.color}`}>{verdictMap.label}</p>
                {verdict !== "flat" && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${verdictMap.pill}`}>
                    {wDiffPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{verdictMap.sub}</p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {verdict === "up"
                  ? "⚠️ Check AC, geyser or heavy appliances running simultaneously."
                  : verdict === "down"
                  ? "✅ Good efficiency. Your savings are reflecting in real-time."
                  : "➡️ Power draw is steady. No sudden spikes detected."}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Status bar */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-1.5">
            {connected
              ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              : <AlertCircle  className="w-3 h-3 text-red-500"     />}
            <span className="text-[10px] text-slate-400">
              {connected ? "Supabase connected" : "Reconnecting…"}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Next sync in {mm}:{ss}
          </span>
        </div>
      </div>
    </div>
  );
}