// utils/globalping.ts — Cliente da API pública do Globalping (api.globalping.io).
// Probes EXTERNAS espalhadas pelo mundo executam ping/traceroute/mtr/dns em
// direção a um alvo público — visão "de fora" da rede (complementa o Zabbix).
// A API tem CORS liberado (Access-Control-Allow-Origin: *), então o navegador
// do analista chama direto, sem backend. Sem token: 250 testes/hora por IP.

export type GpType = 'ping' | 'traceroute' | 'mtr' | 'dns';

export interface GpProbeInfo {
  continent?: string;
  country?: string;
  state?: string | null;
  city?: string;
  asn?: number;
  network?: string;
}

export interface GpResultItem {
  probe: GpProbeInfo;
  result: {
    status: 'in-progress' | 'finished' | 'failed' | 'offline';
    rawOutput?: string;
    stats?: { min?: number; avg?: number; max?: number; loss?: number; total?: number; rcv?: number; drop?: number };
    resolvedAddress?: string | null;
  };
}

export interface GpMeasurement {
  id: string;
  type: GpType;
  status: 'in-progress' | 'finished';
  target: string;
  probesCount: number;
  results: GpResultItem[];
}

export interface GpRateInfo {
  limit?: number;
  remaining?: number;
  resetSec?: number;
}

const API = 'https://api.globalping.io/v1';

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && token.trim()) h.Authorization = `Bearer ${token.trim()}`;
  return h;
}

/** Cria uma medição. `magic` é a origem das probes ("brazil", "sao paulo",
 *  "US", "europe", ASN...); vazio ou "world" = mundo todo (aleatório). */
export async function createMeasurement(opts: {
  type: GpType;
  target: string;
  magic?: string;
  limit?: number;
  token?: string;
}): Promise<{ id: string; rate: GpRateInfo }> {
  const body: Record<string, unknown> = {
    type: opts.type,
    target: opts.target.trim(),
    limit: opts.limit ?? 3,
    inProgressUpdates: true,
  };
  const magic = (opts.magic ?? '').trim();
  if (magic && magic.toLowerCase() !== 'world') {
    body.locations = [{ magic }];
  }

  const res = await fetch(`${API}/measurements`, {
    method: 'POST',
    headers: authHeaders(opts.token),
    body: JSON.stringify(body),
  });

  const rate: GpRateInfo = {
    limit: num(res.headers.get('X-RateLimit-Limit')),
    remaining: num(res.headers.get('X-RateLimit-Remaining')),
    resetSec: num(res.headers.get('X-RateLimit-Reset')),
  };

  if (res.status === 429) {
    const mins = rate.resetSec !== undefined ? Math.max(1, Math.ceil(rate.resetSec / 60)) : 60;
    throw new Error(`Limite de testes atingido (${rate.limit ?? 250}/hora por IP). Libera em ~${mins} min.`);
  }
  if (res.status === 422) {
    throw new Error('Nenhuma probe encontrada nessa origem. Tente "brazil", "US", "europe"…');
  }
  if (!res.ok) {
    let msg = `Erro ${res.status} ao criar o teste`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }

  const j = await res.json();
  return { id: j.id as string, rate };
}

/** Busca o estado atual de uma medição (pra polling até status === 'finished'). */
export async function getMeasurement(id: string, token?: string): Promise<GpMeasurement> {
  const res = await fetch(`${API}/measurements/${id}`, {
    headers: token && token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
  });
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar o resultado`);
  return (await res.json()) as GpMeasurement;
}
