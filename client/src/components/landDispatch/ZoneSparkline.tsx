import React from "react";

interface ZoneSparklineProps {
  timeline?: Array<{ time: string; free: number; deficit: boolean }>;
  totalSpots: number;
  hasDeficit?: boolean;
  minFree?: number;
  className?: string;
}

export function ZoneSparkline({
  timeline = [],
  totalSpots,
  hasDeficit = false,
  minFree,
  className = "",
}: ZoneSparklineProps) {
  if (!timeline || timeline.length < 2) {
    return (
      <div className={`h-7 flex items-center justify-center text-[10px] text-muted-foreground/50 border border-dashed rounded ${className}`}>
        Nema podataka za graf
      </div>
    );
  }

  const n = timeline.length;
  const width = 120;
  const height = 30;
  const padY = 3;
  const usableH = height - padY * 2;

  // Determine scale range
  const allFree = timeline.map((t) => t.free);
  const minVal = Math.min(0, ...allFree);
  const maxVal = Math.max(totalSpots || 1, ...allFree, 1);
  const range = maxVal - minVal || 1;

  const getX = (index: number) => {
    return Math.round((index / (n - 1)) * (width - 4) + 2);
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / range;
    return Math.round(height - padY - ratio * usableH);
  };

  const points = timeline.map((pt, i) => ({
    x: getX(i),
    y: getY(pt.free),
    val: pt.free,
    deficit: pt.deficit,
    time: pt.time,
  }));

  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${lineD} L ${points[n - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Zero line if below zero
  const zeroY = minVal < 0 ? getY(0) : null;

  // Color scheme
  const strokeColor = hasDeficit
    ? "#ef4444" // red
    : minFree !== undefined && minFree <= 1
    ? "#f59e0b" // amber
    : "#3b82f6"; // blue

  const gradientId = `spark-grad-${Math.random().toString(36).substr(2, 6)}`;

  return (
    <div className={`relative w-full ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-7 overflow-visible block"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={hasDeficit ? 0.35 : 0.25} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Zero baseline if there's deficit */}
        {zeroY !== null && (
          <line
            x1="2"
            y1={zeroY}
            x2={width - 2}
            y2={zeroY}
            stroke="#ef4444"
            strokeDasharray="2,2"
            strokeWidth="0.75"
            strokeOpacity="0.7"
          />
        )}

        {/* Shaded Area */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Line Curve */}
        <path
          d={lineD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points for Deficit or Minimum Dip */}
        {points.map((pt, idx) => {
          if (pt.deficit) {
            return (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r="2.5"
                fill="#ef4444"
                stroke="#fff"
                strokeWidth="1"
              />
            );
          }
          if (pt.val === minFree && (idx === 0 || idx === n - 1 || points[idx - 1].val !== pt.val)) {
            return (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r="1.8"
                fill={strokeColor}
                stroke="#fff"
                strokeWidth="0.8"
              />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}
