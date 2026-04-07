import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';
import { BillMeter } from '../components/BillMeter';
import { ApplianceDonutChart } from '../components/ApplianceDonutChart';
import { LiveDataMonitor } from '../components/LiveDataMonitor';
import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useLanguage } from '../contexts/LanguageContext';
import {
  TrendingDown, Zap, CreditCard, Leaf, AlertTriangle,
  X, Smartphone, Building2, Check, Plus, Sun,
} from 'lucide-react';
import { toast } from 'sonner';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS  = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };
const POLL_MS  = 30_000;

interface Stats {
  currentMonthBill:    number;
  unitsUsed:           number;
  avgDailyKwh:         number;
  savedThisMonth:      number;
  todayCost:           number;
  kwhToday:            number;
  latestWatts:         number;
  avgWatts:            number;
  totalKwhAccumulated: number;
  accumulatedCost:     number;
  readingCount:        number;
}

// ─── Payment bottom-sheet ─────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: 'upi',  icon: '📱', name: 'UPI / PhonePe',     detail: 'user@ybl',       type: 'upi'  },
  { id: 'sbi',  icon: '🏦', name: 'SBI Bank Account',  detail: 'XXXX XXXX 4821', type: 'bank' },
  { id: 'card', icon: '💳', name: 'HDFC Credit Card',  detail: 'XXXX 9342',      type: 'card' },
];

