// components/TopologyPanel.tsx — Panel principal.
// Suporta: modo edição (arrastar e salvar), tooltip hover, modal click, auto-fit em TVs.

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, ControlButton, MiniMap,
  useNodesState, useEdgesState, useReactFlow, useStore, getNodesBounds, getViewportForBounds,
  Node, Edge, NodeChange, OnConnectStart, FinalConnectionState, CoordinateExtent, Panel, useNodesInitialized,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  PanelOptions, NetworkTopology, LinkEdgeData, DEFAULT_OPTIONS, LinkStatus,
  OPTIC_KEYS, OpticKey, MetricBinding, ModuleInfoBindings, ModuleInfo, LegendItem,
} from '../types';
import { DataFrame, LoadingState } from '@grafana/data';
import { DeviceNode } from './nodes/DeviceNode';
import { LinkEdge } from './edges/LinkEdge';
import { LinkTooltip } from './LinkTooltip';
import { LinkDetailsModal } from './LinkDetailsModal';
import { ProtecaoModal } from './ProtecaoModal';
import { useSemBarraHorizontal } from './useSemBarraHorizontal';
import { useMapaAteOFim } from './useMapaAteOFim';
import { ehIOS, useModoLeve } from './useModoLeve';
import { useDiagnosticoZoom } from './useDiagnosticoZoom';
import { ancoraNaBorda, caixaDoNo, imaNoZoom, pontoDaAncora } from '../utils/ancora';
import { limparParaPublicacao } from '../utils/publicacao';
import { NetworkTestModal } from './NetworkTestModal';
import { EdgeEditor } from './EdgeEditor';
import { NodeEditor } from './NodeEditor';
import { EditorProvider } from './EditorContext';
import { LinkEdgeData as LinkData } from '../types';
import {
  resolveBinding, resolveTextBinding, listSeriesKeys, setStaleThresholdMs,
  resolveBindingDetailed,
} from '../utils/dataBinding';
import { resolveNodeStatus, resolveLinkStatus, dampStatus, NodeLiveStatus, FlapState, SideStatus } from '../utils/status';
import { Palette, PanelTheme, paletteFor, ensureContrast, temaEfetivo } from '../utils/theme';
import { useTheme2 } from '@grafana/ui';
import { usePanelEditorOpen } from './usePanelEditorOpen';

// Gera ids únicos e estáveis dentro do processo. Date.now() sozinho colide
// quando o usuário duplica/cola vários nós no mesmo milissegundo.
let __idSeq = 0;
const genId = (prefix: string) => `${prefix}-${Date.now()}-${(__idSeq++).toString(36)}`;

// Comparação barata de data resolvida — usada no sync pra preservar a identidade
// dos objetos que não mudaram (assim o React Flow não re-renderiza tudo a cada
// edição; só o nó/aresta que de fato mudou ganha objeto novo).
const sameData = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Limiares/módulo são diagnóstico de coleta lenta no Zabbix → ignoram staleness.
const DIAG_OPTS = { ignoreStale: true } as const;

