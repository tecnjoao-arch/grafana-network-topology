// utils/historicoPublico.ts — a janela longa (24h/2d/7d) de UMA interface no
// dashboard compartilhado externamente (público).
//
// Lá o visitante é anônimo e não pode montar query: o Grafana só roda as
// queries SALVAS do painel, pelo endpoint público, recebendo apenas o período
// (publicDashboardQueryHandler do @grafana/runtime 12.4). A busca do cartão,
// que troca host e item da query, não passa. Então o modal pede o painel
// inteiro na janela longa — sem mexer no período do mapa — e fica só com a
// interface aberta. Mais pesado que a busca interna (uma interface), mas com
// a cópia pública leve e as tendências do Zabbix a semana sai em segundos.
//
// O servidor só usa o período pedido se o compartilhamento liberar a escolha
// de tempo (TimeSelectionEnabled); sem isso ele devolve o período padrão do
// dashboard — e o gráfico diria "7d" mostrando 3 horas. Por isso a checagem
// no fim.

import { DataFrame, DataQueryRequest } from '@grafana/data';
import { config, getBackendSrv, toDataQueryResponse } from '@grafana/runtime';
import { extrairLinks } from '../cartao/utils/dados';
import { HistoricoLongo, intervaloRedondo, PeriodoHistorico, pontasDoPeriodo } from '../cartao/utils/historico';
import type { Link } from '../cartao/types';

/** No dashboard público? (o token da URL pública vem no config da página) */
export function noDashboardPublico(): boolean {
  return !!config.publicDashboardAccessToken;
}

export async function buscarHistoricoPublico(
  pedido: DataQueryRequest | undefined, link: Link, periodo: PeriodoHistorico, fimDoDashboard: number
): Promise<HistoricoLongo> {
  const token = config.publicDashboardAccessToken;
  const painel = pedido?.panelId;
  if (!token || painel === undefined) {
    throw new Error('fora de um dashboard compartilhado');
  }
  const [inicio, fim] = pontasDoPeriodo(periodo, fimDoDashboard);
  if (!(fim > inicio)) {
    throw new Error('o período termina antes de começar');
  }
  const corpo = {
    intervalMs: intervaloRedondo(fim - inicio, 1000),
    maxDataPoints: 1000,
    timeRange: { from: String(inicio), to: String(fim), timezone: pedido?.timezone ?? 'browser' },
  };
  const resposta = await getBackendSrv().post(`/api/public/dashboards/${token}/panels/${painel}/query`, corpo, {
    showErrorAlert: false,
    requestId: `topologia-historico-publico-${Date.now()}`,
  });
  const frames = (toDataQueryResponse({ data: resposta }).data ?? []) as DataFrame[];

  // Período ignorado pelo servidor: nenhuma série chega perto do início pedido.
  let primeiro = Infinity;
  for (const f of frames) {
    const t = f.fields.find((c) => c.type === 'time')?.values as unknown as number[] | undefined;
    if (t?.length) primeiro = Math.min(primeiro, Number(t[0]));
  }
  if (primeiro !== Infinity && primeiro > inicio + (fim - inicio) / 2) {
    throw new Error('o compartilhamento deste dashboard não libera a escolha de período');
  }

  const achado = extrairLinks(frames)
    .find((l) => l.iface === link.iface && (!l.host || !link.host || l.host === link.host));
  return { rx: achado?.historico?.rx, tx: achado?.historico?.tx };
}
