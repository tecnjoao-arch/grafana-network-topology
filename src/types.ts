// types.ts — Estrutura de dados da topologia de rede

import { MetricBinding } from './utils/dataBinding';
export type { MetricBinding } from './utils/dataBinding';

export type DeviceType =
  | 'router'
  | 'router_modern'
  | 'router_3d'
  | 'router_cloud'
  | 'switch'
  | 'l3switch'
  | 'firewall'
  | 'server'
  | 'olt'
  | 'cgnat'
  | 'loadbalancer'
  | 'wifi'
  | 'antenna'
  | 'cloud'
  | 'internet'
  | 'database'
  | 'storage'
  | 'desktop'
  | 'laptop'
  | 'phone'
  | 'camera'
  | 'rack'
  | 'datacenter'
  | 'ups'
  | 'vm'
  | 'generic'
  | 'custom';

export type LinkStatus = 'up' | 'down' | 'warning' | 'unknown';
export type StatusOperator = '>' | '>=' | '==' | '<=' | '<' | '!=';

export interface ValueMapping {
  value: string;             // Valor esperado (ex: "0", "1", "OK", "DOWN")
  color: string;             // Cor associada (ex: "#FF0000")
  animation?: LineAnimation; // Animação associada (para cabos)
  lineStyle?: LineStyle;     // Traçado associado (sólida/tracejada/etc — para cabos)
}

/** Traçado da linha */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/** Quais cards de interface mostrar num link. */
export type CardsSide = 'both' | 'source' | 'target' | 'none';
export const CARDS_SIDES: CardsSide[] = ['both', 'source', 'target', 'none'];

/** Por que o status é o que é — vira texto na tela, para o operador saber se
 *  manda técnico ao campo ou revisa a configuração. */
export type StatusCause =
  | 'nodata'          // datasource não respondeu: nada é confiável agora
  | 'ping'            // equipamento não responde ao binding de status do nó
  | 'iface'           // ifOperStatus de algum lado diz down
  | 'sem-coleta'      // binding configurado, série existe mas parou de atualizar
  | 'sem-serie'       // binding configurado e nenhuma série casa (config? item removido?)
  | 'inferido'        // sem operStatus: up deduzido de tráfego fresco
  | 'nao-configurado'; // nada amarrado — indeterminado, nunca verde

/** Animação da linha (independente do traçado) */
export type LineAnimation = 'none' | 'flow' | 'reverse' | 'pulse' | 'glow';

/** Formato/Roteamento da Linha */
export type PathType = 'straight' | 'curved' | 'step';

export const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted', 'double'];
export const LINE_ANIMATIONS: LineAnimation[] = ['none', 'flow', 'reverse', 'pulse', 'glow'];
export const PATH_TYPES: PathType[] = ['straight', 'curved', 'step'];

/** Conteúdo do rodapé do card de interface (linha abaixo do tráfego ↑/↓) */
export type LabelFooter = 'speed' | 'fiber' | 'both' | 'none';
export const LABEL_FOOTERS: LabelFooter[] = ['speed', 'fiber', 'both', 'none'];

/** Chaves dos limiares ópticos de potência (Alarm/Warning × High/Low),
 *  espelhando os itens do Zabbix ("Rx Threshold Alarm High" etc). */
export const OPTIC_KEYS = [
  'rxAlarmHigh', 'rxAlarmLow', 'rxWarnHigh', 'rxWarnLow',
  'txAlarmHigh', 'txAlarmLow', 'txWarnHigh', 'txWarnLow',
] as const;
export type OpticKey = (typeof OPTIC_KEYS)[number];

/** Bindings de info do módulo óptico (itens de texto do Zabbix) */
export interface ModuleInfoBindings {
  model?: MetricBinding;
  serial?: MetricBinding;
  mediaType?: MetricBinding;
}

/** Info do módulo óptico resolvida (ex: "QSFP-100G-DR-S", "INL26240JV8", "Fiber") */
export interface ModuleInfo {
  model?: string;
  serial?: string;
  mediaType?: string;
}