/** Resolve o conjunto de limiares ópticos de um lado. undefined se nada resolver. */
function resolveOpticThresholds(
  series: DataFrame[],
  bindings?: Partial<Record<OpticKey, MetricBinding>>
): Partial<Record<OpticKey, number>> | undefined {
  if (!bindings) return undefined;
  const out: Partial<Record<OpticKey, number>> = {};
  let any = false;
  for (const k of OPTIC_KEYS) {
    const v = resolveBinding(series, bindings[k], DIAG_OPTS);
    if (v !== undefined) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Resolve a info do módulo óptico (texto) de um lado. */
function resolveModuleInfo(series: DataFrame[], bindings?: ModuleInfoBindings): ModuleInfo | undefined {
  if (!bindings) return undefined;
  const info: ModuleInfo = {
    model: resolveTextBinding(series, bindings.model),
    serial: resolveTextBinding(series, bindings.serial),
    mediaType: resolveTextBinding(series, bindings.mediaType),
  };
  return info.model || info.serial || info.mediaType ? info : undefined;
}

const Sidebar: React.FC<{
  showIp: boolean;
  onToggleIp: () => void;
  hideTraffic: boolean;
  onToggleTraffic: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onOpenTest: () => void;
  pal: Palette;
}> = ({ showIp, onToggleIp, hideTraffic, onToggleTraffic, searchQuery, onSearch, onOpenTest, pal }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        <button onClick={() => setIsOpen(true)} style={floatBtn(pal)}>
          <span style={{ fontSize: 16 }}>🛠️</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Opções</span>
        </button>
        <button onClick={onOpenTest} style={floatBtn(pal)} title="Ping / traceroute / MTR a partir de probes externas">
          <span style={{ fontSize: 16 }}>🌐</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Testes</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: pal.surface,
        border: `1px solid ${pal.border}`,
        padding: '12px',
        borderRadius: 8,
        zIndex: 10,
        boxShadow: `0 8px 24px ${pal.shadow}`,
        width: 260,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${pal.border}`, paddingBottom: 8 }}>
        <span style={{ fontWeight: 600, color: pal.text, fontSize: 13 }}>⚙️ Painel de Opções</span>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: pal.textMuted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Barra de Pesquisa */}
      <div>
        <div style={{ fontSize: 11, color: pal.textMuted, marginBottom: 4 }}>Busca no Mapa</div>
        <div style={{ display: 'flex', alignItems: 'center', background: pal.field, borderRadius: 6, padding: '6px 8px', border: `1px solid ${pal.border}` }}>
          <span style={{ fontSize: 14, marginRight: 6 }}>🔍</span>
          <input
            type="search"
            placeholder="IP ou Nome..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{
              background: 'transparent', border: 'none', color: pal.text, outline: 'none',
              fontSize: 13, width: '100%', fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${pal.border}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Toggle Switch de IP */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: pal.text, fontSize: 13, fontWeight: 500 }}>
          <span>Mostrar IPs das Interfaces</span>
          <div style={{ position: 'relative', width: 36, height: 20 }}>
            <input type="checkbox" checked={showIp} onChange={onToggleIp} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: showIp ? '#3b82f6' : pal.switchOff, transition: '.3s', borderRadius: 20,
            }}>
              <span style={{
                position: 'absolute', content: '""', height: 14, width: 14,
                left: showIp ? 18 : 3, bottom: 3, backgroundColor: 'white',
                transition: '.3s', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
            </div>
          </div>
        </label>

        {/* Toggle Switch de Tráfego */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: pal.text, fontSize: 13, fontWeight: 500 }}>
          <span>Ocultar Cards de Tráfego</span>
          <div style={{ position: 'relative', width: 36, height: 20 }}>
            <input type="checkbox" checked={hideTraffic} onChange={onToggleTraffic} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: hideTraffic ? '#3b82f6' : pal.switchOff, transition: '.3s', borderRadius: 20,
            }}>
              <span style={{
                position: 'absolute', content: '""', height: 14, width: 14,
                left: hideTraffic ? 18 : 3, bottom: 3, backgroundColor: 'white',
                transition: '.3s', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
            </div>
          </div>
        </label>
      </div>

    </div>
  );
};

const floatBtn = (pal: Palette): React.CSSProperties => ({
  background: pal.surface, color: pal.text, border: `1px solid ${pal.border}`,
  borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  boxShadow: `0 4px 12px ${pal.shadow}`,
});

/** iPhone/iPad: as linhas numa camada só (.fc-ios no CSS acima). O React Flow
 *  desenha cada link num <svg> à parte, do tamanho da linha inteira; no
 *  Safari isso ia ao limite de memória e o zoom às vezes derrubava a página
 *  (no iPhone com iOS 18.7, 4 de 6 rodadas com as linhas normais caíram no
 *  zoom 0,46; as 2 com as linhas numa camada só aguentaram até 4× — ver
 *  useDiagnosticoZoom, ?diag=confirma). Isso sem animação: com ela (teste.22)
 *  a página voltou a cair, e no iOS as linhas ficam paradas (useModoLeve). */
const IOS = ehIOS();

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

const ANIMATION_CSS = `
@keyframes fc-flow {
  to { stroke-dashoffset: -21; }
}
@keyframes fc-flow-rev {
  to { stroke-dashoffset: 21; }
}
@keyframes fc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}
@keyframes fc-halo {
  0%, 100% { stroke-opacity: 0.55; }
  50% { stroke-opacity: 0.12; }
}
@keyframes fc-glow {
  0%, 100% { stroke-opacity: 0.2; }
  50% { stroke-opacity: 0.6; }
}
.fc-sem-sombra * { box-shadow: none !important; }
.fc-ios .react-flow__edges { will-change: transform; }
.fc-ios.fc-diag-sem-correcao .react-flow__edges { will-change: auto; }
.fc-esconde-linhas .react-flow__edges { display: none; }
.fc-esconde-cards .react-flow__edgelabel-renderer { display: none; }
.fc-esconde-nos .react-flow__nodes { display: none; }
.fc-esconde-fundo .react-flow__background { display: none; }
.fc-diag-camada-mapa .react-flow__viewport { will-change: transform; }
.fc-diag-camada-linhas .react-flow__edges { will-change: transform; }
.fc-diag-sem-clique .react-flow__edge-interaction { display: none; }
.fc-diag-sem-halo .fc-halo { display: none; }
.fc-diag-sem-duplo .fc-duplo { display: none; }
`;

type Props = PanelProps<PanelOptions>;

interface HoverState {
  edgeId: string;
  /** Lado/interface em foco no tooltip (hover num card específico) */
  side?: 'source' | 'target';
  x: number;
  y: number;
}

interface ClickState {
  edgeId: string;
  /** Lado/interface em foco no modal (clique num card específico) */
  side?: 'source' | 'target';
}

export const TopologyPanel: React.FC<Props> = (props) => {
  const { options, width, height, data } = props;

  // O modo edição só vale dentro do editor do painel (menu do painel → Edit).
  // Fora dele o mapa é sempre de visualização, mesmo com a opção salva ligada
  // — antes ela valia no dashboard pra quem estivesse só olhando o NOC.
  const noEditor = usePanelEditorOpen(props.id);
  const editMode = !!options.editMode && noEditor;

  // Dashboard público: some a barra horizontal falsa do Grafana (ver o hook)
  const raiz = useRef<HTMLDivElement>(null);
  useSemBarraHorizontal(raiz);
  // ...e com autofitpanels o mapa vai até o fim da tela (ver o hook)
  useMapaAteOFim(raiz);
  // Fundo e barra lateral no mesmo tema do mapa (fixado, ou o do Grafana)
  const tema = temaEfetivo(options.theme, useTheme2().isDark);
  // A opção "Animar links" e os interruptores de diagnóstico da URL (ver o hook)
  const leve = useModoLeve(options.animateLinks);

  // Aplica o limite de obsolescência configurado antes de resolver os bindings.
  setStaleThresholdMs((options.staleThresholdSec ?? DEFAULT_OPTIONS.staleThresholdSec) * 1000);

  // Topologia real (editável) — pode estar vazia; nenhum exemplo é injetado.
  const topology = options.topology ?? DEFAULT_OPTIONS.topology;
  const series = data?.series ?? [];

  const [showIp, setShowIp] = useState(false);
  const [hideTrafficCards, setHideTrafficCards] = useState(leve.semCards);
  const [searchQuery, setSearchQuery] = useState('');
  // Modal de testes de rede (Globalping): null = fechado; string = alvo inicial
  const [testTarget, setTestTarget] = useState<string | null>(null);

  // Saúde da consulta. Nada aqui é confiável quando a query falha ou não
  // devolve nada — e nesse caso o mapa fica CINZA, nunca vermelho: erro de
  // datasource não é queda de rede, e afirmar que é assusta o plantão à toa.
  //
  // O caso 'error' é o que morde na prática: com período longo e refresh curto
  // a consulta ao Zabbix estoura de vez em quando; parte das séries não chega,
  // as métricas viram "sem coleta" e a regra de queda pintaria o mapa inteiro
  // de vermelho. Uma falha parcial já basta para desconfiar do resto.
  const dataHealth: 'ok' | 'error' | 'empty' = useMemo(() => {
    const failed = data?.state === LoadingState.Error
      || !!(data as any)?.error
      || ((data as any)?.errors?.length ?? 0) > 0;
    if (failed) return 'error';
    if (series.length > 0) return 'ok';
    // Mapa recém-criado, sem binding nenhum, não está "sem dados": está vazio.
    const esperaDados = topology.nodes.some((n) => n.data.statusBinding)
      || topology.edges.some((e) =>
        e.data.sourceStatusBinding || e.data.targetStatusBinding || e.data.statusBinding
        || e.data.trafficUpBinding || e.data.sourceTrafficUpBinding || e.data.targetTrafficUpBinding);
    return esperaDados ? 'empty' : 'ok';
  }, [data, series, topology]);

  const noData = dataHealth !== 'ok';

  // ── Amortecimento de piscada ────────────────────────────────────────────
  // Ping perdido, coleta atrasada e resposta parcial do datasource somem no
  // ciclo seguinte, mas cada um deles pinta o mapa de vermelho por um instante
  // — e um nó piscando arrasta todos os links dele junto. Só confirma a queda
  // depois de N ciclos seguidos falhando; a RECUPERAÇÃO continua imediata,
  // porque ninguém quer esperar pra saber que voltou.
  const dampRef = useRef<{
    seen: DataFrame[] | null;
    st: Map<string, FlapState>;
  }>({ seen: null, st: new Map() });

  // true exatamente uma vez por chegada de dados. Se o memo recalcular por
  // outro motivo (edição, hover), `seen` já é a mesma referência e o contador
  // não avança — senão editar o mapa "confirmaria" quedas sozinho.
  const dataAdvanced = useMemo(() => {
    const changed = dampRef.current.seen !== series;
    dampRef.current.seen = series;
    return changed;
  }, [series]);

  // Equipamento ou link apagado não deixa estado de amortecimento pra trás
  // (o mapa crescia a cada edição, para sempre, enquanto o painel vivesse).
  useEffect(() => {
    const vivos = new Set<string>([...topology.nodes.map((n) => n.id), ...topology.edges.map((e) => e.id)]);
    for (const id of dampRef.current.st.keys()) {
      if (!vivos.has(id)) dampRef.current.st.delete(id);
    }
  }, [topology]);

  const confirmCycles = Math.max(1, options.downConfirmCycles ?? DEFAULT_OPTIONS.downConfirmCycles);

  const damp = useCallback(
    <T extends NodeLiveStatus>(id: string, cur: T): T => {
      const m = dampRef.current.st;
      const { shown, next } = dampStatus(m.get(id), cur, confirmCycles, dataAdvanced);
      if (dataAdvanced) m.set(id, next);
      return shown;
    },
    [confirmCycles, dataAdvanced]
  );

  // Status ao vivo de CADA nó, calculado uma única vez por refresh e
  // compartilhado entre os memos de nós e de arestas (nó down → links down).
  const nodeLive = useMemo(() => {
    const m = new Map<string, NodeLiveStatus>();
    for (const n of topology.nodes) m.set(n.id, damp(n.id, resolveNodeStatus(n.data, series, noData)));
    return m;
  }, [topology, series, noData, damp]);

  // Nome legível de cada nó — usado nas mensagens de causa ("RTR-01 sem resposta")
  const nodeLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of topology.nodes) m.set(n.id, n.data.label || n.id);
    return m;
  }, [topology]);

  // Nós: injeta status/cor resolvidos + extras de render
  const initialNodes: Node[] = useMemo(
    () => topology.nodes.map((n) => {
      const { status, color, cause, detail } = nodeLive.get(n.id) ?? {};
      return {
        id: n.id,
        type: 'device',
        position: n.position,
        // fontScale injetado: o DeviceNode usa pra escalar ícone e badge (px fixos)
        data: {
          ...n.data, status, color, searchQuery, showIp,
          statusCause: cause, statusDetail: detail,
          fontScale: options.fontScale ?? 1,
          iconColorMode: options.iconColorMode ?? DEFAULT_OPTIONS.iconColorMode,
        } as any,
      };
    }),
    [topology, nodeLive, searchQuery, options.fontScale, showIp, options.iconColorMode]
  );

  // Arestas: aplica binding de up/down/speed e IP das séries
  const initialEdges: Edge[] = useMemo(
    () => topology.edges.map((e) => {
      // Tráfego: binding configurado que não resolve (obsoleto ou série sumida)
      // vira ZERO — nunca o último valor conhecido, nunca o valor do vizinho.
      // Valor velho persistindo foi o que manteve "tráfego passando" em links
      // já derrubados. `fresh` marca o que é medição de agora: só isso serve
      // como prova de vida pra inferir status.
      const traffic = (b?: MetricBinding): { v?: number; fresh: boolean } => {
        if (!b) return { fresh: false };
        const r = resolveBindingDetailed(series, b);
        return r.state === 'ok' ? { v: r.value, fresh: true } : { v: 0, fresh: false };
      };

      const upT = traffic(e.data.trafficUpBinding);
      const downT = traffic(e.data.trafficDownBinding);
      const up = upT.v;
      const down = downT.v;
      // Capacidade é quase-estática e no Zabbix costuma ser coletada de hora em
      // hora — não pode ser descartada pela checagem de obsolescência (stale).
      const speed = resolveBinding(series, e.data.speedBinding, { ignoreStale: true });
      const srcIp = resolveTextBinding(series, e.data.sourceIpBinding);
      const tgtIp = resolveTextBinding(series, e.data.targetIpBinding);
      
      // Erros/descartes são diagnóstico (coleta lenta no Zabbix, 1–5 min):
      // não passam pela checagem de obsolescência — senão piscam (aparecem
      // logo após a coleta e "vencem" antes da próxima).
      const srcErr = resolveBinding(series, e.data.sourceErrorBinding, { ignoreStale: true });
      const tgtErr = resolveBinding(series, e.data.targetErrorBinding, { ignoreStale: true });

      // Bindings específicos por interface (lado A / lado B)
      const srcUpT = traffic(e.data.sourceTrafficUpBinding);
      const srcDownT = traffic(e.data.sourceTrafficDownBinding);
      const tgtUpT = traffic(e.data.targetTrafficUpBinding);
      const tgtDownT = traffic(e.data.targetTrafficDownBinding);
      const srcUp = srcUpT.v;
      const srcDown = srcDownT.v;
      const tgtUp = tgtUpT.v;
      const tgtDown = tgtDownT.v;

      // Fibra (DOM): idem — temperatura/voltagem/bias costumam ser coletadas a
      // cada 5 min; o filtro de stale (180s) as matava no meio do ciclo.
      const DIAG = { ignoreStale: true } as const;
      const srcDomTemp = resolveBinding(series, e.data.sourceDomTempBinding, DIAG);
      const srcDomVolt = resolveBinding(series, e.data.sourceDomVoltBinding, DIAG);
      const srcDomBias = resolveBinding(series, e.data.sourceDomBiasBinding, DIAG);
      const srcDomTx = resolveBinding(series, e.data.sourceDomTxPowerBinding, DIAG);
      const srcDomRx = resolveBinding(series, e.data.sourceDomRxPowerBinding, DIAG);

      const tgtDomTemp = resolveBinding(series, e.data.targetDomTempBinding, DIAG);
      const tgtDomVolt = resolveBinding(series, e.data.targetDomVoltBinding, DIAG);
      const tgtDomBias = resolveBinding(series, e.data.targetDomBiasBinding, DIAG);
      const tgtDomTx = resolveBinding(series, e.data.targetDomTxPowerBinding, DIAG);
      const tgtDomRx = resolveBinding(series, e.data.targetDomRxPowerBinding, DIAG);

      // Limiares ópticos + info do módulo (auto-preenchidos pela detecção)
      const srcOptics = resolveOpticThresholds(series, e.data.sourceOpticThresholdBindings);
      const tgtOptics = resolveOpticThresholds(series, e.data.targetOpticThresholdBindings);
      const srcModule = resolveModuleInfo(series, e.data.sourceModuleInfoBindings);
      const tgtModule = resolveModuleInfo(series, e.data.targetModuleInfoBindings);
      
      // Tráfego por lado (A=origem, B=destino). Precedência: binding do lado →
      // binding global → ESPELHO do outro lado (num link p2p, inbound de A =
      // outbound de B) → estáticos.
      //
      // O espelho só age em lado SEM binding próprio, e só copia valor FRESCO.
      // Antes ele preenchia qualquer lado, então uma ponta morta herdava o
      // número da ponta viva e o card exibia tráfego num link caído. Lado com
      // binding próprio agora mostra o que ele mesmo mediu — inclusive o zero.
      const peer = (t: { v?: number; fresh: boolean }) => (t.fresh ? t.v : undefined);
      const sourceUp = e.data.sourceTrafficUpBinding ? srcUp
        : up ?? peer(tgtDownT) ?? e.data.sourceTrafficUp ?? e.data.trafficUp;
      const sourceDown = e.data.sourceTrafficDownBinding ? srcDown
        : down ?? peer(tgtUpT) ?? e.data.sourceTrafficDown ?? e.data.trafficDown;
      const targetUp = e.data.targetTrafficUpBinding ? tgtUp
        : down ?? peer(srcDownT) ?? e.data.targetTrafficUp ?? e.data.trafficDown ?? e.data.trafficUp;
      const targetDown = e.data.targetTrafficDownBinding ? tgtDown
        : up ?? peer(srcUpT) ?? e.data.targetTrafficDown ?? e.data.trafficUp ?? e.data.trafficDown;

      // Prova de vida: só medição fresca conta. Alimenta a inferência de status
      // dos links que ainda não têm operStatus amarrado nos dois lados.
      const freshTraffic = [upT, downT, srcUpT, srcDownT, tgtUpT, tgtDownT]
        .reduce((mx, t) => (t.fresh ? Math.max(mx, t.v ?? 0) : mx), 0);

      let edgeColor = e.data.color;
      let edgeAnim = e.data.animation;
      let edgeLineStyle = e.data.lineStyle;

      // ── Status operacional: os DOIS lados ────────────────────────────────
      // Só entram os lados COM binding configurado. O link é 'up' apenas se
      // todos concordarem: com um binding só (modelo antigo), o status vinha de
      // uma ponta e o link seguia verde com a outra morta.
      const sides: SideStatus[] = [];
      if (e.data.sourceStatusBinding) {
        sides.push({
          label: e.data.sourceInterface || nodeLabels.get(e.source) || 'lado A',
          result: resolveBindingDetailed(series, e.data.sourceStatusBinding),
        });
      }
      if (e.data.targetStatusBinding) {
        sides.push({
          label: e.data.targetInterface || nodeLabels.get(e.target) || 'lado B',
          result: resolveBindingDetailed(series, e.data.targetStatusBinding),
        });
      }

      // As regras valor → cor leem o status dos lados A/B: a cor diz o que o
      // valor significa (vermelho = queda...). FORMATO ANTIGO: com a métrica
      // própria do link (statusBinding) preenchida, elas leem aquela métrica e
      // só pintam. E o statusBinding sem regras segue como fonte de status.
      const temRegras = (e.data.colorMappings?.length ?? 0) > 0;
      const legacyIsCosmetic = temRegras && !!e.data.statusBinding?.match;
      if (e.data.statusBinding && !temRegras) {
        sides.push({
          label: 'link',
          result: resolveBindingDetailed(series, e.data.statusBinding),
        });
      }

      // Equipamento da ponta caído: causa raiz, ganha do resto. A opção segue
      // valendo pra quem não quer essa propagação.
      const downEndpoint = (options.dimLinksOnNodeDown ?? true)
        ? (nodeLive.get(e.source)?.status === 'down' ? nodeLabels.get(e.source)
          : nodeLive.get(e.target)?.status === 'down' ? nodeLabels.get(e.target) : undefined)
        : undefined;

      // Amortecido pelo mesmo critério dos nós. Os links cujo vermelho vem do
      // equipamento já herdam a estabilidade dele (o nó segura a queda), mas o
      // operStatus do próprio link também pode piscar sozinho.
      const outcome = damp(e.id, resolveLinkStatus({
        noData,
        endpointDown: downEndpoint,
        sides,
        operator: e.data.statusOperator,
        value: e.data.statusValue,
        rules: temRegras && !legacyIsCosmetic ? e.data.colorMappings : undefined,
        freshTraffic,
      }));
      let edgeStatus: LinkStatus = outcome.status;
      // A regra (valor → cor) que decidiu pinta a linha, com o traçado e a
      // animação dela se tiver. Ganha da cor fixa do link — é a escolha mais
      // específica. O piso de contraste do tema vale em cima da cor.
      if (outcome.rule) {
        edgeColor = outcome.rule.color;
        if (outcome.rule.lineStyle) edgeLineStyle = outcome.rule.lineStyle;
        if (outcome.rule.animation) edgeAnim = outcome.rule.animation;
      }

      // Regras do formato antigo (com métrica própria): PINTAM e nada mais. Não decidem se o link está
      // no ar — antes, uma regra que casasse marcava o link como 'up' junto com
      // a cor, então um link pintado de vermelho pela regra reportava UP no
      // modal, sem causa no hover e sem a aparência de DOWN. A imagem dizia uma
      // coisa e o dado dizia outra. E vale pra qualquer métrica: quem mapeia
      // temperatura ou nível de sinal não deve ganhar link "no ar" de brinde.
      // Não pintam link down: queda precisa ser inconfundível.
      if (legacyIsCosmetic && edgeStatus !== 'down') {
        const r = resolveBindingDetailed(series, e.data.statusBinding);
        if (r.state === 'ok') {
          const liveStr = String(r.value).trim().toLowerCase();
          const matched = e.data.colorMappings!.find(
            (m) => String(m.value).trim().toLowerCase() === liveStr
          );
          if (matched) {
            edgeColor = matched.color;
            edgeAnim = matched.animation ?? 'none';
            if (matched.lineStyle) edgeLineStyle = matched.lineStyle; // traçado por regra
          }
        }
      }

      // Congestionamento: link "up" passando de 90% de utilização vira laranja,
      // mesmo com threshold verde (saturação é mais crítica que o status up).
      // Respeita cor manual: se o usuário fixou e.data.color, mantém.
      const effSpeed = speed ?? e.data.linkSpeed;
      const effTraffic = Math.max(sourceUp ?? 0, sourceDown ?? 0, targetUp ?? 0, targetDown ?? 0, up ?? 0, down ?? 0);
      const util = effSpeed && effSpeed > 0 ? Math.min(1, effTraffic / effSpeed) : 0;
      if (edgeStatus === 'up' && util >= 0.9 && e.data.color === undefined) {
        // Sem cor fixa: quem pinta o warning é a paleta do tema (o âmbar do
        // escuro ficava a 2:1 do fundo claro).
        edgeColor = undefined;
        edgeStatus = 'warning';
      }

      // Aparência do DOWN: vale pro mapa inteiro (opção de painel), com
      // override por link. Substitui o antigo modo "apagado" — link caído agora
      // é vermelho e visível, não esmaecido. Sobrepõe cor manual de propósito:
      // queda precisa ser inconfundível, mesmo em link com cor customizada.
      // Na queda decidida por uma regra, a COR dela fica (é a escolha pro
      // valor); traçado e animação vêm da aparência do DOWN — 'flow' num link
      // caído passaria a impressão de tráfego.
      if (edgeStatus === 'down') {
        edgeColor = outcome.rule?.color ?? e.data.downColor ?? options.downColor ?? DEFAULT_OPTIONS.downColor;
        edgeLineStyle = e.data.downLineStyle ?? options.downLineStyle ?? DEFAULT_OPTIONS.downLineStyle;
        edgeAnim = e.data.downAnimation ?? options.downAnimation ?? DEFAULT_OPTIONS.downAnimation;
      }

      const liveData: LinkEdgeData = {
        ...e.data,
        // Tráfego "global" do link (tooltip, modal, utilização→cor/espessura):
        // sem binding global, usa o lado resolvido (A→B = upload da origem
        // = download do destino).
        trafficUp: up ?? e.data.trafficUp ?? srcUp ?? tgtDown,
        trafficDown: down ?? e.data.trafficDown ?? srcDown ?? tgtUp,
        sourceTrafficUp: sourceUp,
        sourceTrafficDown: sourceDown,
        targetTrafficUp: targetUp,
        targetTrafficDown: targetDown,
        linkSpeed: speed ?? e.data.linkSpeed,
        sourceIp: srcIp,
        targetIp: tgtIp,
        sourceErrors: srcErr,
        targetErrors: tgtErr,
        
        // Fibra DOM (Origem)
        sourceDomTemp: srcDomTemp,
        sourceDomVolt: srcDomVolt,
        sourceDomBias: srcDomBias,
        sourceDomTxPower: srcDomTx,
        sourceDomRxPower: srcDomRx,

        // Fibra DOM (Destino)
        targetDomTemp: tgtDomTemp,
        targetDomVolt: tgtDomVolt,
        targetDomBias: tgtDomBias,
        targetDomTxPower: tgtDomTx,
        targetDomRxPower: tgtDomRx,

        // Limiares ópticos + módulo (resolvidos)
        sourceOpticThresholds: srcOptics,
        targetOpticThresholds: tgtOptics,
        sourceModuleInfo: srcModule,
        targetModuleInfo: tgtModule,

        showIp: showIp,
        shortIpv6: options.shortenIpv6 ?? DEFAULT_OPTIONS.shortenIpv6,
        searchQuery: searchQuery,
        hideTrafficBox: hideTrafficCards,
        color: edgeColor,
        // 'none' explícito: sem valor, o LinkEdge escolhe fluxo/pulso pelo status
        animation: leve.semAnimacao ? 'none' : edgeAnim,
        lineStyle: edgeLineStyle,
        status: edgeStatus,
        // Causa do status: vira texto no card/tooltip/modal, pra distinguir
        // "equipamento sem resposta" de "sem coleta" e de "série não encontrada"
        // (esta última quase sempre é binding errado, não queda de rede).
        statusCause: outcome.cause,
        statusDetail: outcome.detail,
        // Escala da fonte injetada: o card (LinkEdge) usa pra afastar os labels
        // proporcionalmente, senão eles colidem ao aumentar a escala.
        fontScale: options.fontScale ?? 1,
        cardScale: options.cardScale ?? 1,
      } as LinkEdgeData;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'link',
        data: liveData as any,
      };
    }),
    [topology, series, showIp, searchQuery, hideTrafficCards, options.fontScale, options.cardScale, nodeLive,
      options.dimLinksOnNodeDown, noData, nodeLabels, damp,
      options.downColor, options.downLineStyle, options.downAnimation, leve.semAnimacao]
  );

  return (
    <div
      ref={raiz}
      className={leve.semSombra ? 'fc-sem-sombra' : undefined}
      style={{
        width, height,
        background: paletteFor(tema).canvas,
        position: 'relative',
        fontSize: `${14 * (options.fontScale ?? 1)}px`,
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <ReactFlowProvider>
        <TopologyInner
          {...props}
          editMode={editMode}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          topology={topology}
          noData={dataHealth !== 'ok'}
          dataHealth={dataHealth}
          onOpenTest={(target) => setTestTarget(target)}
        />
        {!editMode && !options.publicMode && (
          <Sidebar
            showIp={showIp}
            onToggleIp={() => setShowIp(!showIp)}
            hideTraffic={hideTrafficCards}
            onToggleTraffic={() => setHideTrafficCards(!hideTrafficCards)}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onOpenTest={() => setTestTarget('')}
            pal={paletteFor(tema)}
          />
        )}
        {testTarget !== null && !options.publicMode && (
          <ProtecaoModal oQue="o teste de rede" onClose={() => setTestTarget(null)}>
            <NetworkTestModal
              initialTarget={testTarget}
              token={options.globalpingToken}
              onClose={() => setTestTarget(null)}
            />
          </ProtecaoModal>
        )}
      </ReactFlowProvider>
    </div>
  );
};

/** Limites do zoom — os mesmos no React Flow e no ajuste à tela */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

interface InnerProps extends Props {
  /** Modo edição EFETIVO: opção ligada e painel aberto no editor do Grafana */
  editMode: boolean;
  initialNodes: Node[];
  initialEdges: Edge[];
  topology: NetworkTopology;
  /** Datasource não respondeu: mapa inteiro cinza + tarja de aviso */
  noData: boolean;
  /** 'error' = a query falhou (tarja diferente de "sem dados") */
  dataHealth: 'ok' | 'error' | 'empty';
  /** Abre o modal de testes de rede com um alvo inicial ('' = vazio) */
  onOpenTest: (target: string) => void;
}

const TopologyInner: React.FC<InnerProps> = ({
  initialNodes, initialEdges, topology, options, width, height, onOptionsChange, data, timeRange, onOpenTest, noData, dataHealth, editMode,
}) => {
  const seriesKeys = useMemo(() => listSeriesKeys(data?.series ?? []), [data?.series]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView, setViewport } = useReactFlow();
  // Tamanho da área do mapa (o do React Flow, já sem bordas do painel)
  const larguraMapa = useStore((s) => s.width);
  const alturaMapa = useStore((s) => s.height);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [clicked, setClicked] = useState<ClickState | null>(null);
  // Painel travado: bloqueia zoom/pan (útil em TV de NOC, evita zoom acidental)
  // Começa travado: a roda do mouse rola a página (não dá zoom) e o mapa fica
  // como o ajuste deixou. O cadeado nos controles destrava.
  const [locked, setLocked] = useState(true);
  // Paleta do tema do painel (o fixado ou, em "Seguir o Grafana", o do
  // Grafana agora): nós e arestas recebem pelo EditorContext
  const tema: PanelTheme = temaEfetivo(options.theme, useTheme2().isDark);
  const pal = paletteFor(tema);
  // Modo público: sem nada que mostre IP, host, descrição ou abra algo
  const publico = !!options.publicMode;
  // O que a cópia pública ainda carrega no JSON (IPs, token, bindings de
  // IP/potência/erros) — o botão da faixa do modo edição tira de uma vez.
  const limpezaPublica = useMemo(() => {
    if (!publico || !onOptionsChange) return undefined;
    const r = limparParaPublicacao(options);
    const { nos, links, token } = r.limpeza;
    if (!nos && !links && !token) return undefined;
    const partes = [
      nos ? `IP/link de ${nos} equipamento${nos > 1 ? 's' : ''}` : '',
      links ? `IP, erros e potência de ${links} link${links > 1 ? 's' : ''}` : '',
      token ? 'o token do Globalping' : '',
    ].filter(Boolean);
    return { resumo: partes.join(', '), aplicar: () => onOptionsChange(r.options) };
  }, [publico, options, onOptionsChange]);

  // Espelhos em ref: o fitToContent lê daqui pra NÃO depender de `nodes`/`topology`.
  // Sem isso, os objetos mudam a cada refresh de dados (10s) → o callback
  // mudava → o efeito de auto-fit re-disparava → o mapa "ampliava e voltava".
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const topologyRef = useRef(topology);
  topologyRef.current = topology;

  // Fit-view que PREENCHE a tela e centraliza o DESENHO INTEIRO: além dos nós,
  // inclui os waypoints das arestas (rotas manuais passam por fora dos nós — sem
  // isso o mapa ficava descentralizado, cortado de um lado e sobrando do outro).
  // Margem proporcional à escala da fonte reserva espaço pros cards.
  // Estável (só refaz se a escala mudar) → só roda no resize/fit manual, não a cada refresh.
  // Celular em pé (ver fitToContent): até onde dá pra arrastar o mapa. Sem
  // valor, o arraste é livre (e só com o cadeado aberto).
  const [limite, setLimite] = useState<CoordinateExtent | undefined>(undefined);
  // A dica "arraste para os lados" some no primeiro arraste
  const [arrastou, setArrastou] = useState(false);
  // O usuário mexeu no zoom ou arrastou o mapa: o reajuste automático não
  // desfaz isso (ver o efeito de re-fit). O botão ⛶ zera.
  const interagiu = useRef(false);
  const fitToContent = useCallback((duration = 300) => {
    const ns = nodesRef.current;
    if (!ns.length) return;
    const b = getNodesBounds(ns);
    if (!b.width || !b.height) return;
    let minX = b.x, minY = b.y, maxX = b.x + b.width, maxY = b.y + b.height;
    for (const e of topologyRef.current.edges) {
      for (const wp of e.data?.waypoints ?? []) {
        if (wp.x < minX) minX = wp.x;
        if (wp.y < minY) minY = wp.y;
        if (wp.x > maxX) maxX = wp.x;
        if (wp.y > maxY) maxY = wp.y;
      }
    }
    const m = 45 * (options.fontScale ?? 1) * (options.cardScale ?? 1) + 25; // reserva pros labels
    const caixa = { x: minX - m, y: minY - m, width: (maxX - minX) + m * 2, height: (maxY - minY) + m * 2 };
    if (!larguraMapa || !alturaMapa) return;
    // Celular em pé: painel estreito e bem mais alto que o desenho (que é
    // largo). Ajustado pela largura, o mapa virava uma faixa fina no meio do
    // painel. Aqui ele preenche a ALTURA (~3x maior, cards legíveis) e o
    // visitante arrasta para os lados; o limite não deixa sair do desenho.
    // Só quando o painel cabe na tela (autofitpanels): num painel mais alto que
    // a tela, arrastar no mapa prenderia a rolagem da página.
    const emPe = !editMode && larguraMapa < 600 && alturaMapa <= window.innerHeight
      && alturaMapa / larguraMapa > (caixa.height / caixa.width) * 1.3;
    if (emPe) {
      const zoom = Math.min(MAX_ZOOM, alturaMapa / caixa.height);
      setLimite([[caixa.x, caixa.y], [caixa.x + caixa.width, caixa.y + caixa.height]]);
      setViewport({
        zoom,
        x: larguraMapa / 2 - (caixa.x + caixa.width / 2) * zoom,
        y: alturaMapa / 2 - (caixa.y + caixa.height / 2) * zoom,
      }, { duration });
      return;
    }
    setLimite(undefined);
    // Sempre centralizado. Encostar no topo (0.4.0-teste.9) servia quando o
    // painel era mais alto que a tela; com o autofitpanels o painel cabe na
    // tela e o mapa no alto deixava a sobra toda embaixo.
    const vp = getViewportForBounds(caixa, larguraMapa, alturaMapa, MIN_ZOOM, MAX_ZOOM, 0.02);
    setViewport(vp, { duration });
  }, [options.fontScale, options.cardScale, setViewport, larguraMapa, alturaMapa, editMode]);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // Onde o arraste do link novo começou (a ponta de origem sai dali)
  const startMousePos = useRef<{ x: number; y: number } | null>(null);
  // True enquanto um nó está sendo arrastado — usado para não resetar a posição
  // no meio do arraste quando chega um refresh de dados do Grafana.
  const draggingRef = useRef(false);

  const clipboard = useRef<Array<{ data: any; width?: number; height?: number; position?: { x: number; y: number } }>>([]);

  useEffect(() => {
    if (!editMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        const selected = nodes.filter(n => n.selected);
        if (selected.length > 0) {
          e.preventDefault();
          clipboard.current = selected.map(n => ({
            data: JSON.parse(JSON.stringify(n.data)),
            width: n.measured?.width || (n.data as any)?.nodeWidth,
            height: n.measured?.height || (n.data as any)?.nodeHeight,
            position: { x: n.position.x, y: n.position.y },
          }));
        }
      }
      
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        if (clipboard.current.length > 0 && onOptionsChange) {
          e.preventDefault();
          const offset = 35;
          // Desloca o grupo inteiro por `offset`, preservando o layout relativo
          // entre os nós copiados (em vez de empilhar tudo na mesma diagonal).
          const newNodes = clipboard.current.map((clip) => {
            const id = genId('node');
            const base = clip.position ?? { x: 100, y: 100 };
            return {
              id,
              position: { x: base.x + offset, y: base.y + offset },
              data: {
                ...clip.data,
                nodeWidth: clip.width,
                nodeHeight: clip.height
              }
            };
          });
          onOptionsChange({
            ...options,
            topology: {
              ...topology,
              nodes: [...topology.nodes, ...newNodes],
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editMode, nodes, options, topology, onOptionsChange]);

  // Fecha o editor se sair do modo edição
  useEffect(() => { 
    if (!editMode) {
      setEditingEdgeId(null); 
      setEditingNodeId(null);
    }
  }, [editMode]);

  // Re-sincroniza com a topologia/dados sem destruir a interação em curso:
  //  • não toca nos nós enquanto há um arraste em andamento (evita o nó "voltar"
  //    quando o Grafana atualiza as séries no meio do drag);
  //  • preserva a seleção atual — senão um refresh zeraria a seleção no meio de
  //    uma edição em massa.
  useEffect(() => {
    if (draggingRef.current) return;
    setNodes((curr) => {
      const prevById = new Map(curr.map((n) => [n.id, n]));
      const sel = new Set(curr.filter((n) => n.selected).map((n) => n.id));
      return initialNodes.map((n) => {
        const selected = sel.has(n.id);
        const prev = prevById.get(n.id);
        // Reusa o objeto anterior se nada mudou → React Flow pula a re-renderização deste nó.
        if (prev && !!prev.selected === selected && prev.position === n.position && sameData(prev.data, n.data)) {
          return prev;
        }
        return selected ? { ...n, selected: true } : n;
      });
    });
  }, [initialNodes, setNodes]);
  useEffect(() => {
    setEdges((curr) => {
      const prevById = new Map(curr.map((e) => [e.id, e]));
      const sel = new Set(curr.filter((e) => e.selected).map((e) => e.id));
      return initialEdges.map((e) => {
        const selected = sel.has(e.id);
        const prev = prevById.get(e.id);
        // Identidade preservada p/ arestas inalteradas → só a aresta editada re-renderiza.
        if (prev && !!prev.selected === selected && sameData(prev.data, e.data)) {
          return prev;
        }
        return selected ? { ...e, selected: true } : e;
      });
    });
  }, [initialEdges, setEdges]);

  // Persiste waypoints de uma aresta nas options do painel
  const setEdgeWaypoints = useCallback((edgeId: string, waypoints: Array<{ x: number; y: number }>) => {
    if (!onOptionsChange) return;
    const updatedTopology: NetworkTopology = {
      ...topology,
      edges: topology.edges.map((te) =>
        te.id === edgeId ? { ...te, data: { ...te.data, waypoints } } : te
      ),
    };
    onOptionsChange({ ...options, topology: updatedTopology });
  }, [topology, options, onOptionsChange]);

  // Persiste a âncora (origem/destino) de uma aresta
  const setEdgeAnchor = useCallback((edgeId: string, which: 'source' | 'target', anchor: { x: number; y: number }) => {
    if (!onOptionsChange) return;
    const key = which === 'source' ? 'sourceAnchor' : 'targetAnchor';
    const updatedTopology: NetworkTopology = {
      ...topology,
      edges: topology.edges.map((te) =>
        te.id === edgeId ? { ...te, data: { ...te.data, [key]: anchor } } : te
      ),
    };
    onOptionsChange({ ...options, topology: updatedTopology });
  }, [topology, options, onOptionsChange]);

  // Patch genérico de campos da aresta (cor, traçado, animação, etc)
  const setEdgeData = useCallback((edgeId: string, patch: Partial<LinkData>) => {
    if (!onOptionsChange) return;
    const updatedTopology: NetworkTopology = {
      ...topology,
      edges: topology.edges.map((te) =>
        te.id === edgeId ? { ...te, data: { ...te.data, ...patch } } : te
      ),
    };
    onOptionsChange({ ...options, topology: updatedTopology });
  }, [topology, options, onOptionsChange]);

  const deleteEdge = useCallback((edgeId: string) => {
    if (!onOptionsChange) return;
    onOptionsChange({
      ...options,
      topology: { ...topology, edges: topology.edges.filter(e => e.id !== edgeId) },
    });
  }, [topology, options, onOptionsChange]);

  const setNodeDataPatch = useCallback((nodeId: string, patch: Partial<any>) => {
    if (!onOptionsChange) return;
    onOptionsChange({
      ...options,
      topology: {
        ...topology,
        nodes: topology.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n),
      },
    });
  }, [topology, options, onOptionsChange]);

  const deleteNode = useCallback((nodeId: string) => {
    if (!onOptionsChange) return;
    onOptionsChange({
      ...options,
      topology: {
        ...topology,
        nodes: topology.nodes.filter(n => n.id !== nodeId),
        edges: topology.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      },
    });
  }, [topology, options, onOptionsChange]);

  const duplicateNode = useCallback((nodeId: string) => {
    if (!onOptionsChange) return;
    const nodeToCopy = topology.nodes.find(n => n.id === nodeId);
    if (!nodeToCopy) return;
    const id = genId('node');
    const newNode = {
      id,
      position: { x: nodeToCopy.position.x + 35, y: nodeToCopy.position.y + 35 },
      data: JSON.parse(JSON.stringify(nodeToCopy.data)),
    };
    onOptionsChange({
      ...options,
      topology: {
        ...topology,
        nodes: [...topology.nodes, newNode],
      },
    });
    setEditingNodeId(id);
  }, [topology, options, onOptionsChange]);

  const addNode = useCallback(() => {
    if (!onOptionsChange) return;
    const id = genId('node');
    const newNode = {
      id,
      position: { x: 150, y: 150 },
      data: { label: 'Novo Equipamento', deviceType: 'generic' as const },
    };
    onOptionsChange({
      ...options,
      topology: { ...topology, nodes: [...topology.nodes, newNode] },
    });
    setEditingNodeId(id);
  }, [topology, options, onOptionsChange]);

  const { screenToFlowPosition, getNode, getInternalNode, getZoom } = useReactFlow();

  const handleConnectStart = useCallback<OnConnectStart>((event) => {
    if ('clientX' in event) {
      startMousePos.current = { x: event.clientX, y: event.clientY };
    } else if ('touches' in event && event.touches.length) {
      startMousePos.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }, []);

  // Link novo: sai de um dos 4 pontos de conexão e pode ser SOLTO EM QUALQUER
  // PONTO do outro nó — a ponta vai pra borda mais perto de onde soltou (ver
  // utils/ancora). Antes só conectava perto dos 4 pontos (o React Flow puxava
  // a linha pro mais próximo, daí os pulos) e a ponta ficava onde o mouse
  // estava, raramente alinhada: a linha nascia 2–3 px torta. Agora, perto de
  // ficar reta com a origem, ela encaixa.
  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, conn: FinalConnectionState) => {
    if (!onOptionsChange || !conn.fromNode) return;
    const toque = 'changedTouches' in event ? event.changedTouches[0] : undefined;
    const solta = toque ? { x: toque.clientX, y: toque.clientY } : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    // Em cima de um ponto de conexão o React Flow já diz o nó; no corpo do nó, pelo elemento
    const idDestino = conn.toNode?.id
      ?? (document.elementFromPoint(solta.x, solta.y)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id;
    if (!idDestino || idDestino === conn.fromNode.id) return;
    const origem = getInternalNode(conn.fromNode.id);
    const destino = getInternalNode(idDestino);
    if (!origem || !destino) return;

    const ima = imaNoZoom(getZoom());
    const cOrigem = caixaDoNo(origem);
    const cDestino = caixaDoNo(destino);
    const inicio = startMousePos.current ? screenToFlowPosition(startMousePos.current) : conn.from;
    const fim = screenToFlowPosition(solta);
    const sourceAnchor = ancoraNaBorda(cOrigem, inicio ?? fim, undefined, ima);
    const targetAnchor = ancoraNaBorda(cDestino, fim, pontoDaAncora(cOrigem, sourceAnchor), ima);

    const newEdge = {
      id: genId('edge'),
      source: conn.fromNode.id,
      target: idDestino,
      data: { sourceAnchor, targetAnchor },
    };
    onOptionsChange({
      ...options,
      topology: { ...topology, edges: [...topology.edges, newEdge] },
    });
  }, [topology, options, onOptionsChange, getInternalNode, getZoom, screenToFlowPosition]);

  // Re-fit ao redimensionar (importante pra TV) e quando os nós terminam de ser
  // medidos. Sem esperar a medição, o fitView do próprio React Flow rodava
  // DEPOIS deste e desfazia o "preencher a altura" do celular.
  const nosMedidos = useNodesInitialized();
  // ?diag=auto: o mapa dá zoom sozinho escondendo uma parte por rodada (ver o hook)
  const diag = useDiagnosticoZoom(nosMedidos);
  const ultimaLargura = useRef(width);
  useEffect(() => {
    if (!options.fitView || editMode || !nosMedidos) return;
    // Depois de um zoom ou arraste do usuário, mudança só de ALTURA não refaz o
    // ajuste: no celular a barra do navegador some e aparece a cada toque, a
    // tela muda ~56 px e o reajuste jogava o zoom fora ("reinicia tudo").
    // Largura mudando de verdade (girou o celular, janela redimensionada) e o
    // botão ⛶ continuam reajustando.
    const mudouLargura = Math.abs(width - ultimaLargura.current) > width * 0.1;
    ultimaLargura.current = width;
    if (interagiu.current && !mudouLargura) return;
    interagiu.current = false;
    const t = setTimeout(() => fitToContent(300), 80);
    return () => clearTimeout(t);
  }, [width, height, options.fitView, editMode, fitToContent, nosMedidos]);

  // Em modo edição: salva as posições quando o usuário termina de arrastar
  // (ou move com as setas). A mudança de fim de arraste já traz a posição
  // final de cada nó movido. Antes isto lia o estado por um setNodes(updater)
  // e gravava DE DENTRO do updater — função que o React pode rodar mais de uma
  // vez, e no meio do render de outro componente.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    if (!editMode || !onOptionsChange) return;
    const finais = new Map<string, { x: number; y: number }>();
    for (const c of changes) {
      if (c.type === 'position' && c.dragging === false && c.position) {
        finais.set(c.id, c.position);
      }
    }
    const mudou = topology.nodes.some((tn) => {
      const p = finais.get(tn.id);
      return !!p && (p.x !== tn.position.x || p.y !== tn.position.y);
    });
    if (!mudou) return;
    onOptionsChange({
      ...options,
      topology: {
        ...topology,
        nodes: topology.nodes.map((tn) => {
          const p = finais.get(tn.id);
          return p ? { ...tn, position: p } : tn;
        }),
      },
    });
    // editMode nas dependências: entrar no Edit do Grafana 12 não remonta o
    // painel nem muda as opções — sem ele, o callback ficava com o modo de
    // fora do editor e o arraste lá dentro não gravava.
  }, [onNodesChange, editMode, options, topology, onOptionsChange]);

  // O tooltip é acionado por hover NO CARD da interface (via hoverLink/unhoverLink),
  // não pela linha — assim mostra sempre o lado certo, sem brigar com o hover da aresta.
  const onEdgeClick = useCallback((evt: React.MouseEvent, edge: Edge) => {
    setHover(null);
    if (editMode) {
      // No modo edição: clicar abre o editor de propriedades da linha
      setEditingEdgeId(edge.id);
    } else {
      // (No modo público o modal abre só com o tráfego — ver LinkDetailsModal.)
      // Fora do modo edição: abre o modal de UMA interface.
      // 1) Só um lado configurado → abre esse lado.
      // 2) Dois lados → abre o MAIS PRÓXIMO do clique (a zona de clique da linha
      //    tem 22px e passa rente aos cards; sem isso, mirar no card e acertar a
      //    linha abria sempre o mesmo lado — parecia "travado" no anterior).
      const d = edge.data as LinkEdgeData;
      let side: 'source' | 'target' =
        d?.sourceInterface ? 'source' : d?.targetInterface ? 'target' : 'source';
      if (d?.sourceInterface && d?.targetInterface) {
        const p = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
        const sn = getNode(edge.source);
        const tn = getNode(edge.target);
        if (sn && tn) {
          const dist = (n: Node) => Math.hypot(
            (n.position.x + ((n.measured?.width ?? 0) / 2)) - p.x,
            (n.position.y + ((n.measured?.height ?? 0) / 2)) - p.y
          );
          side = dist(sn) <= dist(tn) ? 'source' : 'target';
        }
      }
      setClicked({ edgeId: edge.id, side });
    }
  }, [editMode, screenToFlowPosition, getNode]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (editMode) {
      setEditingNodeId(node.id);
    }
    // Modo visualização: clique esquerdo fica reservado pro linkUrl do nó
    // (dashboard do equipamento). Testes de rede = botão DIREITO.
  }, [editMode]);

  // Botão DIREITO no equipamento → única entrada de testes de rede pelo nó
  // (o esquerdo abre o dashboard via linkUrl). IP do equipamento pré-preenchido.
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    if (editMode || publico) return;
    e.preventDefault();
    onOpenTest(((node.data as any)?.ip as string) ?? '');
  }, [editMode, publico, onOpenTest]);

  // Abre o modal de detalhes focado num lado (clique num card de interface)
  const openLinkDetails = useCallback((edgeId: string, side?: 'source' | 'target') => {
    setHover(null);
    setClicked({ edgeId, side });
  }, []);

  // Hover num card de interface → tooltip daquele lado
  const hoverLink = useCallback((edgeId: string, side: 'source' | 'target', x: number, y: number) => {
    setHover({ edgeId, side, x, y });
  }, []);
  const unhoverLink = useCallback(() => setHover(null), []);

  // Resolve labels da source/target a partir do edge
  const findEdge = (id: string) => edges.find((e) => e.id === id);
  const findNodeLabel = (id: string) => (nodes.find((n) => n.id === id)?.data as any)?.label ?? id;

  const hoveredEdge = hover ? findEdge(hover.edgeId) : null;
  const clickedEdge = clicked ? findEdge(clicked.edgeId) : null;
  const editingEdge = editingEdgeId ? findEdge(editingEdgeId) : null;
  const editingEdgeSaved = editingEdgeId ? topology.edges.find((e) => e.id === editingEdgeId) : undefined;

  return (
    <EditorProvider value={{
      editMode: !!editMode, theme: tema, publicMode: publico,
      setEdgeWaypoints, setEdgeAnchor, setEdgeData, deleteEdge, setNodeData: setNodeDataPatch, deleteNode, duplicateNode,
      // Modo público: sem testes de rede. Tooltip e modal abrem, mas só com o
      // tráfego (LinkTooltip / LinkDetailsModal `publico`).
      openLinkDetails,
      hoverLink,
      unhoverLink,
      openTest: publico ? undefined : onOpenTest,
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={() => { draggingRef.current = true; }}
        onNodeDragStop={() => { draggingRef.current = false; }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={'loose' as any}
        fitView={options.fitView && !editMode}
        fitViewOptions={{ padding: 0.1 }}
        proOptions={{ hideAttribution: true }}
        className={[...(IOS ? ['fc-ios'] : []), ...diag.classes].join(' ') || undefined}
        nodesDraggable={!!editMode}
        nodesConnectable={!!editMode}
        elementsSelectable={true}
        // Celular em pé (limite definido): arrastar para os lados vale mesmo
        // com o cadeado — o mapa preenche a altura e o resto fica dos lados.
        panOnDrag={editMode || !locked || !!limite}
        translateExtent={limite}
        onMoveStart={(ev) => {
          if (!ev) return; // movimento do próprio código (ajuste, botões)
          interagiu.current = true;
          if (limite) setArrastou(true);
        }}
        zoomOnScroll={editMode || !locked}
        // Celular em pé: a pinça também é do mapa. Travada, ela ia pro Safari,
        // que dava zoom na página inteira em vez do mapa.
        zoomOnPinch={editMode || !locked || !!limite}
        zoomOnDoubleClick={editMode || !locked}
        // Travado, a roda (e o arrastar no celular) rola a PÁGINA; o padrão do
        // React Flow engolia o scroll em cima do mapa.
        preventScrolling={editMode || !locked}
        // 0.15 não deixava o mapa inteiro caber num celular em pé (~340 px de
        // largura): o ajuste batia no limite e o mapa ficava cortado e deslocado.
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        // Sem puxar a linha pro ponto de conexão mais próximo (os "pulos"):
        // o link é solto em qualquer ponto do nó (handleConnectEnd)
        connectionRadius={0}
        snapToGrid={!!editMode}
        snapGrid={[15, 15]}
        // Botões de zoom na paleta do tema. Pelas variáveis, não pelo
        // colorMode do React Flow: o modo dark dele pinta o fundo de #141414.
        style={{
          '--xy-controls-button-background-color': pal.surface,
          '--xy-controls-button-background-color-hover': pal.field,
          '--xy-controls-button-color': pal.text,
          '--xy-controls-button-color-hover': pal.text,
          '--xy-controls-button-border-color': pal.border,
        } as React.CSSProperties}
      >
        <Background variant={BackgroundVariant.Lines} color={pal.grid} gap={editMode ? 15 : 30} />
        {diag.ativo && (
          // Abaixo da dica "arraste para os lados" (topo, no meio), que cobria a caixa no celular
          <Panel position="top-left" style={{ marginTop: 48 }}>
            <div style={{
              background: pal.surface, color: pal.text, border: `1px solid ${pal.border}`, borderRadius: 6,
              padding: '6px 8px', fontSize: 11, lineHeight: 1.5, maxWidth: 300, boxShadow: `0 2px 8px ${pal.shadow}`,
            }}>
              {diag.linhas.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</div>)}
              <button onClick={diag.recomecar} style={{ marginTop: 6, fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
                recomeçar o teste
              </button>
            </div>
          </Panel>
        )}
        {/* Celular em pé: sem a dica, ninguém descobre que o resto do mapa
            está dos lados. Some no primeiro arraste. */}
        {limite && !arrastou && (
          <Panel position="top-center">
            <div style={{
              background: pal.surface, color: pal.text, border: `1px solid ${pal.border}`,
              borderRadius: 999, padding: '4px 12px', fontSize: 12, whiteSpace: 'nowrap',
              boxShadow: `0 2px 8px ${pal.shadow}`, pointerEvents: 'none',
            }}>
              ⟷ arraste para os lados
            </div>
          </Panel>
        )}
        {/* Zoom, ajustar e o cadeado — também no modo público: quem olha pela
            internet aproxima um trecho e volta ao mapa inteiro. */}
        <Controls
          showInteractive={false}
          showFitView={false}
          onZoomIn={() => { interagiu.current = true; }}
          onZoomOut={() => { interagiu.current = true; }}
        >
          <ControlButton onClick={() => { interagiu.current = false; fitToContent(300); }} title="Ajustar à tela (preencher)">
            <span style={{ fontSize: 14, lineHeight: 1 }}>⛶</span>
          </ControlButton>
          {!editMode && (
            <ControlButton
              onClick={() => setLocked((l) => !l)}
              title={locked ? 'Destravar painel (zoom/pan)' : 'Travar painel (sem zoom/pan)'}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{locked ? '🔒' : '🔓'}</span>
            </ControlButton>
          )}
        </Controls>
        {options.showMinimap && (!publico || editMode) && (
          <MiniMap
            nodeColor={(n) => (n.data as any)?.status === 'down' ? pal.line.down : pal.ip}
            maskColor={pal.minimapMask}
            style={{ background: pal.surface, border: `1px solid ${pal.border}` }}
          />
        )}
        {editMode && <EditModeBanner onAddNode={addNode} limpeza={limpezaPublica} />}
        {/* Sem a tarja, o mapa todo cinza é ambíguo: cinza também significa
            "não configurado", então o plantão leria "mapa mal montado" em vez
            de "estou cego agora" — reações opostas no pior momento. */}
        {dataHealth !== 'ok' && (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            zIndex: 12, display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(120, 53, 15, 0.95)', border: '1px solid #f59e0b',
            color: '#fde68a', padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, pointerEvents: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            {dataHealth === 'error'
              ? 'A consulta ao datasource falhou — mapa cinza por precaução, não é queda de rede'
              : 'Sem dados do datasource — o mapa não reflete o estado atual da rede'}
          </div>
        )}
        {topology.nodes.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: pal.surface, padding: '24px 40px', borderRadius: 12,
            border: `1px solid ${pal.border}`, color: pal.text, textAlign: 'center', zIndex: 10,
            pointerEvents: 'none', boxShadow: `0 8px 24px ${pal.shadow}`,
          }}>
            <h2 style={{ margin: '0 0 8px 0', color: pal.statusText.warning }}>Topologia Vazia</h2>
            {editMode ? (
              <p style={{ margin: 0 }}>Clique em <b>"Adicionar Equipamento"</b> no banner<br/>acima para começar a montar o mapa.</p>
            ) : (
              <p style={{ margin: 0 }}>Abra o painel em <b>Edit</b> (menu do painel), ative o<br/><b>Modo Edição</b> nas opções e clique em "Adicionar Equipamento".</p>
            )}
          </div>
        )}
        {options.showLegend && (
          <Legend pal={pal} downColor={options.downColor ?? DEFAULT_OPTIONS.downColor} itens={options.legendItems} />
        )}
      </ReactFlow>

      {/* Tooltip de hover */}
      {hover && hoveredEdge && !clicked && (
        <LinkTooltip
          data={hoveredEdge.data as LinkEdgeData}
          sourceLabel={findNodeLabel(hoveredEdge.source)}
          targetLabel={findNodeLabel(hoveredEdge.target)}
          series={data?.series ?? []}
          focusSide={hover.side}
          x={hover.x}
          y={hover.y}
          theme={tema}
          publico={publico && !editMode}
        />
      )}

      {/* Modal de detalhes (fora do modo edição) */}
      {clicked && clickedEdge && (
        <ProtecaoModal key={`${clicked.edgeId}:${clicked.side ?? 'source'}`} oQue="os detalhes do link" onClose={() => setClicked(null)}>
          <LinkDetailsModal
            edgeId={clickedEdge.id}
            data={clickedEdge.data as LinkEdgeData}
            sourceLabel={findNodeLabel(clickedEdge.source)}
            targetLabel={findNodeLabel(clickedEdge.target)}
            series={data?.series ?? []}
            request={data?.request}
            fimDaJanela={timeRange?.to?.valueOf()}
            focusSide={clicked.side}
            publico={publico && !editMode}
            onClose={() => setClicked(null)}
          />
        </ProtecaoModal>
      )}

      {/* Editor de propriedades (modo edição) */}
      {editingEdge && editingEdgeSaved && (
        <EdgeEditor
          key={editingEdge.id}
          edgeId={editingEdge.id}
          // Do que está SALVO, como o editor de nó. O `edges` do React Flow é
          // ressincronizado num efeito, um render depois das opções: a cada
          // letra o campo recebia o valor antigo e depois o novo, e o cursor
          // pulava. E o vivo traz a aparência calculada (vermelho e pulse do
          // DOWN) no lugar da configurada.
          data={editingEdgeSaved.data as LinkData}
          liveSpeed={(editingEdge.data as LinkEdgeData).linkSpeed}
          sourceLabel={findNodeLabel(editingEdge.source)}
          targetLabel={findNodeLabel(editingEdge.target)}
          seriesKeys={seriesKeys}
          onChange={(patch) => setEdgeData(editingEdge.id, patch)}
          onClose={() => setEditingEdgeId(null)}
          onDelete={() => deleteEdge(editingEdge.id)}
        />
      )}

      {/* Editor de propriedades do nó (modo edição) */}
      {editingNodeId && topology.nodes.find(n => n.id === editingNodeId) && (
        <NodeEditor
          nodeId={editingNodeId}
          data={topology.nodes.find(n => n.id === editingNodeId)!.data as any}
          seriesKeys={seriesKeys}
          customImages={topology.customImages ?? []}
          onUploadImage={(img) => {
            if (!onOptionsChange) return;
            const imgs = topology.customImages ?? [];
            // Um save só, com o nó e a galeria: dois onOptionsChange seguidos
            // partiam do mesmo `topology` e o segundo desfazia o primeiro — a
            // imagem ia pra galeria, mas o ícone do nó não trocava.
            onOptionsChange({
              ...options,
              topology: {
                ...topology,
                nodes: topology.nodes.map((n) =>
                  n.id === editingNodeId ? { ...n, data: { ...n.data, customIcon: img.url } } : n
                ),
                customImages: imgs.some((i) => i.url === img.url) ? imgs : [...imgs, img],
              },
            });
          }}
          onRemoveImage={(url) => {
            if (!onOptionsChange) return;
            onOptionsChange({
              ...options,
              topology: { ...topology, customImages: (topology.customImages ?? []).filter((i) => i.url !== url) },
            });
          }}
          onChange={(patch) => setNodeDataPatch(editingNodeId, patch)}
          onDelete={() => deleteNode(editingNodeId)}
          onClose={() => setEditingNodeId(null)}
        />
      )}

      {/* Editor em Massa (quando múltiplos nós estão selecionados no modo edição) */}
      {editMode && nodes.filter(n => n.selected).length > 1 && (
        <div
          style={{
            position: 'fixed',
            top: 70,
            right: 20,
            width: 290,
            background: '#0f172a',
            border: '1px solid #3b82f6',
            borderRadius: 8,
            color: '#e2e8f0',
            zIndex: 10000,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            fontSize: 13,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 600, borderBottom: '1px solid #334155', paddingBottom: 8, marginBottom: 12 }}>
            👥 Edição em Massa ({nodes.filter(n => n.selected).length} Equipamentos)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Largura de todos (px)</div>
              <input
                type="number"
                placeholder="Ex: 120"
                onChange={(e) => {
                  if (!onOptionsChange) return;
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
                  onOptionsChange({
                    ...options,
                    topology: {
                      ...topology,
                      nodes: topology.nodes.map(n => selectedIds.includes(n.id) ? { ...n, data: { ...n.data, nodeWidth: val } } : n)
                    }
                  });
                }}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#e2e8f0',
                  padding: '5px 8px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Altura de todos (px)</div>
              <input
                type="number"
                placeholder="Ex: 80"
                onChange={(e) => {
                  if (!onOptionsChange) return;
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
                  onOptionsChange({
                    ...options,
                    topology: {
                      ...topology,
                      nodes: topology.nodes.map(n => selectedIds.includes(n.id) ? { ...n, data: { ...n.data, nodeHeight: val } } : n)
                    }
                  });
                }}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#e2e8f0',
                  padding: '5px 8px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Arredondamento de todos (px)</div>
              <input
                type="number"
                placeholder="Ex: 10"
                onChange={(e) => {
                  if (!onOptionsChange) return;
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
                  onOptionsChange({
                    ...options,
                    topology: {
                      ...topology,
                      nodes: topology.nodes.map(n => selectedIds.includes(n.id) ? { ...n, data: { ...n.data, borderRadius: val } } : n)
                    }
                  });
                }}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#e2e8f0',
                  padding: '5px 8px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </EditorProvider>
  );
};

/** `limpeza`: só com o modo público ligado e algo a limpar — ver utils/publicacao.
 *  Dois cliques (o segundo confirma), porque apaga configuração. */
const EditModeBanner: React.FC<{ onAddNode: () => void; limpeza?: { resumo: string; aplicar: () => void } }> = ({
  onAddNode, limpeza,
}) => {
  const [confirma, setConfirma] = useState(false);
  return (
  <div
    style={{
      position: 'absolute',
      top: 12,
      left: 12,
      background: 'rgba(245, 158, 11, 0.9)',
      color: '#0f172a',
      padding: '6px 12px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.5,
      zIndex: 10,
      pointerEvents: 'auto',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}
  >
    <div>✏️ MODO EDIÇÃO — arraste os nós para reposicionar ou conectar</div>
    <button onClick={onAddNode} style={{ cursor: 'pointer', background: '#0f172a', color: '#f59e0b', border: 'none', padding: '6px 10px', borderRadius: 4, fontWeight: 'bold' }}>
      ➕ Adicionar Equipamento
    </button>
    {limpeza && (
      <button
        onClick={() => {
          if (!confirma) {
            setConfirma(true);
            return;
          }
          limpeza.aplicar();
          setConfirma(false);
        }}
        onMouseLeave={() => setConfirma(false)}
        title="Para a cópia pública: o JSON do dashboard vai inteiro pro navegador do visitante"
        style={{
          cursor: 'pointer', border: 'none', padding: '6px 10px', borderRadius: 4, fontWeight: 'bold', maxWidth: 320,
          background: confirma ? '#b91c1c' : '#0f172a', color: confirma ? '#fff' : '#f59e0b', textAlign: 'left',
        }}
      >
        {confirma ? `Confirmar: tirar ${limpeza.resumo}` : '🧹 Limpar dados privados (cópia pública)'}
      </button>
    )}
  </div>
  );
};

/** As cores são as mesmas que as linhas usam no tema — inclusive o DOWN, que
 *  vem da opção do painel. O cinza entrou: desde que ausência de dado deixou
 *  de virar verde, ele é estado comum no mapa e não tinha explicação.
 *  Editada nas opções (itens), cada cor passa pelo mesmo piso de contraste da
 *  linha de cor fixa/regra: o traço da legenda sai no tom da linha no mapa.
 *  Item sem texto (ainda sendo digitado) não aparece. */
const Legend: React.FC<{ pal: Palette; downColor: string; itens?: LegendItem[] }> = ({ pal, downColor, itens }) => {
  const linhas: Array<[string, string]> = itens
    ? itens.filter((i) => String(i?.label ?? '').trim())
      .map((i) => [ensureContrast(i.color, pal.canvas, 3), String(i.label).trim()])
    : [
      [pal.line.up, 'link OK'],
      [pal.line.warning, 'alto uso / warning'],
      [ensureContrast(downColor, pal.canvas, 3), 'down'],
      [pal.line.unknown, 'sem status'],
    ];
  if (!linhas.length) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        maxWidth: 240,
        background: pal.surface,
        border: `1px solid ${pal.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 11,
        color: pal.text,
        zIndex: 10,
        pointerEvents: 'none',
        lineHeight: 1.6,
        boxShadow: `0 2px 8px ${pal.shadow}`,
      }}
    >
      {linhas.map(([cor, rotulo], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 18, height: 3, flex: 'none', background: cor, borderRadius: 1 }} /> {rotulo}
        </div>
      ))}
    </div>
  );
};
