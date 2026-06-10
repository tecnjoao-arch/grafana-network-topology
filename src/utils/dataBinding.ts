// utils/dataBinding.ts — Resolve um valor numérico a partir das séries do Grafana
// (DataFrame[]) usando um matcher de texto/regex + agregação.
// Genérico: funciona com Zabbix, Prometheus, Loki, etc.

import { DataFrame, Field } from '@grafana/data';

export type Aggregation = 'last' | 'first' | 'avg' | 'max' | 'min';

// Limite (ms) padrão de obsolescência, ajustável pelo painel via setStaleThresholdMs.
let defaultStaleMs = 180000;
/** Define o limite global de obsolescência (ms). 0 desativa a checagem de stale. */
export function setStaleThresholdMs(ms: number): void {
  defaultStaleMs = Math.max(0, ms || 0);
}

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
      // Inclui campos de texto: os bindings de IP (resolveTextBinding) procuram
      // em séries string — elas também precisam aparecer nas sugestões.
      if (field.type === 'number' || field.type === 'string') {
        keys.add(haystack(frame, field));
      }
    }
  }
  return Array.from(keys);
}

// Cache do maior timestamp por referência do array de séries. Cada render do
// painel resolve dezenas de bindings sobre o MESMO `series`; sem cache, cada
// um re-escaneava todos os campos de tempo (O(séries × pontos × bindings)).
const maxTimeCache = new WeakMap<DataFrame[], number>();

function getGlobalMaxTime(series: DataFrame[]): number {
  const cached = maxTimeCache.get(series);
  if (cached !== undefined) return cached;
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
  maxTimeCache.set(series, maxTime);
  return maxTime;
}

/** Resolve o valor numérico de um binding. undefined se nada casar. */
export function resolveBinding(series: DataFrame[], binding?: MetricBinding): number | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  let re: RegExp | null = null;
  try {
    re = new RegExp(binding.match, 'i');
  } catch {
    re = null; // match inválido como regex → só substring
  }
  // Substring literal PRIMEIRO, regex como fallback: nomes de itens do Zabbix
  // costumam conter parênteses (ex: "Rx Power (dBm)"), que como regex viram
  // grupos e nunca casam. Assim, colar o nome exato da série sempre funciona.
  const lowerMatch = binding.match.toLowerCase();
  const matches = (h: string) =>
    h.toLowerCase().includes(lowerMatch) || (re ? re.test(h) : false);

  const agg = binding.aggregation ?? 'last';
  const globalMaxTime = getGlobalMaxTime(series);

  for (const frame of series) {
    if (binding.query && (frame.refId ?? '') !== binding.query) continue;
    for (const field of frame.fields) {
      if (field.type !== 'number') continue;
      if (!matches(haystack(frame, field))) continue;
      
      const vals = (field.values as unknown as any[]).map((x) => Number(x));
      
      // Checar se o dado está obsoleto (stale) comparando com o timestamp máximo global.
      // Só se aplica a 'last' (valor "agora"); agregações de janela (avg/max/min/first)
      // continuam válidas mesmo que o último ponto seja antigo.
      const timeField = frame.fields.find((f) => f.type === 'time');
      if (agg === 'last' && defaultStaleMs > 0 && timeField && globalMaxTime > 0) {
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
          // Tolerância respeita o intervalo de coleta DESTA série: uma métrica de
          // 5 min não pode parecer obsoleta só porque outra série atualiza a cada 30s.
          const tFirst = Number(timeVals[0]);
          const interval = (lastIdx > 0 && !isNaN(tFirst) && !isNaN(tVal)) ? (tVal - tFirst) / lastIdx : 0;
          const tolerance = Math.max(defaultStaleMs, interval * 2.5);
          if (!isNaN(tVal) && (globalMaxTime - tVal > tolerance)) {
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

/** Série temporal completa (tempo+valor) de um binding — para gráficos. */
export interface BindingSeries {
  times: number[];
  values: number[];
}

export function resolveBindingSeries(series: DataFrame[], binding?: MetricBinding): BindingSeries | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  let re: RegExp | null = null;
  try {
    re = new RegExp(binding.match, 'i');
  } catch {
    re = null;
  }
  const lowerMatch = binding.match.toLowerCase();
  const matches = (h: string) =>
    h.toLowerCase().includes(lowerMatch) || (re ? re.test(h) : false);

  for (const frame of series) {
    if (binding.query && (frame.refId ?? '') !== binding.query) continue;
    const timeField = frame.fields.find((f) => f.type === 'time');
    if (!timeField) continue;
    for (const field of frame.fields) {
      if (field.type !== 'number') continue;
      if (!matches(haystack(frame, field))) continue;
      const rawV = field.values as unknown as any[];
      const rawT = timeField.values as unknown as any[];
      const times: number[] = [];
      const values: number[] = [];
      for (let i = 0; i < rawV.length; i++) {
        const v = Number(rawV[i]);
        const t = Number(rawT[i]);
        if (!isNaN(v) && !isNaN(t)) {
          times.push(t);
          values.push(v);
        }
      }
      if (values.length) return { times, values };
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
  // Mesma regra do resolveBinding: literal primeiro, regex como fallback.
  const lowerMatch = binding.match.toLowerCase();
  const matches = (h: string) =>
    h.toLowerCase().includes(lowerMatch) || (re ? re.test(h) : false);

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