/** Um equipamento no diagrama (nó) */
export interface DeviceNodeData {
  label: string;
  ip?: string;
  deviceType: DeviceType;
  /** Para deviceType === 'custom' — base64 ou URL do ícone */
  customIcon?: string;
  /** Estado atual (definido por binding de dados) */
  status?: LinkStatus;
  /** Métricas opcionais exibidas no tooltip */
  metrics?: Record<string, string | number>;
  /** Cor fixa do ícone (sobrescreve a cor automática por status) */
  color?: string;
  /** Tamanho do ícone em px (padrão 56) */
  iconSize?: number;
  /** Binding de status: resolve up/down baseado na regra */
  statusBinding?: MetricBinding;
  /** Operador para comparar com o valor do statusBinding (ex: '>', '==') */
  statusOperator?: StatusOperator;
  /** Valor numérico para comparar (ex: 0, 1) */
  statusValue?: number;
  /** Regras de mapeamento estilo Flowcharting (Valor -> Cor) */
  colorMappings?: ValueMapping[];
  /** Link externo ou de outro dashboard */
  linkUrl?: string;
  /** Largura do container do nó (px) */
  nodeWidth?: number;
  /** Altura do container do nó (px) */
  nodeHeight?: number;
  /** Arredondamento da borda do container (px) */
  borderRadius?: number;
  /** Cor de fundo customizada do container */
  bgColor?: string;
  /** Exigido pelo React Flow v12: o data de um Node precisa satisfazer Record<string, unknown> */
  [key: string]: unknown;
}

/** Uma conexão entre dois equipamentos (aresta) */
export interface LinkEdgeData {
  /** Nome da interface no lado origem (ex: "Te0/0/0/1") */
  sourceInterface?: string;
  /** Nome da interface no lado destino */
  targetInterface?: string;
  /** Mostrar caixa de tráfego sobre a aresta? */
  showTrafficBox?: boolean;
  /** Rodapé do card de interface: velocidade (padrão), potência da fibra, ambos ou nada */
  labelFooter?: LabelFooter;
  /** Tráfego de upload em bps */
  trafficUp?: number;
  /** Tráfego de download em bps */
  trafficDown?: number;
  /** Tráfego resolvido específico do Lado A (Origem) */
  sourceTrafficUp?: number;
  sourceTrafficDown?: number;
  /** Tráfego resolvido específico do Lado B (Destino) */
  targetTrafficUp?: number;
  targetTrafficDown?: number;
  /** Velocidade nominal do link em bps (ex: 10 Gb/s = 10_000_000_000) */
  linkSpeed?: number;
  /** Estado do link */
  status?: LinkStatus;
  /** Cor fixa da linha (sobrescreve a cor automática por status/uso) */
  color?: string;
  /** Traçado da linha */
  lineStyle?: LineStyle;
  /** Animação da linha */
  animation?: LineAnimation;
  /** Regras de mapeamento estilo Flowcharting (Valor -> Cor/Animação) */
  colorMappings?: ValueMapping[];
  /** Formato de curva da linha */
  pathType?: PathType;
  /** Espessura fixa da linha (px). Se ausente, varia com a utilização */
  lineWidth?: number;
  /** Âncora livre no nó de origem: fração 0..1 do bounding box do nó
   *  (0,0 = canto sup-esq, 1,1 = canto inf-dir). Ausente = automático (flutuante) */
  sourceAnchor?: { x: number; y: number };
  /** Âncora livre no nó de destino (mesma convenção). Ausente = automático */
  targetAnchor?: { x: number; y: number };
  /** Pontos de dobra manuais (coordenadas do flow). Vazio = linha reta/automática */
  waypoints?: Array<{ x: number; y: number }>;
  /** Deslocamento manual do card de interface (arrastável no modo edição) */
  sourceLabelOffset?: { x: number; y: number };
  targetLabelOffset?: { x: number; y: number };
  /** Binding: tráfego de upload (bps) vindo de uma série */
  trafficUpBinding?: MetricBinding;
  /** Binding: tráfego de download (bps) */
  trafficDownBinding?: MetricBinding;
  /** Binding específicos de tráfego de origem (Lado A) */
  sourceTrafficUpBinding?: MetricBinding;
  sourceTrafficDownBinding?: MetricBinding;
  /** Binding específicos de tráfego de destino (Lado B) */
  targetTrafficUpBinding?: MetricBinding;
  targetTrafficDownBinding?: MetricBinding;
  /** Inverter direção dos ângulos de 90 graus (step bends) */
  flipBends?: boolean;
  /** Binding: capacidade do link (bps) */
  speedBinding?: MetricBinding;
  /** Binding: IP associado à interface de origem (string) */
  sourceIpBinding?: MetricBinding;
  /** Binding: IP associado à interface de destino (string) */
  targetIpBinding?: MetricBinding;
  /** Apagado: um nó adjacente está down (uso interno; injetado via painel) */
  dimmed?: boolean;
  /** Estado global: mostrar IP (injetado via painel) */
  showIp?: boolean;
  /** Valor resolvido do IP origem (uso interno) */
  sourceIp?: string;
  /** Valor resolvido do IP destino (uso interno) */
  targetIp?: string;
  
