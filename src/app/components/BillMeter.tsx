import { useMotionValue, useTransform, animate, motion } from "motion/react";
import { useEffect, useMemo } from "react";

interface BillMeterProps {
  amount:               number;  // ₹ projected monthly bill
  units:                number;  // projected monthly kWh
  totalKwhAccumulated?: number;  // actual cumulative kWh from sensor odometer
  accumulatedCost?:     number;  // actual ₹ cost from odometer
}

// ── Gauge geometry ────────────────────────────────────────────────────────────
const CX         = 100;
const CY         = 94;
const R          = 72;
const NEEDLE_LEN = 56;
const ARC_LEN    = Math.PI * R;  // half-circle arc length

function pctToAngleDeg(pct: number) { return 180 - (pct / 100) * 180; }
function toRad(deg: number) { return (deg * Math.PI) / 180; }

// ── Realistic max bill for a 9W LED scenario ──────────────────────────────────
// 9W × 24h × 30d / 1000 × ₹7.2 = ₹46.66
// Max set at ₹100 for good resolution; needle will be around 47% for a 9W LED
const MAX_BILL = 100;

export function BillMeter({ amount, units, totalKwhAccumulated = 0, accumulatedCost = 0 }: BillMeterProps) {
  // Clamp to 0–100% of scale
  const targetPct = Math.min(Math.max((amount / MAX_BILL) * 100, 0), 100);

  const angleDeg = useMotionValue(180); // start at left (0%)

  useEffect(() => {
    const target   = pctToAngleDeg(targetPct);
    const controls = animate(angleDeg, target, { duration: 1.6, ease: "easeOut", delay: 0.3 });
    return controls.stop;
  }, [targetPct]);

  const needleTipX = useTransform(angleDeg, a => CX + NEEDLE_LEN * Math.cos(toRad(a)));
  const needleTipY = useTransform(angleDeg, a => CY - NEEDLE_LEN * Math.sin(toRad(a)));
  const dashOffset  = useTransform(angleDeg, a => ARC_LEN * ((a - 0) / 180));

  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const ticks   = [0, 25, 50, 75, 100];

  // Zone labels: carefully positioned to stay within viewBox
  const zones = useMemo(() => [
    { pct: 0,   label: "₹0",           anchor: "start"  as const },
    { pct: 50,  label: `₹${MAX_BILL / 2}`, anchor: "middle" as const },
    { pct: 100, label: `₹${MAX_BILL}`, anchor: "end"    as const },
  ], []);

  // Colour of the bill amount text
  const amountColor =
    targetPct < 33 ? "#10B981" :  // green
    targetPct < 66 ? "#F59E0B" :  // amber
                     "#EF4444";   // red

  return (
    <div className="relative w-full max-w-xs mx-auto select-none">
      {/* viewBox: 200×210 — gives sufficient bottom padding for stacked text */}
      <svg viewBox="0 0 200 210" className="w-full overflow-visible">
        <defs>
          {/* Green → Amber → Red gradient */}
          <linearGradient id="meterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#10B981" />
            <stop offset="50%"  stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>

          <filter id="needleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track arc */}
        <path d={arcPath} fill="none"
          stroke="#E5E7EB" className="dark:stroke-slate-700"
          strokeWidth="13" strokeLinecap="round" />

        {/* Progress arc */}
        <motion.path d={arcPath} fill="none"
          stroke="url(#meterGrad)" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={ARC_LEN}
          style={{ strokeDashoffset: dashOffset }} />

        {/* Tick marks */}
        {ticks.map(t => {
          const a = toRad(pctToAngleDeg(t));
          return (
            <line key={t}
              x1={CX + (R - 8) * Math.cos(a)} y1={CY - (R - 8) * Math.sin(a)}
              x2={CX + (R + 1) * Math.cos(a)} y2={CY - (R + 1) * Math.sin(a)}
              stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" />
          );
        })}

        {/* Zone labels — use custom textAnchor for each end to prevent clipping */}
        {zones.map(({ pct, label, anchor }) => {
          const a   = toRad(pctToAngleDeg(pct));
          const lr  = R + 17;
          const lx  = CX + lr * Math.cos(a);
          const ly  = CY - lr * Math.sin(a) + 3;
          // Nudge end labels slightly inward so they don't clip at svg edges
          const nx = pct === 0   ? Math.max(lx, 10)
                   : pct === 100 ? Math.min(lx, 190)
                   : lx;
          return (
            <text key={pct}
              x={nx} y={ly}
              textAnchor={anchor}
              fill="#9CA3AF"
              style={{ fontSize: "7.5px", fontWeight: 600 }}>
              {label}
            </text>
          );
        })}

        {/* Needle */}
        <motion.line x1={CX} y1={CY} x2={needleTipX} y2={needleTipY}
          stroke="#1E293B" className="dark:stroke-slate-200"
          strokeWidth="3" strokeLinecap="round" filter="url(#needleGlow)" />

        {/* Pivot outer glow ring — pulses in the live zone colour */}
        <motion.circle
          cx={CX} cy={CY}
          fill="none"
          stroke={amountColor}
          strokeWidth="2"
          animate={{ r: [10, 13, 10], opacity: [0.55, 0.15, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Pivot hub — fills with zone colour and breathes to show live sync */}
        <motion.circle
          cx={CX} cy={CY}
          animate={{
            r:    [7, 8.2, 7],
            fill: amountColor,
          }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: `drop-shadow(0 0 5px ${amountColor}88)` }}
        />
        <circle cx={CX} cy={CY} r="3" fill="#F8FAFC" className="dark:fill-slate-900" />

        {/* ── Bill amount — large centred below pivot ── */}
        <text x={CX} y={CY + 32} textAnchor="middle"
          fill={amountColor}
          style={{ fontSize: "27px", fontWeight: 900, letterSpacing: "-0.5px" }}>
          ₹{amount.toLocaleString("en-IN")}
        </text>

        {/* ── Units — two-line split to prevent overflow ── */}
        <text textAnchor="middle" fill="#9CA3AF" style={{ fontSize: "9.5px" }}>
          <tspan x={CX} y={CY + 50}>{units.toFixed(3)} kWh projected</tspan>
          <tspan x={CX} dy="13">this month · ₹7.20/kWh</tspan>
        </text>

        {/* ── Accumulated sensor total ── */}
        {totalKwhAccumulated > 0 && (
          <text textAnchor="middle" fill="#6EE7B7" style={{ fontSize: "9px", fontWeight: 600 }}>
            <tspan x={CX} y={CY + 77}>Accumulated: {totalKwhAccumulated.toFixed(4)} kWh</tspan>
            <tspan x={CX} dy="12">· ₹{accumulatedCost.toFixed(4)} actual</tspan>
          </text>
        )}

        {/* ── Scale hint ── */}
        <text x={CX} y={totalKwhAccumulated > 0 ? CY + 104 : CY + 80} textAnchor="middle"
          fill="#CBD5E1" className="dark:fill-slate-600" style={{ fontSize: "7.5px" }}>
          Scale ₹0–₹{MAX_BILL} · WBSEDCL slab-1
        </text>
      </svg>
    </div>
  );
}