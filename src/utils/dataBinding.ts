// utils/dataBinding.ts — Resolve um valor numérico a partir das séries do Grafana
// (DataFrame[]) usando um matcher de texto/regex + agregação.
// Genérico: funciona com Zabbix, Prometheus, Loki, etc.
//
// Performance: o painel re-renderiza a CADA tecla/arrasto no modo edição, e cada
// render resolve dezenas de bindings sobre o mesmo DataFrame[]. Por isso tudo é
// indexado uma única vez por chegada de dados (WeakMap na referência do array):
// strings de identificação pré-construídas, maior timestamp global e cache de
// resultado por binding. Sem isso, painéis com centenas de séries travavam o
// navegador durante a edição.

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

/** Série temporal completa (tempo+valor) de um binding — para gráficos. */
export interface BindingSeries {
  times: number[];
  values: number[];
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

// ── Índice por referência do DataFrame[] ──────────────────────────────────────

interface IndexedField {
  hay: string;
  hayLower: string;
  refId: string;
  isNumber: boolean;
  field: Field;
  timeField?: Field;
}

interface SeriesIndex {
  fields: IndexedField[];
  maxTime: number;
  /** Cache de resultado por binding (chave inclui match/agg/query/staleMs) */
  results: Map<string, unknown>;
}

const indexCache = new WeakMap<DataFrame[], SeriesIndex>();

function getIndex(series: DataFrame[]): SeriesIndex {
  let idx = indexCache.get(series);
  if (idx) return idx;

  const fields: IndexedField[] = [];
  let maxTime = 0;
  for (const frame of series) {
    const timeField = frame.fields.find((f) => f.type === 'time');
    if (timeField) {
      const vals = timeField.values as unknown as any[];
      for (const val of vals) {
        const num = Number(val);
        if (!isNaN(num) && num > maxTime) maxTime = num;
      }
    }
    for (const field of frame.fields) {
      if (field.type !== 'number' && field.type !== 'string') continue;
      const hay = haystack(frame, field);
      fields.push({
        hay,
        hayLower: hay.toLowerCase(),
        refId: frame.refId ?? '',
        isNumber: field.type === 'number',
        field,
        timeField,
      });
    }
  }
  idx = { fields, maxTime, results: new Map() };
  indexCache.set(series, idx);
  return idx;
}

/** Matcher: substring literal PRIMEIRO, regex como fallback. Nomes de itens do
 *  Zabbix costumam conter parênteses (ex: "Rx Power (dBm)"), que como regex
 *  viram grupos e nunca casam — colar o nome exato da série sempre funciona. */
function makeMatcher(match: string): (f: IndexedField) => boolean {
  let re: RegExp | null = null;
  try {
    re = new RegExp(match, 'i');
  } catch {
    re = null; // match inválido como regex → só substring
  }
  const lowerMatch = match.toLowerCase();
  return (f) => f.hayLower.includes(lowerMatch) || (re ? re.test(f.hay) : false);
}

/** Lista identificadores legíveis de todas as séries (números e texto). */
export function listSeriesKeys(series: DataFrame[]): string[] {
  const keys = new Set<string>();
  for (const f of getIndex(series).fields) keys.add(f.hay);
  return Array.from(keys);
}

/** Opções de resolução. ignoreStale: não descarta valor antigo (capacidade,
 *  diagnóstico etc — métricas quase-estáticas, de coleta lenta no Zabbix). */
export interface ResolveOpts {
  ignoreStale?: boolean;
}

/** Por que um binding não entregou valor. A diferença importa para o NOC:
 *  'stale'   = a série existe mas parou de atualizar (item desabilitado no
 *              Zabbix, coletor parado) → queda real, manda técnico.
 *  'missing' = nenhuma série casou o matcher (item renomeado/removido, ou erro
 *              de digitação no binding) → provável problema de configuração.
 *  Sem essa distinção, um typo no binding fica visualmente idêntico a uma
 *  queda de verdade e vira fábrica de alarme falso. */
export type BindingState = 'ok' | 'stale' | 'missing';

export interface BindingResult {
  value?: number;
  state: BindingState;
  /** Idade da última amostra válida em ms (preenchido quando state='stale') */
  ageMs?: number;
}

const MISSING: BindingResult = Object.freeze({ state: 'missing' });

/** Resolve o valor numérico de um binding. undefined se nada casar.
 *  Atalho de `resolveBindingDetailed` para quem só quer o número. */
export function resolveBinding(series: DataFrame[], binding?: MetricBinding, opts?: ResolveOpts): number | undefined {
  return resolveBindingDetailed(series, binding, opts).value;
}

/** Resolve um binding devolvendo valor E o motivo da ausência (ver BindingState). */
export function resolveBindingDetailed(
  series: DataFrame[],
  binding?: MetricBinding,
  opts?: ResolveOpts
): BindingResult {
  if (!binding || !binding.match || series.length === 0) return MISSING;

  const idx = getIndex(series);
  const agg = binding.aggregation ?? 'last';
  const ignoreStale = !!opts?.ignoreStale;
  const cacheKey = `d|${binding.query ?? ''}|${agg}|${defaultStaleMs}|${ignoreStale ? 'S0' : 'S1'}|${binding.match}`;
  if (idx.results.has(cacheKey)) return idx.results.get(cacheKey) as BindingResult;

  const matches = makeMatcher(binding.match);
  let out: BindingResult = MISSING;

  for (const f of idx.fields) {
    if (!f.isNumber) continue;
    if (binding.query && f.refId !== binding.query) continue;
    if (!matches(f)) continue;

    const vals = (f.field.values as unknown as any[]).map((x) => Number(x));

    // Checar se o dado está obsoleto (stale) comparando com o timestamp máximo global.
    // Só se aplica a 'last' (valor "agora"); agregações de janela (avg/max/min/first)
    // continuam válidas mesmo que o último ponto seja antigo. ignoreStale pula tudo.
    if (!ignoreStale && agg === 'last' && defaultStaleMs > 0 && f.timeField && idx.maxTime > 0) {
      const timeVals = f.timeField.values as unknown as any[];
      let lastIdx = -1;
      for (let i = vals.length - 1; i >= 0; i--) {
        if (typeof vals[i] === 'number' && !isNaN(vals[i])) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx !== -1) {
        const tVal = Number(timeVals[lastIdx]);
        // Tolerância respeita o intervalo REAL de coleta desta série: média dos
        // gaps entre as últimas amostras VÁLIDAS. Posições de array não servem —
        // o datasource preenche buracos com NaN, o que subestimava o intervalo
        // de itens lentos (ex: DOM a cada 5 min) e os matava como obsoletos.
        const sampleTimes: number[] = [];
        for (let i = lastIdx; i >= 0 && sampleTimes.length < 6; i--) {
          if (typeof vals[i] === 'number' && !isNaN(vals[i])) {
            const t = Number(timeVals[i]);
            if (!isNaN(t)) sampleTimes.push(t);
          }
        }
        const interval = sampleTimes.length >= 2
          ? (sampleTimes[0] - sampleTimes[sampleTimes.length - 1]) / (sampleTimes.length - 1)
          : 0;
        const tolerance = Math.max(defaultStaleMs, interval * 2.5);
        if (!isNaN(tVal) && (idx.maxTime - tVal > tolerance)) {
          // Obsoleto: não resolve valor (força queda no status)
          out = { state: 'stale', ageMs: idx.maxTime - tVal };
          break;
        }
      }
    }

    const reduced = reduce(vals, agg);
    if (reduced !== undefined) {
      out = { value: reduced, state: 'ok' };
      break;
    }
    // Série casou mas não tem nenhum ponto numérico utilizável: registra que
    // ela EXISTE (não é 'missing') e segue procurando um campo melhor.
    if (out.state === 'missing') out = { state: 'stale' };
  }

  idx.results.set(cacheKey, out);
  return out;
}

export function resolveBindingSeries(series: DataFrame[], binding?: MetricBinding): BindingSeries | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  const idx = getIndex(series);
  const cacheKey = `s|${binding.query ?? ''}|${binding.match}`;
  if (idx.results.has(cacheKey)) return idx.results.get(cacheKey) as BindingSeries | undefined;

