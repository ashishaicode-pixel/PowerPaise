import { useMotionValue, useTransform, animate, motion } from "motion/react";
import { useEffect } from "react";

interface BillMeterProps {
  amount: number;
  units: number;
}

// Meter geometry constants
const CX = 100;           // arc center X
const CY = 108;           // arc center Y (lower → more room below for text)
const R = 78;             // arc radius
const NEEDLE_LEN = 58;    // needle length (shorter than R so it stays inside)
const ARC_LEN = Math.PI * R; // half-circle arc length ≈ 245

/**
 * Convert a percentage (0-100) to an angle in degrees
 * 0%   → 180° (left)
 * 50%  → 90°  (top)
 * 100% → 0°   (right)
 */
function pctToAngleDeg(pct: number) {
  return 180 - (pct / 100) * 180;
}

/** Convert degrees to radians */
function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function BillMeter({ amount, units }: BillMeterProps) {
  const maxBill = 5000;
  const targetPct = Math.min((amount / maxBill) * 100, 100);

  // Animate the angle (degrees, 180° → target)
  const angleDeg = useMotionValue(180);

  useEffect(() => {
    const target = pctToAngleDeg(targetPct);
    const controls = animate(angleDeg, target, {
      duration: 1.6,
      ease: "easeOut",
      delay: 0.35,
    });
    return controls.stop;
  }, [targetPct]);

  // Needle tip — derived from animated angle
  const needleTipX = useTransform(angleDeg, (a) => CX + NEEDLE_LEN * Math.cos(toRad(a)));
  const needleTipY = useTransform(angleDeg, (a) => CY - NEEDLE_LEN * Math.sin(toRad(a)));

  // Progress arc stroke-dashoffset
  const dashOffset = useTransform(angleDeg, (a) => {
    const pct = (180 - a) / 180; // 0 at start, 1 at end
    return ARC_LEN * (1 - pct);
  });

  // Arc path
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  // Tick marks at 0 / 25 / 50 / 75 / 100 %
  const ticks = [0, 25, 50, 75, 100];

  // Zone labels on the arc (positioned just outside the arc)
  const zones = [
    { pct: 0,   label: "₹0" },
    { pct: 50,  label: "₹2.5K" },
    { pct: 100, label: "₹5K" },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto select-none">
      <svg viewBox="0 0 200 168" className="w-full overflow-visible">
        <defs>
          {/* Green → Amber → Red gradient along the arc */}
          <linearGradient id="meterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#10B981" />
            <stop offset="55%"  stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>

          {/* Soft glow filter for needle */}
          <filter id="needleGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Background arc (grey track) ── */}
        <path
          d={arcPath}
          fill="none"
          stroke="#E5E7EB"
          className="dark:stroke-slate-700"
          strokeWidth="13"
          strokeLinecap="round"
        />

        {/* ── Coloured progress arc ── */}
        <motion.path
          d={arcPath}
          fill="none"
          stroke="url(#meterGrad)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={ARC_LEN}
          style={{ strokeDashoffset: dashOffset }}
        />

        {/* ── Tick marks ── */}
        {ticks.map((t) => {
          const a = toRad(pctToAngleDeg(t));
          const innerR = R - 9;
          const outerR = R + 1;
          return (
            <line
              key={t}
              x1={CX + innerR * Math.cos(a)}
              y1={CY - innerR * Math.sin(a)}
              x2={CX + outerR * Math.cos(a)}
              y2={CY - outerR * Math.sin(a)}
              stroke="#9CA3AF"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          );
        })}

        {/* ── Zone labels outside arc ── */}
        {zones.map(({ pct, label }) => {
          const a = toRad(pctToAngleDeg(pct));
          const labelR = R + 14;
          const lx = CX + labelR * Math.cos(a);
          const ly = CY - labelR * Math.sin(a);
          return (
            <text
              key={pct}
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fill="#9CA3AF"
              style={{ fontSize: "7.5px" }}
            >
              {label}
            </text>
          );
        })}

        {/* ── Needle ── */}
        <motion.line
          x1={CX}
          y1={CY}
          x2={needleTipX}
          y2={needleTipY}
          stroke="#1E293B"
          strokeWidth="2.8"
          strokeLinecap="round"
          filter="url(#needleGlow)"
        />

        {/* Pivot dot — outer ring */}
        <circle cx={CX} cy={CY} r="7" fill="#1E293B" />
        {/* Pivot dot — inner highlight */}
        <circle cx={CX} cy={CY} r="3.5" fill="#F8FAFC" />

        {/* ── Bill Amount — clearly below the arc & pivot ── */}
        <text
          x={CX}
          y={CY + 28}
          textAnchor="middle"
          fill="#111827"
          style={{ fontSize: "26px", fontWeight: "800", letterSpacing: "-0.5px" }}
        >
          ₹{amount.toLocaleString("en-IN")}
        </text>

        {/* Units label */}
        <text
          x={CX}
          y={CY + 44}
          textAnchor="middle"
          fill="#6B7280"
          style={{ fontSize: "10.5px" }}
        >
          {units} units this month
        </text>
      </svg>
    </div>
  );
}