import type { DetectionResult } from "@/lib/detector";

export function scoreColor(score: number): string {
  if (score >= 75) return "var(--red)";
  if (score >= 50) return "var(--orange)";
  if (score >= 25) return "var(--amber)";
  return "var(--accent)";
}

export function ScoreGauge({
  score,
  band,
  size = 150,
}: {
  score: number;
  band: DetectionResult["band"];
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c * (1 - pct / 100);
  const color = scoreColor(score);

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`AI-likeness ${score} percent, ${band}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--panel-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.4s",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-value" style={{ color }}>
          {score}
          <small>%</small>
        </div>
        <div className="gauge-label">AI-like</div>
      </div>
    </div>
  );
}

export function BandPill({ score, band }: { score: number; band: string }) {
  const color = scoreColor(score);
  return (
    <span
      className="band"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <span className="dot" />
      {band}
    </span>
  );
}
