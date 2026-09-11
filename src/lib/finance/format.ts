export function formatAmount(value: number | null | undefined, currency = "CNY"): string {
  if (value === null || value === undefined) return "-";
  const symbol = currency === "CNY" ? "¥" : currency === "KRW" ? "₩" : currency + " ";
  return `${symbol}${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

export function formatPeriod(periodEnd: Date | string): string {
  const d = new Date(periodEnd);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
