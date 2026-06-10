// components/TopologyPanel.tsx — Panel principal.
// Suporta: modo edição (arrastar e salvar), tooltip hover, modal click, auto-fit em TVs.

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  Node, Edge, NodeChange, Connection, OnConnectStart,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PanelOptions, NetworkTopology, LinkEdgeData, DEFAULT_OPTIONS } from '../types';
import { DeviceNode } from './nodes/DeviceNode';
import { LinkEdge } from './edges/LinkEdge';
import { LinkTooltip } from './LinkTooltip';
import { LinkDetailsModal } from './LinkDetailsModal';
import { EdgeEditor } from './EdgeEditor';
import { NodeEditor } from './NodeEditor';
import { EditorProvider } from './EditorContext';
import { LinkEdgeData as LinkData } from '../types';
import { resolveBinding, resolveTextBinding, listSeriesKeys, setStaleThresholdMs } from '../utils/dataBinding';

// Gera ids únicos e estáveis dentro do processo. Date.now() sozinho colide
// quando o usuário duplica/cola vários nós no mesmo milissegundo.
let __idSeq = 0;
const genId = (prefix: string) => `${prefix}-${Date.now()}-${(__idSeq++).toString(36)}`;

const Sidebar: React.FC<{
  showIp: boolean;
  onToggleIp: () => void;
  hideTraffic: boolean;
  onToggleTraffic: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
}> = ({ showIp, onToggleIp, hideTraffic, onToggleTraffic, searchQuery, onSearch }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: 'rgba(15, 23, 42, 0.85)', color: '#cbd5e1', border: '1px solid #334155',
          borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontSize: 16 }}>🛠️</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Opções</span>
      </button>
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
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(51, 65, 85, 0.5)',
        padding: '12px',
        borderRadius: 8,
        zIndex: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        width: 260,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 8 }}>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>⚙️ Painel de Opções</span>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Barra de Pesquisa */}
      <div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Busca no Mapa</div>
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(30, 41, 59, 0.8)', borderRadius: 6, padding: '6px 8px', border: '1px solid #334155' }}>
          <span style={{ fontSize: 14, marginRight: 6 }}>🔍</span>
          <input
            type="search"
            placeholder="IP ou Nome..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            style={{
              background: 'transparent', border: 'none', color: '#e2e8f0', outline: 'none',
              fontSize: 13, width: '100%', fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #334155', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Toggle Switch de IP */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
          <span>Mostrar IPs das Interfaces</span>
          <div style={{ position: 'relative', width: 36, height: 20 }}>
            <input type="checkbox" checked={showIp} onChange={onToggleIp} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: showIp ? '#3b82f6' : '#475569', transition: '.3s', borderRadius: 20,
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
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
          <span>Ocultar Cards de Tráfego</span>
          <div style={{ position: 'relative', width: 36, height: 20 }}>
            <input type="checkbox" checked={hideTraffic} onChange={onToggleTraffic} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: hideTraffic ? '#3b82f6' : '#475569', transition: '.3s', borderRadius: 20,
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
  50% { opacity: 0.4; }
}
@keyframes fc-glow {
  0%, 100% { stroke-opacity: 0.2; }
  50% { stroke-opacity: 0.6; }
}
`;

type Props = PanelProps<PanelOptions>;

interface HoverState {
  edgeId: string;
  x: number;
  y: number;
}

interface ClickState {
  edgeId: string;
}

export const TopologyPanel: React.FC<Props> = (props) => {
  const { options, width, height, data } = props;

  // Aplica o limite de obsolescência configurado antes de resolver os bindings.
  setStaleThresholdMs((options.staleThresholdSec ?? DEFAULT_OPTIONS.staleThresholdSec) * 1000);

  // Topologia real (editável) — pode estar vazia; nenhum exemplo é injetado.
  const topology = options.topology ?? DEFAULT_OPTIONS.topology;
  const series = data?.series ?? [];

  const [showIp, setShowIp] = useState(false);
  const [hideTrafficCards, setHideTrafficCards] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Função utilitária para avaliar regra de status
  const evaluateStatus = (value: number | undefined, op?: string, target?: number) => {
    if (value === undefined) return 'unknown';
    const tgt = target ?? 0;
    const operator = op ?? '>';
    let isUp = false;
    switch (operator) {
      case '==': isUp = value === tgt; break;
      case '!=': isUp = value !== tgt; break;
      case '>': isUp = value > tgt; break;
      case '>=': isUp = value >= tgt; break;
      case '<': isUp = value < tgt; break;
      case '<=': isUp = value <= tgt; break;
      default: isUp = value > tgt;
    }
    return isUp ? 'up' : 'down';
  };

  // Nós: aplica binding de status baseado na regra customizada
  const initialNodes: Node[] = useMemo(
    () => topology.nodes.map((n) => {
      const live = resolveBinding(series, n.data.statusBinding);
      let status = n.data.status;
      let color = n.data.color;

      if (n.data.statusBinding && live !== undefined) {
        if (n.data.colorMappings && n.data.colorMappings.length > 0) {
          const liveStr = String(live).trim().toLowerCase();
          const matched = n.data.colorMappings.find(
            (m) => String(m.value).trim().toLowerCase() === liveStr
          );
          if (matched) {
            color = matched.color;
            status = 'up'; // Actives status dot/badge, DeviceNode colors it using the 'color' variable
          } else {
            status = 'unknown';
          }
        } else {
          status = evaluateStatus(live, n.data.statusOperator, n.data.statusValue);
        }
      }

      return {
        id: n.id,
        type: 'device',
        position: n.position,
        // fontScale injetado: o DeviceNode usa pra escalar ícone e badge (px fixos)
        data: { ...n.data, status, color, searchQuery, fontScale: options.fontScale ?? 1 } as any,
      };
    }),
    [topology, series, searchQuery, options.fontScale]
  );

  // Arestas: aplica binding de up/down/speed e IP das séries
  const initialEdges: Edge[] = useMemo(
    () => topology.edges.map((e) => {
      const up = resolveBinding(series, e.data.trafficUpBinding);
      const down = resolveBinding(series, e.data.trafficDownBinding);
      const speed = resolveBinding(series, e.data.speedBinding);
      const srcIp = resolveTextBinding(series, e.data.sourceIpBinding);
      const tgtIp = resolveTextBinding(series, e.data.targetIpBinding);
      
      const srcErr = resolveBinding(series, e.data.sourceErrorBinding);
      const tgtErr = resolveBinding(series, e.data.targetErrorBinding);

      // Bindings específicos por interface (lado A / lado B)
      const srcUp = resolveBinding(series, e.data.sourceTrafficUpBinding);
      const srcDown = resolveBinding(series, e.data.sourceTrafficDownBinding);
      const tgtUp = resolveBinding(series, e.data.targetTrafficUpBinding);
      const tgtDown = resolveBinding(series, e.data.targetTrafficDownBinding);
      
      // Bindings específicos de Fibra (DOM)
      const srcDomTemp = resolveBinding(series, e.data.sourceDomTempBinding);
      const srcDomVolt = resolveBinding(series, e.data.sourceDomVoltBinding);
      const srcDomBias = resolveBinding(series, e.data.sourceDomBiasBinding);
      const srcDomTx = resolveBinding(series, e.data.sourceDomTxPowerBinding);
      const srcDomRx = resolveBinding(series, e.data.sourceDomRxPowerBinding);

      const tgtDomTemp = resolveBinding(series, e.data.targetDomTempBinding);
      const tgtDomVolt = resolveBinding(series, e.data.targetDomVoltBinding);
      const tgtDomBias = resolveBinding(series, e.data.targetDomBiasBinding);
      const tgtDomTx = resolveBinding(series, e.data.targetDomTxPowerBinding);
      const tgtDomRx = resolveBinding(series, e.data.targetDomRxPowerBinding);
      
      const hasBinding = !!(e.data.trafficUpBinding || e.data.trafficDownBinding || e.data.sourceTrafficUpBinding || e.data.targetTrafficUpBinding);
      const resolved = up !== undefined || down !== undefined || srcUp !== undefined || tgtUp !== undefined;

      const liveStatusVal = resolveBinding(series, e.data.statusBinding);
      let edgeColor = e.data.color;
      let edgeAnim = e.data.animation;
      let edgeStatus = hasBinding ? (resolved ? 'up' : 'unknown') : e.data.status;

      if (e.data.statusBinding && liveStatusVal !== undefined) {
        if (e.data.colorMappings && e.data.colorMappings.length > 0) {
          const liveStr = String(liveStatusVal).trim().toLowerCase();
          const matched = e.data.colorMappings.find(
            (m) => String(m.value).trim().toLowerCase() === liveStr
          );
          if (matched) {
            edgeColor = matched.color;
            edgeAnim = matched.animation ?? 'none';
            edgeStatus = 'up'; // Mark as up to apply color and animation properly
          } else {
            edgeStatus = 'unknown'; // Gray/unknown if status metric is resolved but no rule matches
          }
        }
      }

      // Tráfego por lado (A=origem, B=destino). O lado B espelha o A: o "upload"
      // de B corresponde ao "download" do link e vice-versa. Precedência em cada
      // campo: binding do lado → binding global → estático do lado → estático global.
      const sourceUp   = srcUp   ?? up   ?? e.data.sourceTrafficUp   ?? e.data.trafficUp;
      const sourceDown = srcDown ?? down ?? e.data.sourceTrafficDown ?? e.data.trafficDown;
      const targetUp   = tgtUp   ?? down ?? e.data.targetTrafficUp   ?? e.data.trafficDown ?? e.data.trafficUp;
      const targetDown = tgtDown ?? up   ?? e.data.targetTrafficDown ?? e.data.trafficUp   ?? e.data.trafficDown;

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

        showIp: showIp,
        searchQuery: searchQuery,
        hideTrafficBox: hideTrafficCards,
        color: edgeColor,
        animation: edgeAnim,
        status: edgeStatus,
      };
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'link',
        data: liveData as any,
      };
    }),
    [topology, series, showIp, searchQuery, hideTrafficCards]
  );

  return (
    <div
      style={{
        width, height,
        background: options.theme === 'light' ? '#f8fafc' : '#020617',
        position: 'relative',
        fontSize: `${14 * (options.fontScale ?? 1)}px`,
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <ReactFlowProvider>
        <TopologyInner
          {...props}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          topology={topology}
        />
        {!options.editMode && (
          <Sidebar
            showIp={showIp}
            onToggleIp={() => setShowIp(!showIp)}
            hideTraffic={hideTrafficCards}
            onToggleTraffic={() => setHideTrafficCards(!hideTrafficCards)}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
          />
        )}
      </ReactFlowProvider>
    </div>
  );
};

interface InnerProps extends Props {
  initialNodes: Node[];
  initialEdges: Edge[];
  topology: NetworkTopology;
}

const TopologyInner: React.FC<InnerProps> = ({
  initialNodes, initialEdges, topology, options, width, height, onOptionsChange, data,
}) => {
  const seriesKeys = useMemo(() => listSeriesKeys(data?.series ?? []), [data?.series]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  const [hover, setHover] = useState<HoverState | null>(null);
  const [clicked, setClicked] = useState<ClickState | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // Tracking do mouse para âncoras exatas
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const startMousePos = useRef<{ x: number; y: number } | null>(null);
  // True enquanto um nó está sendo arrastado — usado para não resetar a posição
  // no meio do arraste quando chega um refresh de dados do Grafana.
  const draggingRef = useRef(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => { lastMousePos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const clipboard = useRef<Array<{ data: any; width?: number; height?: number; position?: { x: number; y: number } }>>([]);

  useEffect(() => {
    if (!options.editMode) return;
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
  }, [nodes, options, topology, onOptionsChange]);

  // Fecha o editor se sair do modo edição
  useEffect(() => { 
    if (!options.editMode) {
      setEditingEdgeId(null); 
      setEditingNodeId(null);
    }
  }, [options.editMode]);

  // Re-sincroniza com a topologia/dados sem destruir a interação em curso:
  //  • não toca nos nós enquanto há um arraste em andamento (evita o nó "voltar"
  //    quando o Grafana atualiza as séries no meio do drag);
  //  • preserva a seleção atual — senão um refresh zeraria a seleção no meio de
  //    uma edição em massa.
  useEffect(() => {
    if (draggingRef.current) return;
    setNodes((curr) => {
      const sel = new Set(curr.filter((n) => n.selected).map((n) => n.id));
      return sel.size ? initialNodes.map((n) => (sel.has(n.id) ? { ...n, selected: true } : n)) : initialNodes;
    });
  }, [initialNodes, setNodes]);
  useEffect(() => {
    setEdges((curr) => {
      const sel = new Set(curr.filter((e) => e.selected).map((e) => e.id));
      return sel.size ? initialEdges.map((e) => (sel.has(e.id) ? { ...e, selected: true } : e)) : initialEdges;
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

  const { screenToFlowPosition, getNode } = useReactFlow();

  const handleConnectStart = useCallback<OnConnectStart>((event) => {
    if ('clientX' in event) {
      startMousePos.current = { x: event.clientX, y: event.clientY };
    } else if ('touches' in event && event.touches.length) {
      startMousePos.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    if (!onOptionsChange || !connection.source || !connection.target) return;
    
    let sPos = startMousePos.current ? screenToFlowPosition(startMousePos.current) : null;
    let tPos = lastMousePos.current ? screenToFlowPosition(lastMousePos.current) : null;

    const sNode = getNode(connection.source);
    const tNode = getNode(connection.target);

    const getAnchor = (node: any, pos: {x: number, y: number} | null, handleId?: string | null) => {
      let x = 0.5, y = 0.5;
      if (node && pos) {
        const nx = node.internals?.positionAbsolute?.x ?? node.position.x;
        const ny = node.internals?.positionAbsolute?.y ?? node.position.y;
        const nw = node.measured?.width ?? 64;
        const nh = node.measured?.height ?? 64;
        x = Math.max(0, Math.min(1, (pos.x - nx) / nw));
        y = Math.max(0, Math.min(1, (pos.y - ny) / nh));
      }
      if (handleId === 'top') y = 0;
      else if (handleId === 'bottom') y = 1;
      else if (handleId === 'left') x = 0;
      else if (handleId === 'right') x = 1;
      
      return { x, y };
    };

    const newEdge = {
      id: genId('edge'),
      source: connection.source,
      target: connection.target,
      data: {
        sourceAnchor: getAnchor(sNode, sPos, connection.sourceHandle),
        targetAnchor: getAnchor(tNode, tPos, connection.targetHandle),
      },
    };
    onOptionsChange({
      ...options,
      topology: { ...topology, edges: [...topology.edges, newEdge] },
    });
  }, [topology, options, onOptionsChange, getNode, screenToFlowPosition]);

  // Re-fit ao redimensionar (importante pra TV)
  useEffect(() => {
    if (options.fitView && !options.editMode) {
      const t = setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 80);
      return () => clearTimeout(t);
    }
  }, [width, height, options.fitView, options.editMode, fitView]);

  // Em modo edição: salva posições quando o usuário termina de arrastar
  const lastSavedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    if (!options.editMode) return;
    // Detecta término de arraste (position change com dragging=false)
    const dragEnds = changes.filter(
      (c) => c.type === 'position' && c.dragging === false
    );
    if (dragEnds.length === 0) return;

    // Coleta posições atuais e salva no panel options
    setNodes((curr) => {
      const positionsChanged = curr.some((n) => {
        const last = lastSavedPositions.current.get(n.id);
        return !last || last.x !== n.position.x || last.y !== n.position.y;
      });
      if (positionsChanged && onOptionsChange) {
        const updatedTopology: NetworkTopology = {
          ...topology,
          nodes: topology.nodes.map((tn) => {
            const found = curr.find((c) => c.id === tn.id);
            return found ? { ...tn, position: found.position } : tn;
          }),
        };
        curr.forEach((n) => lastSavedPositions.current.set(n.id, n.position));
        onOptionsChange({ ...options, topology: updatedTopology });
      }
      return curr;
    });
  }, [onNodesChange, options, topology, onOptionsChange, setNodes]);

  // Handlers de tooltip
  const onEdgeMouseEnter = useCallback((evt: React.MouseEvent, edge: Edge) => {
    setHover({ edgeId: edge.id, x: evt.clientX, y: evt.clientY });
  }, []);
  const onEdgeMouseMove = useCallback((evt: React.MouseEvent, edge: Edge) => {
    setHover({ edgeId: edge.id, x: evt.clientX, y: evt.clientY });
  }, []);
  const onEdgeMouseLeave = useCallback(() => setHover(null), []);
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setHover(null);
    if (options.editMode) {
      // No modo edição: clicar abre o editor de propriedades da linha
      setEditingEdgeId(edge.id);
    } else {
      // Fora do modo edição: clicar mostra detalhes/tráfego
      setClicked({ edgeId: edge.id });
    }
  }, [options.editMode]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (options.editMode) {
      setEditingNodeId(node.id);
    }
  }, [options.editMode]);

  // Resolve labels da source/target a partir do edge
  const findEdge = (id: string) => edges.find((e) => e.id === id);
  const findNodeLabel = (id: string) => (nodes.find((n) => n.id === id)?.data as any)?.label ?? id;

  const hoveredEdge = hover ? findEdge(hover.edgeId) : null;
  const clickedEdge = clicked ? findEdge(clicked.edgeId) : null;
  const editingEdge = editingEdgeId ? findEdge(editingEdgeId) : null;

  return (
    <EditorProvider value={{ editMode: !!options.editMode, setEdgeWaypoints, setEdgeAnchor, setEdgeData, deleteEdge, setNodeData: setNodeDataPatch, deleteNode, duplicateNode }}>
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
        fitView={options.fitView && !options.editMode}
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!!options.editMode}
        nodesConnectable={!!options.editMode}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.15}
        maxZoom={4}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseMove={onEdgeMouseMove}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onConnectStart={handleConnectStart}
        onConnect={handleConnect}
        snapToGrid={!!options.editMode}
        snapGrid={[15, 15]}
      >
        <Background variant={BackgroundVariant.Lines} color={options.theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'} gap={options.editMode ? 15 : 30} />
        <Controls showInteractive={false} />
        {options.showMinimap && (
          <MiniMap
            nodeColor={(n) => (n.data as any)?.status === 'down' ? '#ef4444' : '#22d3ee'}
            maskColor="rgba(2, 6, 23, 0.7)"
            style={{ background: '#0f172a' }}
          />
        )}
        {options.editMode && <EditModeBanner onAddNode={addNode} />}
        {topology.nodes.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.9)', padding: '24px 40px', borderRadius: 12,
            border: '1px solid #334155', color: '#cbd5e1', textAlign: 'center', zIndex: 10,
            pointerEvents: 'none',
          }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#f59e0b' }}>Topologia Vazia</h2>
            {options.editMode ? (
              <p style={{ margin: 0 }}>Clique em <b>"Adicionar Equipamento"</b> no banner<br/>acima para começar a montar o mapa.</p>
            ) : (
              <p style={{ margin: 0 }}>Ative o <b>Modo Edição</b> nas opções do painel<br/>e clique em "Adicionar Equipamento".</p>
            )}
          </div>
        )}
        {options.showLegend && <Legend />}
      </ReactFlow>

      {/* Tooltip de hover */}
      {hover && hoveredEdge && !clicked && (
        <LinkTooltip
          data={hoveredEdge.data as LinkEdgeData}
          sourceLabel={findNodeLabel(hoveredEdge.source)}
          targetLabel={findNodeLabel(hoveredEdge.target)}
          x={hover.x}
          y={hover.y}
        />
      )}

      {/* Modal de detalhes (fora do modo edição) */}
      {clicked && clickedEdge && (
        <LinkDetailsModal
          edgeId={clickedEdge.id}
          data={clickedEdge.data as LinkEdgeData}
          sourceLabel={findNodeLabel(clickedEdge.source)}
          targetLabel={findNodeLabel(clickedEdge.target)}
          series={data?.series ?? []}
          onClose={() => setClicked(null)}
        />
      )}

      {/* Editor de propriedades (modo edição) */}
      {editingEdge && (
        <EdgeEditor
          key={editingEdge.id}
          edgeId={editingEdge.id}
          data={editingEdge.data as LinkData}
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
          onAddCustomImage={(img) => {
            if (!onOptionsChange) return;
            const currentImages = topology.customImages ?? [];
            if (currentImages.some((i) => i.url === img.url)) return;
            onOptionsChange({
              ...options,
              topology: {
                ...topology,
                customImages: [...currentImages, img],
              },
            });
          }}
          onChange={(patch) => setNodeDataPatch(editingNodeId, patch)}
          onDelete={() => deleteNode(editingNodeId)}
          onClose={() => setEditingNodeId(null)}
        />
      )}

      {/* Editor em Massa (quando múltiplos nós estão selecionados no modo edição) */}
      {options.editMode && nodes.filter(n => n.selected).length > 1 && (
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

const EditModeBanner: React.FC<{ onAddNode: () => void }> = ({ onAddNode }) => (
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
  </div>
);

const Legend: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid #334155',
      borderRadius: 6,
      padding: '8px 10px',
      fontSize: 11,
      color: '#cbd5e1',
      zIndex: 10,
      pointerEvents: 'none',
      lineHeight: 1.6,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 18, height: 3, background: '#22c55e', borderRadius: 1 }} /> link OK
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 18, height: 3, background: '#f59e0b', borderRadius: 1 }} /> alto uso / warning
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 18, height: 3, background: '#ef4444', borderRadius: 1 }} /> down
    </div>
  </div>
);
