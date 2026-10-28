// types.ts — o modelo do painel e as opcoes que o usuario configura.

import { Alias } from './utils/alias';
import { Optica } from './utils/optica';

export type Estado = 'up' | 'down' | 'partial' | 'unknown';

/** Uma serie temporal, em dois arrays paralelos: `t[i]` é o instante de `v[i]`.
 *  Dois arrays em vez de um array de pares porque e assim que o DataFrame do
 *  Grafana ja entrega — converter so pra reconverter no SVG seria trabalho. */
export interface Amostras {
  /** Epoch em milissegundos. */
  t: number[];
  v: number[];
}

/**
 * Desde quando algo esta no estado em que esta.
 *
 * Sai do historico da janela do dashboard, entao so enxerga o que a janela
 * cobre. `noMinimo`: o estado ja era esse no primeiro ponto da janela — a
 * troca aconteceu antes, e a tela tem que dizer "ha mais de", nao "ha".
 */
export interface Desde {
  /** Epoch em milissegundos. */
  t: number;
  noMinimo: boolean;
  /**
   * De onde veio a data.
   *   zabbix  o inicio do problema (query de Problems): a hora exata da
   *           queda, nao importa quanto tempo o dashboard mostra.
   *   janela  a serie de status da query A: so enxerga a janela.
   */
  fonte?: 'zabbix' | 'janela';
}

/** Uma interface fisica monitorada. */
export interface Link {
  /** Roteador onde a interface esta — vem do host do Zabbix. */
  host: string;
  /** Nome da interface local, como o roteador chama. */
  iface: string;
  /** A description, ja lida. */
  alias: Alias;
  /** Texto cru da description, para o tooltip e a busca. */
  descricao: string;

  /**
   * IPs da interface NO ROTEADOR (lado do backbone), do item "Endereço IP".
   * Nao e o IP da instituicao: o do outro lado do enlace depende da mascara,
   * que o item nao traz, e deduzir seria chute.
   */
  ip?: string[];

  estado: Estado;
  /** Desde quando o `estado` e esse — da serie de Operational status. */
  estadoDesde?: Desde;
  /** Ultimo valor de trafego, em bits/s. Ausente quando o Zabbix nao mandou
   *  valor na janela — e NAO zero: "0 b/s, uso 0%" diria que o link esta
   *  ocioso, quando na verdade nao ha medida. */
  rx?: number;
  tx?: number;

  /**
   * Capacidade da interface, em bits/s.
   *
   * `undefined` e 0 sao coisas diferentes e a UI precisa saber qual e qual:
   * undefined = o item de Speed nao chegou na query (ou nao tem amostra na
   * janela de tempo, porque o Zabbix costuma gravar Speed so quando muda);
   * 0 = o item chegou dizendo zero, que e o agente SNMP reportando
   * ifHighSpeed=0. Colapsar os dois em 0 fazia a coluna mostrar "—" nos dois
   * casos e nao havia como saber onde procurar.
   */
  speed?: number;
  errosIn: number;
  errosOut: number;
  descartesIn: number;
  descartesOut: number;

  /**
   * Historico de RX/TX da janela do dashboard, para o grafico do modal.
   *
   * `undefined` quando a query devolveu menos de dois pontos — o que acontece
   * de propria com "Max data points = 1", usado pra aliviar o painel. Os dois
   * objetivos brigam: o grafico quer pontos, o resto do painel nao usa
   * nenhum alem do ultimo.
   */
  historico?: { rx?: Amostras; tx?: Amostras };

  /**
   * Potencia optica, quando o template do PoP coleta.
   *
   * Vem do "Cisco 8201 Optical Monitoring", que entrega os limiares do
   * proprio transceiver — nao ha faixa fixa aqui, cada SFP tem a dele.
   */
  optica?: Optica;

  /**
   * A optica veio da porta fisica, nao desta interface.
   *
   * Acontece com toda subinterface: o transceiver mora na fisica. O dado e
   * verdadeiro, mas e da FIBRA — outras subinterfaces na mesma porta mostram
   * exatamente a mesma potencia. A UI precisa dizer isso, senao um LOS na
   * porta parece um problema so deste cliente.
   *
   * `outrosNoPainel` conta so o que a query trouxe: servicos filtrados fora
   * da query A tambem estao nessa fibra e nao entram na conta. E um piso.
   */
  opticaHerdada?: { porta: string; outrosNoPainel: number };
}

