// utils/historico.ts — o historico longo de UMA interface, sob demanda.
//
// Com o dashboard em "Last 2 days", o painel pedia ao Zabbix dois dias de
// TODAS as series de uma vez (~744 de trafego + ~1070 de optica, minuto a
// minuto) e a query quebrava. Mas quem quer ver dois dias quer ver dois dias
// de UM link — o que o analista abriu. Entao o dashboard fica numa janela
// curta, e o modal busca a janela longa so daquele host e daquela interface:
// pelos botoes 24h/2d/7d, ou por um periodo livre no seletor de tempo.
//
// A query e montada a partir da query de trafego do proprio painel: mesmo
// datasource, mesmo grupo, mesmas opcoes. So o host e o item sao trocados
// pelos daquele link. Assim nao ha nada pra configurar, e se a query A mudar,
// o historico acompanha.

import { dateTime, DataFrame, DataQueryRequest, DataQueryResponse } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Amostras, Link } from '../types';
import { extrairLinks } from './dados';

/** O que a query do painel precisa ter pra servir de molde. */
interface AlvoZabbix {
  refId: string;
  hide?: boolean;
  datasource?: unknown;
  host?: { filter?: string };
  item?: { filter?: string };
  [k: string]: unknown;
}

/** Regex literal: o nome do host e da interface entram como texto. A "/"
 *  fica como esta — o datasource separa a regex pelo ULTIMO "/" (parseFilter
 *  em utils.go), e as interfaces tem "/" no nome. */
function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A query de trafego do painel: a que busca "Interface ..." no campo Item.
 * Prefere a A; qualquer outra que busque interface serve.
 */
export function alvoDeTrafego(alvos: AlvoZabbix[]): AlvoZabbix | undefined {
  const deTrafego = alvos.filter((a) => !a.hide && /Interface/.test(a.item?.filter ?? ''));
  return deTrafego.find((a) => a.refId === 'A') ?? deTrafego[0];
}

/** O molde com o host e o item trocados pelos de um link so. */
export function alvoDoLink(molde: AlvoZabbix, host: string, iface: string): AlvoZabbix {
  return {
    ...molde,
    refId: 'HISTORICO',
    // Sem host conhecido (serie sem o "HOST: " e sem label), fica o filtro do
    // molde: /^$/ nao casaria host nenhum e toda janela longa viria vazia.
    host: host ? { ...(molde.host ?? {}), filter: `/^${literal(host)}$/` } : molde.host,
    item: {
      ...(molde.item ?? {}),
      // O "(" logo depois do nome e o que separa Gi0/0/0/1 de Gi0/0/0/10 e
      // de Gi0/0/0/1.100.
      filter: `/^Interface ${literal(iface)}\\s*\\(.*\\): (?:Bits received|Bits sent)$/`,
    },
  };
}

/** Promise ou Observable: o DataSourceApi.query pode devolver os dois. */
function ultimaResposta(r: unknown): Promise<DataQueryResponse> {
  const obs = r as { subscribe?: Function };
  if (typeof obs?.subscribe !== 'function') return Promise.resolve(r as DataQueryResponse);
  return new Promise((ok, falha) => {
    let ultima: DataQueryResponse | undefined;
    obs.subscribe!({
      next: (v: DataQueryResponse) => { ultima = v; },
      error: falha,
      complete: () => (ultima ? ok(ultima) : falha(new Error('o datasource não respondeu nada'))),
    });
  });
}

/** O periodo pedido: N horas ate o fim do dashboard (os botoes 24h/2d/7d), ou
 *  as duas pontas de um periodo livre (o seletor de tempo do cartao). */
export type PeriodoHistorico = { horas: number } | { de: number; ate: number };

/** As duas pontas, em ms. As horas terminam no fim da janela do dashboard:
 *  olhando ontem, "2d" sao os dois dias ate ontem. */
export function pontasDoPeriodo(p: PeriodoHistorico, fimDoDashboard: number): [number, number] {
  return 'horas' in p ? [fimDoDashboard - p.horas * 3600_000, fimDoDashboard] : [p.de, p.ate];
}

/** Intervalos redondos, em segundos — os blocos do grafico. Com eles a
 *  amostragem sai "5 minutos" ou "3 horas", como no MRTG, e nao 173 s. */
const REDONDOS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** O menor intervalo redondo que cabe `pontos` pontos no periodo. Nunca
 *  menos de 1 min: e a coleta do Zabbix no melhor caso. */
export function intervaloRedondo(periodoMs: number, pontos: number): number {
  const minimo = periodoMs / pontos / 1000;
  const s = REDONDOS.find((r) => r >= minimo) ?? Math.ceil(minimo / 86400) * 86400;
  return s * 1000;
}

