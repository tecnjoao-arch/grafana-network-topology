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

/** Arredonda pra um teto "bonito" (1, 2, 2.5, 5 × 10^n) — eixo Y com valores redondos. */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}

/** Formata bps compacto pro eixo (sem zeros à toa): 500 Mb/s, 1 Gb/s, 1.5 Gb/s. */
export function fmtAxisBps(bps: number): string {
  if (bps === 0) return '0';
  const units: Array<[number, string]> = [[1e12, 'Tb/s'], [1e9, 'Gb/s'], [1e6, 'Mb/s'], [1e3, 'kb/s']];
  for (const [v, s] of units) {
    if (bps >= v) {
      const n = bps / v;
      const str = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
      return str.replace(/\.?0+$/, '') + ' ' + s;
    }
  }
  return bps.toFixed(0) + ' b/s';
}
