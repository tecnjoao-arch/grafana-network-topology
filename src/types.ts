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
}

/** Traçado da linha */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/** Animação da linha (independente do traçado) */
export type LineAnimation = 'none' | 'flow' | 'reverse' | 'pulse' | 'glow';

/** Formato/Roteamento da Linha */
export type PathType = 'straight' | 'curved' | 'step';

export const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted', 'double'];
export const LINE_ANIMATIONS: LineAnimation[] = ['none', 'flow', 'reverse', 'pulse', 'glow'];
export const PATH_TYPES: PathType[] = ['straight', 'curved', 'step'];

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
  
  /** Binding de status customizado para a aresta (se necessário para thresholds) */
  statusBinding?: MetricBinding;

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
};

export const EXAMPLE_TOPOLOGY: NetworkTopology = {
  schemaVersion: 1,
  nodes: [
    {
      id: 'node-1',
      position: { x: 100, y: 100 },
      data: { label: 'Switch Core A', deviceType: 'l3switch', ip: '10.0.0.1', nodeWidth: 140, nodeHeight: 70, borderRadius: 8 },
    },
    {
      id: 'node-2',
      position: { x: 500, y: 100 },
      data: { label: 'Switch Core B', deviceType: 'switch', ip: '10.0.0.2', nodeWidth: 140, nodeHeight: 70, borderRadius: 8 },
    },
    {
      id: 'node-3',
      position: { x: 100, y: 350 },
      data: { label: 'Roteador Borda', deviceType: 'router_modern', ip: '186.200.10.1', nodeWidth: 140, nodeHeight: 70, borderRadius: 8 },
    },
    {
      id: 'node-4',
      position: { x: 500, y: 350 },
      data: { label: 'Firewall Interno', deviceType: 'firewall', ip: '10.0.0.254', nodeWidth: 140, nodeHeight: 70, borderRadius: 8 },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: {
        sourceInterface: 'Eth0/1',
        targetInterface: 'Eth0/1',
        showTrafficBox: true,
        trafficUp: 750000000,
        trafficDown: 580000000,
        linkSpeed: 1000000000,
        status: 'up',
        animation: 'flow',
      },
    },
    {
      id: 'edge-2',
      source: 'node-1',
      target: 'node-3',
      data: {
        sourceInterface: 'Eth0/2',
        targetInterface: 'Gi0/1',
        showTrafficBox: true,
        trafficUp: 120000000,
        trafficDown: 85000000,
        linkSpeed: 1000000000,
        status: 'up',
        animation: 'flow',
        pathType: 'step',
      },
    },
    {
      id: 'edge-3',
      source: 'node-2',
      target: 'node-4',
      data: {
        sourceInterface: 'Eth0/3',
        targetInterface: 'eth1',
        showTrafficBox: true,
        trafficUp: 450000000,
        trafficDown: 350000000,
        linkSpeed: 1000000000,
        status: 'up',
        animation: 'flow',
        pathType: 'straight',
      },
    },
  ],
  customImages: [],
};