/**
 * Uma instituicao e TODOS os links dela — inclusive quando estao em aneis
 * diferentes ou chegam por PoPs diferentes.
 *
 * Isso e o ponto do painel. No dashboard antigo a chave do card era
 * anel+sigla, entao uma instituicao com dois links (um anel por um PoP, outro
 * anel por outro PoP) virava dois cards e ninguem via que era a mesma, com
 * redundancia. Aqui a chave e so a sigla; anel, arco e via viram atributo
 * de cada link.
 */
export interface Instituicao {
  sigla: string;
  links: Link[];

  /** Todos os aneis onde a instituicao tem link. Normalmente um, as vezes dois. */
  aneis: string[];
  /** Operadoras por onde ela chega, se nao for por fibra propria da rede. */
  operadoras: string[];
  /** PoPs que a atendem. */
  pops: string[];

  estado: Estado;
  /**
   * Desde quando a instituicao esta assim, quando esta fora ou sem
   * redundancia. Fora: desde que caiu o ULTIMO link — foi ai que o servico
   * parou. Sem redundancia: desde que caiu o PRIMEIRO — foi ai que a
   * protecao acabou.
   */
  desde?: Desde;
  up: number;
  total: number;
  /** Soma dos links que tem medida; ausente se nenhum tem. */
  rx?: number;
  tx?: number;
  erros: number;
  descartes: number;
  /** Quantos links ainda estao com a description antiga. */
  legados: number;

  /**
   * Pior estado optico entre os links, quando ha DOM coletado.
   *
   * Fica separado do `estado` de proposito: um link com potencia caindo
   * continua operational up. E justamente o caso que o NOC quer ver antes
   * de virar queda — se entrasse no estado geral, sumiria no meio dos
   * links realmente fora do ar.
   */
  optica?: { sev: number; label: string };
}

/** Por qual campo os cards sao agrupados na tela. */
export type Agrupamento = 'anel' | 'arco' | 'via' | 'papel' | 'pop' | 'nenhum';

export interface PanelOptions {
  /** Tipos que entram no painel. Por padrao so instituicao. */
  tipos: string[];
  agruparPor: Agrupamento;
  /** Ordena os cards com problema primeiro. */
  problemasPrimeiro: boolean;
  /** Esconde instituicao cujos links estao todos up. */
  soProblemas: boolean;
  mostrarBusca: boolean;
  /** Percentual de uso a partir do qual o card fica laranja. */
  limiteAtencao: number;
  /** E o vermelho. */
  limiteCritico: number;
  fontScale: number;
  /** Mostra o contador de quantas descriptions ja migraram. */
  mostrarMigracao: boolean;
  /** Mostra, no topo do painel, o que cada query entregou e com que nome. */
  diagnostico: boolean;
  /** Coluna lateral com o ranking de problemas e de uso. */
  mostrarRanking: boolean;
  /** "Mais usados" por banda (quem mais trafega) ou por % da capacidade. */
  ordemUso: 'banda' | 'pct';
  /** Que tipos de problema entram na lista de Atencao (TipoProblema). */
  tiposProblema: string[];
  /** Largura do ranking lateral, em % do painel. */
  larguraRanking: number;
  /** Tamanho da letra do ranking, multiplicando o do painel. */
  escalaRanking: number;
  /** Modo telão: os cards rolam sozinhos, uma tela de cada vez. */
  rotacao: boolean;
  /** Quanto tempo cada tela fica parada. */
  rotacaoSegundos: number;
}

export const DEFAULT_OPTIONS: PanelOptions = {
  tipos: ['INST'],
  agruparPor: 'anel',
  problemasPrimeiro: true,
  soProblemas: false,
  mostrarBusca: true,
  limiteAtencao: 50,
  limiteCritico: 80,
  fontScale: 1,
  mostrarMigracao: true,
  diagnostico: false,
  mostrarRanking: true,
  ordemUso: 'banda',
  // Todos, como sempre foi. Os mesmos valores de TIPOS_PROBLEMA (ranking.ts),
  // repetidos aqui pra este arquivo nao depender do ranking.
  tiposProblema: ['queda', 'redundancia', 'optica', 'uso', 'erros', 'descartes', 'sem-status'],
  // Mais largo e maior que antes (era ate 400px, letra 1x): num telao a
  // coluna ficava estreita e a letra pequena pra ler de longe.
  larguraRanking: 32,
  escalaRanking: 1.15,
  rotacao: false,
  rotacaoSegundos: 15,
};

// A ordem dos aneis na tela (ORDEM_ANEL / posicaoAnel) ficou so na origem:
// e a lista dos aneis desta rede, e este plugin nao agrupa por anel.
