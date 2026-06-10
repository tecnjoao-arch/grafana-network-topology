// utils/format.ts — Formatação de números para exibição (bps → Gb/s, etc)

/**
 * Formata uma taxa em bps em uma string legível: 1500000000 → "1.50 Gb/s"
 */
export function formatBitsPerSec(bps?: number): string {
  if (bps === undefined || bps === null || isNaN(bps)) return '—';
  const units = [
    { v: 1e12, s: 'Tb/s' },
    { v: 1e9, s: 'Gb/s' },
    { v: 1e6, s: 'Mb/s' },
    { v: 1e3, s: 'kb/s' },
  ];
  for (const { v, s } of units) {
    if (Math.abs(bps) >= v) {
      return `${(bps / v).toFixed(2)} ${s}`;
    }
  }
  return `${bps.toFixed(0)} b/s`;
}

/** Calcula utilização (0-1) de um link */
export function linkUtilization(traffic: number | undefined, capacity: number | undefined): number {
  if (!traffic || !capacity || capacity <= 0) return 0;
  return Math.min(1, traffic / capacity);
}