function PaymentSheet({ bill, onClose }: { bill: number; onClose: () => void }) {
  const [selected, setSelected] = useState('upi');
  const [paying,   setPaying]   = useState(false);

  const pay = () => {
    setPaying(true);
    setTimeout(() => {
      setPaying(false);
      toast.success(`₹${bill.toFixed(2)} paid via ${PAYMENT_METHODS.find(m => m.id === selected)?.name}! ✅`);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl overflow-hidden shadow-2xl pb-safe"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-500" /> Pay Electricity Bill
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="px-5 pt-4 pb-8 space-y-4">
          {/* Bill card */}
          <div className="bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl p-5 text-white">
            <p className="text-sm opacity-80 mb-1">Amount Due · WBSEDCL</p>
            <p className="text-4xl font-black tracking-tight">₹{bill.toFixed(2)}</p>
            <p className="text-xs opacity-70 mt-2">Projected based on live 9W LED sensor data</p>
          </div>

          {/* Payment methods */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Choose Payment Method</p>
          <div className="space-y-2">
            {PAYMENT_METHODS.map(m => (
              <button key={m.id} onClick={() => setSelected(m.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${
                  selected === m.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-blue-300'
                }`}>
                <span className="text-2xl">{m.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{m.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{m.detail}</p>
                </div>
                {selected === m.id && <Check className="w-4 h-4 text-blue-500" />}
              </button>
            ))}
          </div>

          <button onClick={() => toast.info('Add payment method — coming soon!')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-blue-300 transition-colors text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add new method
          </button>

          {/* Pay button */}
          <button onClick={pay} disabled={paying}
            className={`w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              paying ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 shadow-lg'
            }`}>
            {paying
              ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
              : <><Smartphone className="w-5 h-5" /> Pay ₹{bill.toFixed(2)} Now</>
            }
          </button>
          <p className="text-center text-xs text-slate-400">🔒 Secured by RBI-compliant 256-bit encryption</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Solar bottom-sheet ───────────────────────────────────────────────────────
const SOLAR_PLANS = [
  {
    name: 'Starter Solar', capacity: '1 kW', price: '₹45,000', emi: '₹1,250/mo',
    saves: '₹350/mo', color: 'from-blue-500 to-cyan-500',
    features: ['1 Rooftop panel', '10-year warranty', 'Grid tie-in', 'Mobile monitoring'],
  },
  {
    name: 'Home Solar', capacity: '3 kW', price: '₹1,20,000', emi: '₹3,100/mo',
    saves: '₹1,100/mo', color: 'from-green-500 to-emerald-500', best: true,
    features: ['3 Panels + inverter', '25-year warranty', 'Battery storage', 'Sell back to grid'],
  },
  {
    name: 'Premium Solar', capacity: '5 kW', price: '₹1,90,000', emi: '₹4,900/mo',
    saves: '₹2,000/mo', color: 'from-amber-500 to-orange-500',
    features: ['5 Panels + AI optimizer', '30-year warranty', 'Zero-export control', 'Smart monitoring'],
  },
];

function SolarSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl overflow-hidden shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" /> Solar Plans
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-4" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ☀️ Peak sunlight hours (10 AM – 4 PM) can power your home for free. Solar panels pay for themselves in 4–6 years in West Bengal.
          </p>
          {SOLAR_PLANS.map(plan => (
            <div key={plan.name} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative">
              {plan.best && (
                <div className="absolute top-3 right-3 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                  POPULAR
                </div>
              )}
              <div className={`bg-gradient-to-r ${plan.color} p-4 text-white`}>
                <p className="text-xs font-bold opacity-80 uppercase tracking-wider">{plan.capacity} System</p>
                <p className="text-xl font-black mt-0.5">{plan.name}</p>
                <div className="flex items-end gap-4 mt-2">
                  <div>
                    <p className="text-[10px] opacity-75">One-time</p>
                    <p className="text-2xl font-black">{plan.price}</p>
                  </div>
                  <div>
                    <p className="text-[10px] opacity-75">EMI from</p>
                    <p className="text-base font-bold">{plan.emi}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[10px] opacity-75">Saves</p>
                    <p className="text-base font-black">{plan.saves}</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3">
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { toast.success(`Enquiry sent for ${plan.name}! Our team will call you in 24h. ☀️`); onClose(); }}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r ${plan.color} hover:opacity-90 transition-opacity active:scale-[0.98]`}>
                  Get Free Consultation →
                </button>
              </div>
            </div>
          ))}
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            MNRE-approved installers · Kalyani, West Bengal
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Data-quality banner (shown when corrupt/outlier readings are detected) ───
function DataQualityBanner({
  outlierCount, readingCount, latestWatts, onReset,
}: {
  outlierCount: number; readingCount: number; latestWatts: number; onReset: () => void;
}) {
  // Show banner if outliers are present OR if latestWatts looks unrealistic (>100W for a 9W LED)
  const rawSuspect = latestWatts > 100;
  if (outlierCount === 0 && !rawSuspect) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="bg-red-500 text-white rounded-full p-1.5 flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-red-800 dark:text-red-300">
            Sensor data anomaly detected
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1 leading-relaxed">
            {outlierCount > 0
              ? `${outlierCount} of ${readingCount} readings exceed 100W (suspicious for a 9W LED). The bill projection already filters these out — but clearing corrupt data gives cleaner history.`
              : `Live reading shows ${latestWatts}W — unusually high for a 9W LED. Bill projection uses filtered averages, so the displayed bill is still accurate.`
            }
          </p>
          <button
            onClick={onReset}
            className="mt-2.5 flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 px-3 py-1.5 rounded-lg transition-colors active:scale-[0.97]"
          >
            <Trash2 className="w-3 h-3" /> Clear all readings &amp; re-seed with 9W LED data
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Smart Consumption Status card ───────────────────────────────────────────
function SmartStatusCard({ stats }: { stats: Stats }) {
  const w   = stats.latestWatts || 0;
  const avg = stats.avgWatts    || 0;
  const pct = avg > 0 ? Math.round((w / avg) * 100) : 0;
  const status =
    avg === 0    ? 'waiting' :
    w > avg * 1.15 ? 'high'  :
    w < avg * 0.85 ? 'low'   : 'normal';

  const cfg = {
    waiting: { label: 'Waiting for data',    sub: 'Connect your sensor',                          color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800',   bar: 'bg-slate-400', icon: '⏳', pct: 0    },
    high:    { label: 'Above Average Usage', sub: `${w}W — ${pct}% of average (${avg}W)`,         color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40', bar: 'bg-orange-500', icon: '⚡', pct: Math.min(pct, 150) },
    normal:  { label: 'Normal Consumption',  sub: `${w}W — within range of average (${avg}W)`,    color: 'text-green-600  dark:text-green-400',  bg: 'bg-green-50  dark:bg-green-950/40',  bar: 'bg-green-500',  icon: '✅', pct },
    low:     { label: 'Efficient Usage',     sub: `${w}W — ${100 - pct}% below average (${avg}W)`, color: 'text-blue-600  dark:text-blue-400',   bg: 'bg-blue-50   dark:bg-blue-950/40',   bar: 'bg-blue-500',   icon: '🌱', pct },
  }[status];

  return (
    <div className={`rounded-2xl p-4 border border-slate-200 dark:border-slate-700 ${cfg.bg}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{cfg.icon}</span>
        <div>
          <p className={`font-bold text-sm ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{cfg.sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
          <motion.div className={`h-full rounded-full ${cfg.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(cfg.pct, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-10 text-right">{cfg.pct}%</span>
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
        Formula: avgWatts/1000 × 24 × 30 × ₹7.2 = ₹{stats.currentMonthBill}/mo projected
      </p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [showSolar,   setShowSolar]   = useState(false);
  const { t } = useLanguage();

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/stats`, { headers: HEADERS });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.log('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 30s poll
  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStats]);

  // Sync with LiveDataMonitor's events
  useEffect(() => {
    const onLive      = () => fetchStats();
    const onAppliance = () => setRefreshKey(k => k + 1);
    window.addEventListener('live-data-updated',  onLive);
    window.addEventListener('appliances-updated', onAppliance);
    return () => {
      window.removeEventListener('live-data-updated',  onLive);
      window.removeEventListener('appliances-updated', onAppliance);
    };
  }, [fetchStats]);

  const bill = stats?.currentMonthBill ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24 transition-colors duration-300">
      <Header />

      <main className="max-w-md mx-auto px-4 pt-4 pb-4 space-y-4">

        {/* ── Bill Meter hero ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 border border-slate-100 dark:border-slate-700">
          <div className="text-center mb-1">
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300">{t.currentMonthBill}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">April 2026 · WBSEDCL</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
            </div>
          ) : stats ? (
            <>
              <BillMeter
                amount={bill}
                units={parseFloat(stats.unitsUsed.toFixed(3))}
                totalKwhAccumulated={stats.totalKwhAccumulated}
                accumulatedCost={stats.accumulatedCost}
              />

              {/* Live watts badge */}
              <div className="flex justify-center mt-1 gap-2">
                {stats.latestWatts > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-full px-3 py-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {stats.latestWatts} W live · avg {stats.avgWatts} W
                    </span>
                  </div>
                )}
              </div>

              {/* Today's consumption row */}
              {(stats.kwhToday > 0 || stats.totalKwhAccumulated > 0) && (
                <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Today</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {stats.kwhToday.toFixed(4)} kWh
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">₹{stats.todayCost.toFixed(3)}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Total Acc.</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {stats.totalKwhAccumulated.toFixed(4)} kWh
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">₹{stats.accumulatedCost.toFixed(3)}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Readings</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{stats.readingCount}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">in DB</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-slate-400 py-8">Unable to load bill data</p>
          )}
        </motion.div>

        {/* ── Quick stats ── */}
        {!loading && stats && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-4 text-white shadow">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingDown className="w-4 h-4 opacity-80" />
                <span className="text-xs opacity-90 font-medium">{t.savedThisMonth}</span>
              </div>
              <p className="text-2xl font-black">₹{stats.savedThisMonth}</p>
              <p className="text-[10px] opacity-75 mt-0.5">vs simulated last month</p>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="w-4 h-4 opacity-80" />
                <span className="text-xs opacity-90 font-medium">{t.averageDaily}</span>
              </div>
              <p className="text-2xl font-black">{stats.avgDailyKwh.toFixed(3)}</p>
              <p className="text-[10px] opacity-75 mt-0.5">{t.kwhPerDay}</p>
            </div>
          </motion.div>
        )}

        {/* ── Smart status ── */}
        {!loading && stats && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <SmartStatusCard stats={stats} />
          </motion.div>
        )}

        {/* ── Pay Bill button ── */}
        {!loading && stats && (
          <motion.button
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            onClick={() => setShowPayment(true)}
            className="w-full flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/50 rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Pay Electricity Bill</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">UPI, Net Banking, Credit Card</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <span className="font-black text-blue-600 dark:text-blue-400">₹{bill}</span>
              <Building2 className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors" />
            </div>
          </motion.button>
        )}

        {/* ── Live Data Monitor ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <LiveDataMonitor />
        </motion.div>

        {/* ── Sustainable / Solar CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl p-5 text-white shadow-lg"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="bg-white/20 rounded-xl p-2.5 flex-shrink-0">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">Sustainable Optimization</h3>
              <p className="text-sm opacity-90 mt-1 leading-relaxed">
                Your 9W LED is already efficient! Switching to solar could
                eliminate this bill entirely. Peak hours 10 AM–4 PM are free energy.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSolar(true)}
            className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl py-3 font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Sun className="w-4 h-4" /> Explore Solar Plans
          </button>
        </motion.div>

        {/* ── Peak hour alert ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}
          className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="bg-amber-500 text-white rounded-full p-2 flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">Peak Hour Alert · 6–10 PM</h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                WBSEDCL demand peaks between 6 PM and 10 PM. Even your 9W LED contributes to grid load.
                Using natural light during these hours maximises your savings.
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Appliance breakdown ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 border border-slate-100 dark:border-slate-700">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            {t.energyBreakdown}
          </h3>
          <ApplianceDonutChart key={refreshKey} />
        </motion.div>

      </main>

      <BottomNav />

      {/* ── Modals ── */}
      <AnimatePresence>
        {showPayment && <PaymentSheet bill={bill} onClose={() => setShowPayment(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showSolar && <SolarSheet onClose={() => setShowSolar(false)} />}
      </AnimatePresence>
    </div>
  );
}