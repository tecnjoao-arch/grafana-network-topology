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

/** Divide uma string de endereços vinda do Zabbix ("198.51.100.1 | 2001:db8::1")
 *  em linhas separadas: IPv4 primeiro, IPv6 depois, e por fim o que não for IP
 *  (ex: "Sem IP"). Uma linha por endereço nos cards/modal. */
export function splitIps(raw?: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/[|,;]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return parts;
  const isV4 = (p: string) => /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(p);
  const isV6 = (p: string) => p.includes(':') && /^[0-9a-fA-F:.]+(\/\d+)?$/.test(p);
  const v4 = parts.filter(isV4);
  const v6 = parts.filter((p) => !isV4(p) && isV6(p));
  const rest = parts.filter((p) => !isV4(p) && !isV6(p));
  return [...v4, ...v6, ...rest];
}

/** Separa o endereço de um sufixo de prefixo (/64) ou zona (%eth0). */
function splitIpSuffix(raw: string): [string, string] {
  const m = raw.match(/^([^/%]+)([/%].*)$/);
  return m ? [m[1], m[2]] : [raw, ''];
}

/** Normaliza um IPv6 para a forma canônica (RFC 5952): minúsculas, sem zeros à
 *  esquerda e "::" no MAIOR trecho de zeros.
 *
 *  O Zabbix costuma entregar formas não-canônicas como
 *  "2804:1f18::9606:0:0:0:14", com o "::" num trecho menor que o 0:0:0 seguinte
 *  — 4 caracteres a mais no card sem nenhuma informação a mais.
 *  Devolve a entrada intacta se não parecer um IPv6 válido. */
export function canonicalizeIpv6(raw: string): string {
  const [addr, suffix] = splitIpSuffix(raw.trim());
  if (!addr.includes(':')) return raw;

  let groups: string[];
  if (addr.includes('::')) {
    const parts = addr.split('::');
    if (parts.length !== 2) return raw;
    const head = parts[0] ? parts[0].split(':') : [];
    const tail = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return raw;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = addr.split(':');
  }
  if (groups.length !== 8) return raw;

  groups = groups.map((g) => {
    const v = g.replace(/^0+/, '').toLowerCase();
    return v === '' ? '0' : v;
  });
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return raw;

  // Maior corrida de zeros; empate vai pra da esquerda. Só comprime 2+ grupos
  // (a RFC proíbe "::" para um zero solitário).
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === '0') {
      if (curStart < 0) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curStart = -1; curLen = 0;
    }
  }

  const out = bestLen >= 2
    ? `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLen).join(':')}`
    : groups.join(':');
  return out + suffix;
}

/** Abrevia um IPv6 para "prefixo…:host" — ex: "2804:1f18…:14".
 *  Num mapa de rede o prefixo se repete em todo mundo e quem identifica a
 *  interface é o último grupo; o endereço inteiro continua no modal, no tooltip
 *  e ao copiar. Se não render menor que a forma canônica, devolve a canônica. */
export function shortenIpv6(raw: string): string {
  const canon = canonicalizeIpv6(raw);
  const [addr, suffix] = splitIpSuffix(canon);
  if (!addr.includes(':')) return canon;

  const groups = addr.split(':').filter((g) => g !== '');
  if (groups.length < 3) return canon;
  // Só abrevia o que é mesmo IPv6: texto qualquer com dois-pontos (o Zabbix
  // manda coisas como "Sem IP" e nomes de item) não pode virar "abc…:z".
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return canon;

  const short = `${groups.slice(0, 2).join(':')}…:${groups[groups.length - 1]}${suffix}`;
  return short.length < canon.length ? short : canon;
}

/** Passo "bonito" de eixo (1/2/2.5/5 × 10^n) mais próximo de `raw` — estilo Grafana. */
export function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.75 ? 2.5 : n < 7.5 ? 5 : 10;
  return s * mag;
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