  /** Binding: erros/drops de origem */
  sourceErrorBinding?: MetricBinding;
  /** Binding: erros/drops de destino */
  targetErrorBinding?: MetricBinding;
  /** Valor resolvido de erros de origem (uso interno) */
  sourceErrors?: number;
  /** Valor resolvido de erros de destino (uso interno) */
  targetErrors?: number;
  
  /** Binding de status customizado para a aresta (se necessário para thresholds).
   *  LEGADO: mantido para mapas montados antes dos bindings por lado. Continua
   *  valendo como termo adicional — se disser down, o link fica down. */
  statusBinding?: MetricBinding;

  /** Status operacional da interface de CADA lado (ifOperStatus). O link só é
   *  'up' se AMBOS os lados configurados estiverem up: com um binding só, o
   *  status vinha de um lado e o link ficava verde com o vizinho morto. */
  sourceStatusBinding?: MetricBinding;
  targetStatusBinding?: MetricBinding;
  /** Regra de leitura dos bindings de status acima. O padrão do plugin é o
   *  ifOperStatus do Zabbix (1=up, 2=down) — atenção: um operador '>' com alvo
   *  0 leria 2 (down) como UP, que é o erro clássico dessa métrica. */
  statusOperator?: StatusOperator;
  statusValue?: number;

  /** Quais cards de interface exibir neste link. Ausente = 'both'.
   *  Esconder é só visual: bindings e nome da interface continuam salvos. */
  cardsSide?: CardsSide;

  /** Aparência deste link quando DOWN. Ausente = usa a opção do painel. */
  downColor?: string;
  downLineStyle?: LineStyle;
  downAnimation?: LineAnimation;

  /** Causa do status atual (calculada ao vivo, não persistida) */
  statusCause?: StatusCause;
  /** Texto pronto explicando a causa (ao vivo, não persistido) */
  statusDetail?: string;

  /** Métricas de Fibra DOM - Origem (Lado A) */
  sourceDomTempBinding?: MetricBinding;
  sourceDomVoltBinding?: MetricBinding;
  sourceDomBiasBinding?: MetricBinding;
  sourceDomTxPowerBinding?: MetricBinding;
  sourceDomRxPowerBinding?: MetricBinding;

  sourceDomTemp?: number;
  sourceDomVolt?: number;
  sourceDomBias?: number;
  sourceDomTxPower?: number;
  sourceDomRxPower?: number;

  /** Métricas de Fibra DOM - Destino (Lado B) */
  targetDomTempBinding?: MetricBinding;
  targetDomVoltBinding?: MetricBinding;
  targetDomBiasBinding?: MetricBinding;
  targetDomTxPowerBinding?: MetricBinding;
  targetDomRxPowerBinding?: MetricBinding;