/** consolidateBy(max): o datasource le os trends pelo MAXIMO de cada hora e,
 *  ao juntar os pontos em blocos, fica com o maior de cada bloco. Lido pelo
 *  nome, com o parametro como texto (getConsolidateBy, pkg/datasource/zabbix.go
 *  do grafana-zabbix 6.3.0). */
const CONSOLIDA_PELO_MAXIMO = {
  def: {
    name: 'consolidateBy', category: 'Special',
    params: [{ name: 'type', type: 'string', options: ['sum', 'avg', 'min', 'max'] }],
    defaultParams: ['avg'],
  },
  params: ['max'],
  text: 'consolidateBy(max)',
};

/** O alvo do link pedindo o pico: as funcoes do molde ficam, e um
 *  consolidateBy que ja houvesse da lugar ao max. */
export function alvoDoPico(alvo: AlvoZabbix): AlvoZabbix {
  const funcoes = ((alvo.functions as Array<{ def?: { name?: string } }> | undefined) ?? [])
    .filter((f) => f?.def?.name !== 'consolidateBy');
  return { ...alvo, refId: 'HISTORICO_PICO', functions: [...funcoes, CONSOLIDA_PELO_MAXIMO] };
}

export interface HistoricoLongo {
  /** A media de cada bloco: a linha (e a area da entrada). */
  rx?: Amostras;
  tx?: Amostras;
  /** O maior valor de cada bloco: a faixa clara. Falta quando o pedido do
   *  pico falhou — o grafico sai so com a media, sem erro. */
  pico?: { rx?: Amostras; tx?: Amostras };
}

/**
 * Busca o historico de RX/TX de um link no periodo pedido: a media e o pico
 * de cada bloco, em dois pedidos ao mesmo tempo.
 *
 * Dois pedidos, e nao duas queries num pedido so: o datasource junta as
 * series com o mesmo horario num frame "largo", e a media e o pico tem o
 * MESMO nome ("...: Bits received") — nao daria mais pra separar.
 */
export async function buscarHistorico(
  pedido: DataQueryRequest | undefined, link: Link, periodo: PeriodoHistorico, fimDoDashboard: number,
  /** A query do painel que serve de molde, quando quem chama sabe qual e (no
   *  plugin de topologia, o refId do binding de trafego). Sem ela, vale a que
   *  busca "Interface ..." no campo Item. */
  refId?: string
): Promise<HistoricoLongo> {
  const alvos = (pedido?.targets ?? []) as unknown as AlvoZabbix[];
  const molde = (refId ? alvos.find((a) => a.refId === refId && !a.hide) : undefined) ?? alvoDeTrafego(alvos);
  if (!molde) throw new Error('não achei a query de tráfego do painel (a que busca "Interface ...")');
  const [inicio, fim] = pontasDoPeriodo(periodo, fimDoDashboard);
  if (!(fim > inicio)) throw new Error('o período termina antes de começar');

  // Ate 1000 pontos. O datasource so junta em blocos quando passa disso, e
  // ai usa o intervalo: redondo, a amostragem fica legivel.
  const pontos = 1000;
  const intervalMs = intervaloRedondo(fim - inicio, pontos);
  const de = dateTime(inicio);
  const ateDt = dateTime(fim);
  const alvo = alvoDoLink(molde, link.host, link.iface);
  const ds = await getDataSourceSrv().get(molde.datasource as never);

  const pede = async (t: AlvoZabbix, sufixo: string) => {
    const req = {
      // requestId distinto por pedido: o backendSrv cancela o que estiver em
      // andamento com o mesmo id — o pedido do pico mataria o da media.
      requestId: `cartao-historico-${Date.now()}-${sufixo}`,
      interval: `${Math.round(intervalMs / 1000)}s`,
      intervalMs,
      maxDataPoints: pontos,
      range: { from: de, to: ateDt, raw: { from: de, to: ateDt } },
      rangeRaw: { from: de, to: ateDt },
      scopedVars: pedido?.scopedVars ?? {},
      targets: [t],
      timezone: pedido?.timezone ?? 'browser',
      app: 'dashboard',
      startTime: Date.now(),
    } as unknown as DataQueryRequest;
    const resp = await ultimaResposta(ds.query(req));
    if (resp.errors?.length || resp.error) {
      const e = resp.errors?.[0] ?? resp.error;
      throw new Error(e?.message || 'o datasource devolveu erro');
    }
    const achado = extrairLinks((resp.data ?? []) as DataFrame[])
      .find((l) => l.iface === link.iface && (!l.host || !link.host || l.host === link.host));
    return { rx: achado?.historico?.rx, tx: achado?.historico?.tx };
  };

  const [media, pico] = await Promise.all([
    pede(alvo, 'media'),
    pede(alvoDoPico(alvo), 'pico').catch(() => undefined),
  ]);
  return { ...media, pico: pico && (pico.rx || pico.tx) ? pico : undefined };
}
