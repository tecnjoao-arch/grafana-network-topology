// utils/dataBinding.ts — Resolve um valor numérico a partir das séries do Grafana
// (DataFrame[]) usando um matcher de texto/regex + agregação.
// Genérico: funciona com Zabbix, Prometheus, Loki, etc.

import { DataFrame, Field } from '@grafana/data';

export type Aggregation = 'last' | 'first' | 'avg' | 'max' | 'min';

export interface MetricBinding {
  /** Filtra por refId da query (ex: "A"). Vazio = qualquer query */
  query?: string;
  /** Texto ou regex que casa com o nome da série / labels / campo */
  match: string;
  /** Como reduzir a série temporal a um número (padrão: last) */
  aggregation?: Aggregation;
}

/** Constrói uma string "pesquisável" que identifica uma série/campo. */
function haystack(frame: DataFrame, field: Field): string {
  const parts: string[] = [];
  if (frame.name) parts.push(frame.name);
  if (field.name) parts.push(field.name);
  const dn = (field.config as any)?.displayNameFromDS;
  if (dn) parts.push(dn);
  const labels = field.labels || (frame as any).labels;
  if (labels) {
    for (const k of Object.keys(labels)) parts.push(`${k}=${labels[k]}`, String(labels[k]));
  }
  return parts.join(' • ');
}

function reduce(values: number[], agg: Aggregation): number | undefined {
  const v = values.filter((n) => typeof n === 'number' && !isNaN(n));
  if (v.length === 0) return undefined;
  switch (agg) {
    case 'first': return v[0];
    case 'avg': return v.reduce((a, b) => a + b, 0) / v.length;
    case 'max': return Math.max(...v);
    case 'min': return Math.min(...v);
    case 'last':
    default: return v[v.length - 1];
  }
}

/** Lista identificadores legíveis de todas as séries (pra ajudar o usuário a escrever o match). */
export function listSeriesKeys(series: DataFrame[]): string[] {
  const keys = new Set<string>();
  for (const frame of series) {
    for (const field of frame.fields) {
      if (field.type === 'number') keys.add(haystack(frame, field));
    }
  }
  return Array.from(keys);
}

function getGlobalMaxTime(series: DataFrame[]): number {
  let maxTime = 0;
  for (const frame of series) {
    const timeField = frame.fields.find((f) => f.type === 'time');
    if (timeField) {
      const vals = timeField.values as unknown as any[];
      for (const val of vals) {
        const num = Number(val);
        if (typeof num === 'number' && !isNaN(num) && num > maxTime) {
          maxTime = num;
        }
      }
    }
  }
  return maxTime;
}

/** Resolve o valor numérico de um binding. undefined se nada casar. */
export function resolveBinding(series: DataFrame[], binding?: MetricBinding): number | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  let re: RegExp | null = null;
  try {
    re = new RegExp(binding.match, 'i');
  } catch {
    re = null; // match inválido como regex → cai pra substring
  }
  const matches = (h: string) =>
    re ? re.test(h) : h.toLowerCase().includes(binding.match.toLowerCase());

  const agg = binding.aggregation ?? 'last';
  const globalMaxTime = getGlobalMaxTime(series);

  for (const frame of series) {
    if (binding.query && (frame.refId ?? '') !== binding.query) continue;
    for (const field of frame.fields) {
      if (field.type !== 'number') continue;
      if (!matches(haystack(frame, field))) continue;
      
      const vals = (field.values as unknown as any[]).map((x) => Number(x));
      
      // Checar se o dado está obsoleto (stale) comparando com o timestamp máximo global
      const timeField = frame.fields.find((f) => f.type === 'time');
      if (timeField && globalMaxTime > 0) {
        const timeVals = timeField.values as unknown as any[];
        let lastIdx = -1;
        for (let i = vals.length - 1; i >= 0; i--) {
          if (typeof vals[i] === 'number' && !isNaN(vals[i])) {
            lastIdx = i;
            break;
          }
        }
        if (lastIdx !== -1) {
          const tVal = Number(timeVals[lastIdx]);
          if (typeof tVal === 'number' && !isNaN(tVal) && (globalMaxTime - tVal > 180000)) { // 3 minutos
            return undefined; // Considera obsoleto (não resolve valor, forçando queda no status)
          }
        }
      }

      const out = reduce(vals, agg);
      if (out !== undefined) return out;
    }
  }
  return undefined;
}

/** Resolve o valor textual de um binding (útil para extrair IPs ou status em texto). */
export function resolveTextBinding(series: DataFrame[], binding?: MetricBinding): string | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  let re: RegExp | null = null;
  try {
    re = new RegExp(binding.match, 'i');
  } catch {
    re = null;
  }
  const matches = (h: string) =>
    re ? re.test(h) : h.toLowerCase().includes(binding.match.toLowerCase());

  for (const frame of series) {
    if (binding.query && (frame.refId ?? '') !== binding.query) continue;
    for (const field of frame.fields) {
      if (field.type !== 'string') continue; // Apenas procura em campos de texto
      if (!matches(haystack(frame, field))) continue;
      
      const vals = field.values as unknown as string[];
      // Pegar o último valor válido não vazio
      let lastVal: string | undefined = undefined;
      for (let i = vals.length - 1; i >= 0; i--) {
        if (vals[i] !== null && vals[i] !== undefined && vals[i] !== '') {
          lastVal = String(vals[i]);
          break;
        }
      }
      if (lastVal !== undefined) return lastVal;
    }
  }
  return undefined;
}
