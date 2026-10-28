// utils/publicacao.ts — limpa a configuração do painel para a cópia pública.
//
// Num dashboard compartilhado externamente, o JSON do dashboard vai inteiro
// para o navegador do visitante (é com ele que o painel se desenha). O modo
// público esconde da TELA, mas os IPs digitados nos equipamentos, o token do
// Globalping e os bindings de IP, potência e erros continuavam lá, legíveis
// no F12. Isto tira o que o mapa público não usa; tráfego, status, speed,
// nomes, posições, rotas e regras de cor ficam.

import { NetworkTopology, PanelOptions } from '../types';

const IP_DO_LINK = ['sourceIpBinding', 'targetIpBinding', 'sourceIp', 'targetIp'];
const ERROS_DO_LINK = ['sourceErrorBinding', 'targetErrorBinding', 'sourceErrors', 'targetErrors'];
const OPTICA_DO_LINK = [
  'sourceDomTempBinding', 'sourceDomVoltBinding', 'sourceDomBiasBinding', 'sourceDomTxPowerBinding', 'sourceDomRxPowerBinding',
  'sourceDomTemp', 'sourceDomVolt', 'sourceDomBias', 'sourceDomTxPower', 'sourceDomRxPower',
  'targetDomTempBinding', 'targetDomVoltBinding', 'targetDomBiasBinding', 'targetDomTxPowerBinding', 'targetDomRxPowerBinding',
  'targetDomTemp', 'targetDomVolt', 'targetDomBias', 'targetDomTxPower', 'targetDomRxPower',
  'sourceOpticThresholdBindings', 'targetOpticThresholdBindings', 'sourceOpticThresholds', 'targetOpticThresholds',
  'sourceModuleInfoBindings', 'targetModuleInfoBindings', 'sourceModuleInfo', 'targetModuleInfo',
];
/** O IP do nó não é apagado: vira zeros do mesmo tamanho. É o texto do IP
 *  que dá a largura do nó (costuma ser mais largo que o nome), e as âncoras
 *  das linhas são fração do tamanho do nó — apagar encolhia o nó e entortava
 *  as rotas manuais. Os zeros não dizem nada além do comprimento. */
const mascara = (ip: string) => ip.replace(/\S/g, '0');
const jaMascarado = (ip: string) => /^[0\s]*$/.test(ip);

/** Quanto saiu, por tipo — o que o botão conta antes de confirmar. */
export interface Limpeza {
  /** Equipamentos com IP ou link de dashboard */
  nos: number;
  /** Links com IP, erros ou óptica */
  links: number;
  token: boolean;
}

/** Remove os campos (presentes) de um objeto; diz se tirou algum. */
function sem<T extends object>(obj: T, campos: string[]): [T, boolean] {
  const copia = { ...obj } as Record<string, unknown>;
  let tirou = false;
  for (const c of campos) {
    if (copia[c] !== undefined) {
      delete copia[c];
      tirou = true;
    }
  }
  return [copia as T, tirou];
}

export function limparParaPublicacao(options: PanelOptions): { options: PanelOptions; limpeza: Limpeza } {
  const topo: NetworkTopology | undefined = options.topology;
  const limpeza: Limpeza = { nos: 0, links: 0, token: !!options.globalpingToken };
  if (!topo) {
    return { options: { ...options, globalpingToken: '' }, limpeza };
  }
  const nodes = topo.nodes.map((n) => {
    const ip = n.data?.ip;
    const trocaIp = !!ip && !jaMascarado(ip);
    const [semLink, tirouLink] = sem(n.data, ['linkUrl']);
    if (!trocaIp && !tirouLink) return n;
    limpeza.nos++;
    return { ...n, data: trocaIp ? { ...semLink, ip: mascara(ip!) } : semLink };
  });
  const edges = topo.edges.map((e) => {
    const [data, tirou] = sem(e.data ?? {}, [...IP_DO_LINK, ...ERROS_DO_LINK, ...OPTICA_DO_LINK]);
    if (tirou) limpeza.links++;
    return tirou ? { ...e, data } : e;
  });
  return { options: { ...options, globalpingToken: '', topology: { ...topo, nodes, edges } }, limpeza };
}
