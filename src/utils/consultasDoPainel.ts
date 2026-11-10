// utils/consultasDoPainel.ts — lê e troca as consultas do próprio painel.
//
// O Grafana não dá a um painel um caminho oficial para alterar as próprias
// consultas: o painel recebe os dados prontos. O que existe é o objeto interno
// do dashboard (window.__grafanaSceneContext, Grafana 11+), em que cada painel
// guarda quem busca os dados dele, com a lista de consultas.
//
// Por ser interno, pode mudar de forma numa versão futura. Por isso tudo aqui
// devolve null quando não acha exatamente o que espera — e quem usa esconde os
// botões e fica só com o copiar-e-colar, que não depende de nada disto.

import { FiltroDaConsulta } from './filtroExato';

/** O filtro que estava na consulta antes do exato, para poder voltar. */
export interface FiltroGuardado {
  host: string;
  item: string;
}
export type FiltroLargo = Record<string, FiltroGuardado>;

interface Buscador {
  state: { queries: any[] };
  setState: (s: { queries: any[] }) => void;
  runQueries: () => void;
}

/** Quem busca os dados do painel `panelId`, ou null. */
function buscadorDoPainel(panelId: number): Buscador | null {
  try {
    const cena = (window as any).__grafanaSceneContext;
    if (!cena?.state) return null;
    const chave = `panel-${panelId}`;
    let painel: any = null;
    const anda = (o: any, prof: number) => {
      if (painel || !o || prof > 12) return;
      if (o.state?.key === chave && o.state?.pluginId) {
        painel = o;
        return;
      }
      if (typeof o.forEachChild === 'function') o.forEachChild((f: any) => anda(f, prof + 1));
    };
    anda(cena, 0);
    // Os dados do painel passam por camadas (transformações) até chegar em
    // quem tem as consultas
    let d = painel?.state?.$data;
    for (let i = 0; d && i < 5; i++) {
      if (Array.isArray(d.state?.queries) && typeof d.setState === 'function' && typeof d.runQueries === 'function') return d;
      d = d.state?.$data;
    }
    return null;
  } catch {
    return null;
  }
}

/** Consulta de métricas do Zabbix: tem os campos Host e Item com filtro. */
const temHostEItem = (q: any) => typeof q?.host?.filter === 'string' && typeof q?.item?.filter === 'string';

/** Dá para trocar o filtro deste painel sozinho? */
export function podeTrocarConsultas(panelId: number): boolean {
  return !!buscadorDoPainel(panelId)?.state.queries.some(temHostEItem);
}

function troca(panelId: number, novo: (q: any) => FiltroGuardado | undefined): FiltroLargo | null {
  const b = buscadorDoPainel(panelId);
  if (!b) return null;
  const anteriores: FiltroLargo = {};
  const queries = b.state.queries.map((q) => {
    const f = temHostEItem(q) ? novo(q) : undefined;
    if (!f || (f.host === q.host.filter && f.item === q.item.filter)) return q;
    anteriores[q.refId] = { host: q.host.filter, item: q.item.filter };
    return { ...q, host: { ...q.host, filter: f.host }, item: { ...q.item, filter: f.item } };
  });
  if (Object.keys(anteriores).length === 0) return anteriores;
  try {
    b.setState({ queries });
    b.runQueries();
  } catch {
    return null;
  }
  return anteriores;
}

/** Põe o filtro exato nas consultas. Devolve o que estava em cada consulta
 *  trocada (vazio = já estava igual), ou null se não deu para trocar. */
export function aplicarFiltroExato(panelId: number, consultas: FiltroDaConsulta[]): FiltroLargo | null {
  return troca(panelId, (q) => {
    const c = consultas.find((x) => x.refId === q.refId);
    return c?.host ? { host: c.host, item: c.item } : undefined;
  });
}

/** Devolve às consultas o filtro guardado. false se não deu para trocar. */
export function voltarFiltroLargo(panelId: number, largo: FiltroLargo): boolean {
  return troca(panelId, (q) => largo[q.refId]) !== null;
}
