import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wifi, WifiOff, RefreshCw, Clock, TrendingUp, TrendingDown,
  Minus, Zap, IndianRupee, CalendarDays, FlameKindling,
  CheckCircle2, AlertCircle, Info, Activity,
} from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";

// ─── Constants ────────────────────────────────────────────────────────────────
const RATE_PER_UNIT   = 7.2;   // ₹ per kWh (WBSEDCL)
const DB_POLL_MS      = 30_000; // poll Supabase every 30 s (frontend reads only)
const OUTLIER_WATTS   = 100;    // readings above this are flagged as sensor errors

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS  = { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` };

// ─── Types ────────────────────────────────────────────────────────────────────
interface Reading {
  id: number;
  time: string;         // IST HH:MM:SS from server
  watts: number;
  kwhToday: number;     // cumulative kWh odometer
  createdAt?: string;
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────
function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 260, H = 48, P = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = Math.max(max - min, 0.5); // avoid flat-line div-by-zero

  const pts = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = H - P - ((v - min) / rng) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ptsStr = pts.join(" ");
  const last   = pts[pts.length - 1].split(",");
  const area   = `M${pts[0]} L${ptsStr} L${last[0]},${H} L${P},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3B82F6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <polyline points={ptsStr} fill="none" stroke="#3B82F6" strokeWidth="2.2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Current value dot */}
      <circle cx={last[0]} cy={last[1]} r="4" fill="#10B981" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Row in the data-feed log ─────────────────────────────────────────────────
function FeedRow({ r, isLatest, prevWatts, newFlash }: {
  r: Reading; isLatest: boolean; prevWatts: number | null; newFlash: boolean;
}) {
  const diff = prevWatts != null ? r.watts - prevWatts : 0;
  const up   = diff > 1;
  const dn   = diff < -1;
  return (
    <motion.div
      initial={isLatest && newFlash ? { opacity: 0, x: -12 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
        isLatest
          ? "bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800"
          : "bg-slate-50 dark:bg-slate-800/60"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isLatest ? "bg-blue-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"}`} />
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">{r.time}</span>
        {isLatest && (
          <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
          {r.kwhToday.toFixed(5)} kWh
        </span>
        <div className="flex items-center gap-1">
          {up  && <TrendingUp   className="w-3 h-3 text-orange-500" />}
          {dn  && <TrendingDown className="w-3 h-3 text-green-500"  />}
          {!up && !dn && <Minus className="w-3 h-3 text-slate-400"  />}
          <span className={`text-xs font-bold ${
            up ? "text-orange-600 dark:text-orange-400"
            : dn ? "text-green-600 dark:text-green-400"
            : "text-slate-600 dark:text-slate-300"
          }`}>
            {r.watts} W
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LiveDataMonitor() {
  const [readings,  setReadings]  = useState<Reading[]>([]);
  const [countdown, setCountdown] = useState(DB_POLL_MS / 1000);
  const [connected, setConnected] = useState(false);
  const [spinning,  setSpinning]  = useState(false);
  const [newFlash,  setNewFlash]  = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [liveTime,  setLiveTime]  = useState("");

  const countRef  = useRef(DB_POLL_MS / 1000);
  const readRef   = useRef(readings);
  readRef.current = readings;

  // ── IST clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () =>
      setLiveTime(new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata", hour12: false,
      }) + " IST");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch readings from Supabase (GET only — sensor posts, we just read) ───
  const fetchReadings = useCallback(async (): Promise<Reading[]> => {
    const res  = await fetch(`${BASE_URL}/readings?t=${Date.now()}`, { headers: HEADERS, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "fetch failed");
    return (data.readings ?? []) as Reading[];
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchReadings();
        setReadings(rows);
        setConnected(true);
      } catch (err) {
        console.log("LiveDataMonitor init:", err);
        setConnected(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchReadings]);

  // ── 30-second poll — compare hashes to detect new readings ────────────────
  useEffect(() => {
    const tick = setInterval(async () => {
      countRef.current -= 1;
      if (countRef.current <= 0) {
        try {
          const rows = await fetchReadings();
          // Only update state if data changed (compare last id)
          const prevLast = readRef.current[readRef.current.length - 1];
          const newLast  = rows[rows.length - 1];
          if (newLast?.id !== prevLast?.id) {
            setReadings(rows);
            setNewFlash(true);
            setTimeout(() => setNewFlash(false), 1500);
            // Notify Dashboard immediately
            window.dispatchEvent(new CustomEvent("live-data-updated"));
          }
          setConnected(true);
        } catch (err) {
          console.log("Poll error:", err);
          setConnected(false);
        }
        countRef.current = DB_POLL_MS / 1000;
      }
      setCountdown(countRef.current);
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchReadings]);

  // ── Manual refresh ─────────────────────────────────────────────────────────
  const refresh = async () => {
    setSpinning(true);
    try {
      const rows = await fetchReadings();
      const prevLast = readRef.current[readRef.current.length - 1];
      const newLast  = rows[rows.length - 1];
      if (newLast?.id !== prevLast?.id) {
        setReadings(rows);
        setNewFlash(true);
        setTimeout(() => setNewFlash(false), 1500);
        window.dispatchEvent(new CustomEvent("live-data-updated"));
      }
      setConnected(true);
    } catch (err) {
      console.log("Refresh error:", err);
      setConnected(false);
    }
    countRef.current = DB_POLL_MS / 1000;
    setCountdown(DB_POLL_MS / 1000);
    setTimeout(() => setSpinning(false), 700);
  };

  const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
  const ss = String(countdown % 60).padStart(2, "0");

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
            <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <span className="text-white font-bold text-sm tracking-widest">LIVE</span>
          <span className="text-slate-400 text-xs">· Connecting to Supabase…</span>
        </div>
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading sensor data…</p>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (readings.length === 0) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-amber-400 opacity-75" />
                <span className="relative rounded-full h-2.5 w-2.5 bg-amber-400" />
              </span>
              <span className="text-white font-bold text-sm tracking-widest">LIVE</span>
              <span className="text-slate-400 text-xs">· Waiting for sensor</span>
            </div>
            <div className="flex items-center gap-2">
              {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              <div className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5">
                <Clock className="w-3 h-3 text-slate-300" />
                <span className="text-xs text-slate-200 font-mono">{mm}:{ss}</span>
              </div>
              <button onClick={refresh}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors active:scale-90">
                <RefreshCw className={`w-3 h-3 text-white ${spinning ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          {liveTime && <p className="text-[10px] text-slate-400 font-mono mt-1.5">{liveTime}</p>}
        </div>
        <div className="px-4 py-8 text-center space-y-3">
          <Activity className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="font-bold text-slate-700 dark:text-slate-300">No sensor readings yet</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            The sensor posts data every 120 s via <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">POST /readings</code>.
            Bill tracking starts from the first reading.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 text-white">
              <p className="text-[10px] opacity-80">Proj. Monthly Bill</p>
              <p className="text-xl font-bold">₹0</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-3 text-white">
              <p className="text-[10px] opacity-80">Accumulated kWh</p>
              <p className="text-xl font-bold">0.00000</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values (all from real Supabase data) ───────────────────────────
  const curr   = readings[readings.length - 1];
  const prev   = readings.length >= 2 ? readings[readings.length - 2] : curr;
  const last5  = readings.slice(-5);

  // Silently filter outliers for projection (mirrors server-side logic)
  const validReadings  = readings.filter(r => r.watts > 0 && r.watts <= OUTLIER_WATTS);
  const projReadings   = validReadings.length >= 1 ? validReadings : readings;

  // Watts-based projection using only valid readings (silent — no UI warning)
  const avgWatts       = Math.round(projReadings.reduce((s, r) => s + r.watts, 0) / projReadings.length);
  const projMonthlyKwh = (avgWatts / 1000) * 24 * 30;
  const avgMonthlyBill = Math.round(projMonthlyKwh * RATE_PER_UNIT);
  const avgDailyKwh    = (avgWatts / 1000) * 24;
  const totalKwh       = curr.kwhToday;
  const accCost        = parseFloat((totalKwh * RATE_PER_UNIT).toFixed(4));

  const wDiff    = curr.watts - prev.watts;
  const wDiffPct = Math.abs(prev.watts > 0 ? (wDiff / prev.watts) * 100 : 0).toFixed(1);
  const verdict: "up" | "down" | "flat" =
    Math.abs(wDiff) <= 1 ? "flat" : wDiff > 0 ? "up" : "down";

  const verdictMap = {
    up:   { label: "Higher than prev",  color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800", icon: TrendingUp,   emoji: "🔴", pill: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300" },
    down: { label: "Lower than prev",   color: "text-green-600  dark:text-green-400",  bg: "bg-green-50  dark:bg-green-950/40",  border: "border-green-200  dark:border-green-800",  icon: TrendingDown, emoji: "🟢", pill: "bg-green-100  dark:bg-green-900  text-green-700  dark:text-green-300"  },
    flat: { label: "Stable",            color: "text-slate-600  dark:text-slate-300",  bg: "bg-slate-50  dark:bg-slate-800/40",  border: "border-slate-200  dark:border-slate-700",  icon: Minus,        emoji: "🟡", pill: "bg-slate-100  dark:bg-slate-700  text-slate-700  dark:text-slate-300"  },
  }[verdict];
  const VerdictIcon = verdictMap.icon;

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">

      {/* ═══ HEADER ═══ */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
              <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-white font-bold text-sm tracking-widest">LIVE</span>
            <span className="text-slate-400 text-xs">· Supabase DB (read-only)</span>
          </div>
          <div className="flex items-center gap-2">
            {connected
              ? <Wifi    className="w-3.5 h-3.5 text-emerald-400" />
              : <WifiOff className="w-3.5 h-3.5 text-red-400"     />}
            <div className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5">
              <Clock className="w-3 h-3 text-slate-300" />
              <span className="text-xs text-slate-200 font-mono">{mm}:{ss}</span>
            </div>
            <button onClick={refresh}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors active:scale-90"
              title="Fetch latest readings now">
              <RefreshCw className={`w-3 h-3 text-white ${spinning ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-slate-400 font-mono">{liveTime}</span>
          {newFlash && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-[10px] text-emerald-400 font-semibold">
              ✓ New sensor data received
            </motion.span>
          )}
        </div>
      </div>

      {/* ═══ LIVE READING ═══ */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
          Latest Sensor Reading · {curr.time} IST
        </p>
        <div className="flex items-end justify-between">
          <AnimatePresence mode="wait">
            <motion.div key={curr.watts}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              className="flex items-end gap-2">
              <span className="text-slate-900 dark:text-white"
                style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px" }}>
                {curr.watts}
              </span>
              <span className="text-slate-400 dark:text-slate-500 mb-1 text-lg">W</span>
            </motion.div>
          </AnimatePresence>
          <div className="text-right">
            <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${verdictMap.pill}`}>
              <VerdictIcon className="w-3 h-3" />
              {wDiffPct}%
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">avg {avgWatts} W session</p>
          </div>
        </div>

        {/* Sparkline */}
        <div className="mt-2">
          <Spark data={readings.map(r => r.watts)} />
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-slate-400">{readings[0]?.time}</span>
            <span className="text-[9px] text-slate-400 font-medium">{readings.length} readings</span>
            <span className="text-[9px] text-slate-400">{curr.time}</span>
          </div>
        </div>
      </div>

      {/* ═══ SUPABASE FEED ═══ */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
          Supabase Feed · Last {last5.length} Transmissions
        </p>
        <div className="space-y-1.5">
          {[...last5].reverse().map((r, i) => {
            const prevR = [...last5].reverse()[i + 1];
            return (
              <FeedRow
                key={r.id}
                r={r}
                isLatest={i === 0}
                prevWatts={prevR?.watts ?? null}
                newFlash={newFlash && i === 0}
              />
            );
          })}
        </div>
      </div>

      {/* ═══ REAL CALCULATIONS ═══ */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          Real-Time Calculations
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 text-white">
            <div className="flex items-center gap-1.5 mb-1">
              <IndianRupee className="w-3.5 h-3.5 opacity-80" />
              <span className="text-[10px] opacity-90 font-medium">Proj. Monthly Bill</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              ₹{avgMonthlyBill.toLocaleString("en-IN")}
            </p>
            <p className="text-[9px] opacity-70 mt-1">{projMonthlyKwh.toFixed(3)} kWh × ₹{RATE_PER_UNIT}</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-3 text-white">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarDays className="w-3.5 h-3.5 opacity-80" />
              <span className="text-[10px] opacity-90 font-medium">Proj. Daily kWh</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              {avgDailyKwh.toFixed(4)} <span style={{ fontSize: 12 }}>kWh</span>
            </p>
            <p className="text-[9px] opacity-70 mt-1">{avgWatts}W ÷ 1000 × 24h</p>
          </div>
        </div>

        {/* Formula breakdown */}
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" /> How the bill is calculated
          </p>
          {[
            { label: "Avg wattage (session)",    value: `${avgWatts} W`,                         icon: Zap            },
            { label: "Proj. daily consumption",  value: `${avgDailyKwh.toFixed(5)} kWh/day`,     icon: CalendarDays   },
            { label: "Proj. 30-day total",       value: `${projMonthlyKwh.toFixed(5)} kWh`,      icon: CalendarDays   },
            { label: "Rate (WBSEDCL slab-1)",    value: `₹${RATE_PER_UNIT}/kWh`,                 icon: IndianRupee    },
            { label: "Accumulated kWh (total)",  value: `${totalKwh.toFixed(5)} kWh`,            icon: FlameKindling  },
            { label: "Accumulated cost",         value: `₹${accCost}`,                           icon: IndianRupee    },
            { label: "Projected monthly bill",   value: `₹${avgMonthlyBill.toLocaleString("en-IN")}`, icon: IndianRupee },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="w-3 h-3 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{label}</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-200 flex-shrink-0">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ VERDICT ═══ */}
      <div className="px-4 pt-3 pb-4">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          Consumption Verdict
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Previous</p>
            <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }} className="text-slate-700 dark:text-slate-200">
              {prev.watts} W
            </p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{prev.time}</p>
          </div>
          <div className={`border rounded-xl p-3 text-center ${verdictMap.bg} ${verdictMap.border}`}>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">Current</p>
            <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }} className={verdictMap.color}>
              {curr.watts} W
            </p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{curr.time}</p>
          </div>
        </div>

        <motion.div key={verdict}
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className={`rounded-xl border p-4 ${verdictMap.bg} ${verdictMap.border}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{verdictMap.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <VerdictIcon className={`w-4 h-4 ${verdictMap.color}`} />
                <p className={`font-bold text-sm ${verdictMap.color}`}>{verdictMap.label}</p>
                {verdict !== "flat" && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${verdictMap.pill}`}>
                    {wDiffPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {verdict === "up"   ? "⚡ Check for additional appliances drawing power."
                  : verdict === "down" ? "✅ Power consumption dropped — good efficiency."
                  : "➡️ Steady draw — no spikes detected."}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1.5">
                For a 9W LED at ₹{RATE_PER_UNIT}/kWh — projected monthly bill: ₹{avgMonthlyBill}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-1.5">
            {connected
              ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              : <AlertCircle  className="w-3 h-3 text-red-500"     />}
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {connected ? "Supabase connected · read-only" : "Reconnecting…"}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            Next poll in {mm}:{ss}
          </span>
        </div>
      </div>
    </div>
  );
}