import { useId } from "react";

interface ChartProps {
  values: number[];
  labels?: string[];
  height?: number;
  className?: string;
}

/** Lightweight responsive SVG line/area chart (no dependencies). */
export function LineChart({ values, height = 160, className, color = "var(--primary)" }: ChartProps & { color?: string }) {
  const id = useId();
  const w = 600;
  const h = height;
  const pad = 6;
  if (values.length < 2) {
    return <div className="text-xs text-muted-foreground">Yeterli veri yok</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({ values, height = 120, className, color = "var(--accent)" }: ChartProps & { color?: string }) {
  const w = 600;
  const h = height;
  const pad = 4;
  if (values.length < 2) {
    return <div className="text-xs text-muted-foreground">Yeterli veri yok</div>;
  }
  const max = Math.max(...values) || 1;
  const bw = (w - pad * 2) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {values.map((v, i) => {
        const bh = (v / max) * (h - pad * 2);
        return (
          <rect
            key={i}
            x={pad + i * bw + bw * 0.12}
            y={h - pad - bh}
            width={bw * 0.76}
            height={Math.max(0, bh)}
            fill={color}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
