// Plain server-rendered inline-SVG trend line — no chart library, no client
// JS. Points are plotted oldest-to-newest; the last point is highlighted and
// colored by sign so a reader can see "is the latest value up or negative"
// at a glance, backed by the exact numbers in the table this sits above.
export function FinanceSparkline({
  points,
  width = 280,
  height = 64,
  formatValue,
}: {
  points: { label: string; value: number | null }[];
  width?: number;
  height?: number;
  formatValue: (v: number) => string;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) {
    return <p className="text-xs text-[var(--sub)]">추이를 표시할 데이터가 부족합니다 (2개월 이상 필요).</p>;
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const padX = 4;
  const padY = 6;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = p.value === null ? null : padY + plotH - ((p.value - min) / range) * plotH;
    return { ...p, x, y };
  });

  const zeroY = padY + plotH - ((0 - min) / range) * plotH;
  const linePath = coords
    .filter((c) => c.y !== null)
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${(c.y as number).toFixed(1)}`)
    .join(" ");

  const last = coords[coords.length - 1];
  const lastColor = last.value !== null && last.value < 0 ? "#dc2626" : "var(--accent)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`추이: ${points.map((p) => `${p.label} ${formatValue(p.value ?? 0)}`).join(", ")}`}>
      <title>{points.map((p) => `${p.label}: ${p.value === null ? "-" : formatValue(p.value)}`).join(" / ")}</title>
      {min < 0 && max > 0 && <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} stroke="var(--line)" strokeDasharray="2,2" />}
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      {coords.map(
        (c, i) =>
          c.y !== null && (
            <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 1.5} fill={i === coords.length - 1 ? lastColor : "var(--accent)"} />
          )
      )}
    </svg>
  );
}
