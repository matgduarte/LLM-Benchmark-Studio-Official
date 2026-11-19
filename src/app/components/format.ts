/** Formatting helpers shared across the dashboard. */

export function formatLatency(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export function formatCost(usd?: number): string {
  if (usd === undefined || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatTokens(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatPercent(p?: number): string {
  if (p === undefined || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

export function formatNumber(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPricePer1M(usd?: number): string {
  if (usd === undefined || !Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(2)}/M`;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.round(hr / 24);
  return `${day}d atrás`;
}

export function progressPercent(completed: number, failed: number, total: number): number {
  if (!total) return 0;
  return ((completed + failed) / total) * 100;
}