  /** Limiares ópticos por lado (auto-preenchidos pela detecção; ignoram staleness) */
  sourceOpticThresholdBindings?: Partial<Record<OpticKey, MetricBinding>>;
  targetOpticThresholdBindings?: Partial<Record<OpticKey, MetricBinding>>;
  /** Limiares resolvidos (uso interno) */
  sourceOpticThresholds?: Partial<Record<OpticKey, number>>;
  targetOpticThresholds?: Partial<Record<OpticKey, number>>;
  /** Info do módulo óptico por lado (texto; auto-preenchida) */
  sourceModuleInfoBindings?: ModuleInfoBindings;
  targetModuleInfoBindings?: ModuleInfoBindings;
  /** Info do módulo resolvida (uso interno) */
  sourceModuleInfo?: ModuleInfo;
  targetModuleInfo?: ModuleInfo;

  targetDomTemp?: number;
  targetDomVolt?: number;
  targetDomBias?: number;
  targetDomTxPower?: number;
  targetDomRxPower?: number;

  /** Texto de busca (uso interno) */
  searchQuery?: string;
  /** Ocultar cards de tráfego injetado via sidebar */
  hideTrafficBox?: boolean;
  /** Exigido pelo React Flow v12: o data de um Edge precisa satisfazer Record<string, unknown> */
  [key: string]: unknown;
}

/** Topologia completa serializada nas options do painel */
export interface NetworkTopology {
  /** Versão do schema, para migrações futuras */
  schemaVersion: number;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: DeviceNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data: LinkEdgeData;
  }>;
  /** Galeria de imagens salvas no painel */
  customImages?: Array<{ url: string; name: string }>;
}

/** Opções do painel (persistidas no JSON do Grafana) */
export interface PanelOptions {
  topology: NetworkTopology;
  /** Tema visual: dark = ideal pra NOC TV; light = telas comuns */
  theme: 'dark' | 'light';
  /** Escala da fonte (1 = padrão, 1.5 = 50% maior — útil pra TVs grandes) */
  fontScale: number;
  /** Mostrar minimap no canto */
  showMinimap: boolean;
  /** Ajustar zoom automaticamente ao tamanho do container */
  fitView: boolean;
  /** Animar as arestas (luz correndo no cabo) */
  animateLinks: boolean;
  /** Modo edição: permite arrastar nós e salva a posição */
  editMode: boolean;
  /** Mostrar legenda de cores no canto */
  showLegend: boolean;
  /** Segundos sem atualização para considerar uma métrica obsoleta (status cai). 0 desativa. */
  staleThresholdSec: number;
  /** Nó down apaga (esmaece) os links adjacentes */
  dimLinksOnNodeDown: boolean;
  /** Aparência dos links DOWN, para o mapa inteiro (override por link no editor).
   *  'flow'/'reverse' simulam bits andando e num link caído passam a impressão
   *  de tráfego — 'pulse' chama atenção sem inventar movimento. */
  downColor: string;
  downLineStyle: LineStyle;
  downAnimation: LineAnimation;
  /** Token do Globalping (opcional): aumenta a cota dos testes de rede.
   *  Atenção: fica visível no JSON do dashboard (risco baixo — só controla cota). */
  globalpingToken?: string;
}

export const DEFAULT_OPTIONS: PanelOptions = {
  topology: {
    schemaVersion: 1,
    nodes: [],
    edges: [],
    customImages: [],
  },
  theme: 'dark',
  fontScale: 1,
  showMinimap: false,
  fitView: true,
  animateLinks: true,
  editMode: false,
  showLegend: true,
  staleThresholdSec: 180,
  dimLinksOnNodeDown: true,
  downColor: '#ef4444',
  downLineStyle: 'solid',
  downAnimation: 'pulse',
  globalpingToken: '',
};