  const matches = makeMatcher(binding.match);
  let out: BindingSeries | undefined = undefined;

  for (const f of idx.fields) {
    if (!f.isNumber || !f.timeField) continue;
    if (binding.query && f.refId !== binding.query) continue;
    if (!matches(f)) continue;
    const rawV = f.field.values as unknown as any[];
    const rawT = f.timeField.values as unknown as any[];
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
    if (values.length) {
      out = { times, values };
      break;
    }
  }

  idx.results.set(cacheKey, out);
  return out;
}

/** Resolve o valor textual de um binding (útil para extrair IPs ou status em texto). */
export function resolveTextBinding(series: DataFrame[], binding?: MetricBinding): string | undefined {
  if (!binding || !binding.match || series.length === 0) return undefined;

  const idx = getIndex(series);
  const cacheKey = `t|${binding.query ?? ''}|${binding.match}`;
  if (idx.results.has(cacheKey)) return idx.results.get(cacheKey) as string | undefined;

  const matches = makeMatcher(binding.match);
  let out: string | undefined = undefined;

  for (const f of idx.fields) {
    if (f.isNumber) continue; // Apenas procura em campos de texto
    if (binding.query && f.refId !== binding.query) continue;
    if (!matches(f)) continue;

    const vals = f.field.values as unknown as string[];
    // Pegar o último valor válido não vazio
    for (let i = vals.length - 1; i >= 0; i--) {
      if (vals[i] !== null && vals[i] !== undefined && vals[i] !== '') {
        out = String(vals[i]);
        break;
      }
    }
    if (out !== undefined) break;
  }

  idx.results.set(cacheKey, out);
  return out;
}
