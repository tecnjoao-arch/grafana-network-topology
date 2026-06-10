// components/edges/LinkEdge.tsx — Aresta estilo draw.io:
// • âncora LIVRE em qualquer ponto do nó (fração 0..1 do bounding box)
// • roteamento manual por waypoints
// • modo edição: arrasta âncoras (laranja) e waypoints (azul);
//   duplo-clique na linha adiciona waypoint, duplo-clique no waypoint remove.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EdgeProps, EdgeLabelRenderer, useInternalNode, useReactFlow, getBezierPath, getSmoothStepPath, Position } from '@xyflow/react';
import { LinkEdgeData } from '../../types';
import { formatBitsPerSec, linkUtilization } from '../../utils/format';
import { getEdgeParams } from '../../utils/floatingEdge';
import { useEditor } from '../EditorContext';

interface Props extends EdgeProps {
  data: LinkEdgeData;
}

type Pt = { x: number; y: number };

function nodeBox(node: any) {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    w: node.measured?.width ?? 0,
    h: node.measured?.height ?? 0,
  };
}

/** Ponto absoluto a partir de uma âncora fracionária 0..1 do nó. */
function anchorToPoint(node: any, a: Pt): Pt {
  const b = nodeBox(node);
  return { x: b.x + a.x * b.w, y: b.y + a.y * b.h };
}

/** Converte um ponto absoluto em fração 0..1 relativa ao nó (clamp). */
function pointToAnchor(node: any, p: Pt): Pt {
  const b = nodeBox(node);
  const fx = b.w ? (p.x - b.x) / b.w : 0.5;
  const fy = b.h ? (p.y - b.y) / b.h : 0.5;
  return { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Gera o path de uma polilinha deslocada perpendicularmente por `d`
 *  (positivo = um lado, negativo = o outro). Usado p/ traçado duplo. */
function offsetPath(pts: Pt[], d: number): string {
  if (pts.length < 2) return '';
  const out: Pt[] = pts.map((p, i) => {
    let dx: number, dy: number;
    if (i === 0) { dx = pts[1].x - p.x; dy = pts[1].y - p.y; }
    else if (i === pts.length - 1) { dx = p.x - pts[i - 1].x; dy = p.y - pts[i - 1].y; }
    else { dx = pts[i + 1].x - pts[i - 1].x; dy = pts[i + 1].y - pts[i - 1].y; }
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular unitária
    const px = -dy / len, py = dx / len;
    return { x: p.x + px * d, y: p.y + py * d };
  });
  return out.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export const LinkEdge: React.FC<Props> = ({ id, source, target, data, selected }) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { editMode, setEdgeWaypoints, setEdgeAnchor } = useEditor();
  const { screenToFlowPosition } = useReactFlow();

  const [localWp, setLocalWp] = useState<Pt[]>(data?.waypoints ?? []);
  const [localSrcA, setLocalSrcA] = useState<Pt | undefined>(data?.sourceAnchor);
  const [localTgtA, setLocalTgtA] = useState<Pt | undefined>(data?.targetAnchor);
  const dragWp = useRef<number | null>(null);
  const dragEnd = useRef<'source' | 'target' | null>(null);

  useEffect(() => {
    if (dragWp.current === null) setLocalWp(data?.waypoints ?? []);
  }, [data?.waypoints]);
  useEffect(() => {
    if (dragEnd.current === null) {
      setLocalSrcA(data?.sourceAnchor);
      setLocalTgtA(data?.targetAnchor);
    }
  }, [data?.sourceAnchor, data?.targetAnchor]);

  if (!sourceNode || !targetNode) return null;

  // Ponto de origem/destino: âncora livre OU flutuante (auto)
  const fp = getEdgeParams(sourceNode, targetNode);
  const sp: Pt = localSrcA ? anchorToPoint(sourceNode, localSrcA) : { x: fp.sx, y: fp.sy };
  const tp: Pt = localTgtA ? anchorToPoint(targetNode, localTgtA) : { x: fp.tx, y: fp.ty };

  const points: Pt[] = [sp, ...localWp, tp];
  const pathType = data?.pathType ?? 'straight';
  
  let edgePath = '';
  if (pathType === 'curved' && localWp.length === 0) {
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const sourcePos = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Right : Position.Left) : (dy > 0 ? Position.Bottom : Position.Top);
    const targetPos = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Left : Position.Right) : (dy > 0 ? Position.Top : Position.Bottom);
    [edgePath] = getBezierPath({
      sourceX: sp.x, sourceY: sp.y, sourcePosition: sourcePos,
      targetX: tp.x, targetY: tp.y, targetPosition: targetPos,
    });
  } else if (pathType === 'step' && localWp.length === 0) {
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const sourcePos = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Right : Position.Left) : (dy > 0 ? Position.Bottom : Position.Top);
    const targetPos = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Left : Position.Right) : (dy > 0 ? Position.Top : Position.Bottom);
    [edgePath] = getSmoothStepPath({
      sourceX: sp.x, sourceY: sp.y, sourcePosition: sourcePos,
      targetX: tp.x, targetY: tp.y, targetPosition: targetPos,
      borderRadius: 12,
    });
  } else {
    if (pathType === 'curved') {
      // Aqui sempre há waypoints (o caso sem waypoints é tratado acima via bezier),
      // logo points.length >= 3.
      edgePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        edgePath += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`;
      }
      edgePath += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    } else if (pathType === 'step') {
      edgePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const A = points[i];
        const B = points[i + 1];
        const dx = Math.abs(B.x - A.x);
        const dy = Math.abs(B.y - A.y);
        if (dx > 0 && dy > 0) {
          const goHoriz = dx >= dy;
          const shouldGoHoriz = data?.flipBends ? !goHoriz : goHoriz;
          if (shouldGoHoriz) {
            edgePath += ` L ${B.x} ${A.y}`;
          } else {
            edgePath += ` L ${A.x} ${B.y}`;
          }
        }
        edgePath += ` L ${B.x} ${B.y}`;
      }
    } else {
      edgePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    }
  }

  // Centro geométrico do conjunto p/ a caixa de tráfego
  const midIdx = (points.length - 1) / 2;
  const lo = Math.floor(midIdx), hi = Math.ceil(midIdx);
  const labelX = (points[lo].x + points[hi].x) / 2;
  const labelY = (points[lo].y + points[hi].y) / 2;

  const status = data?.status ?? 'unknown';
  const util = linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed);
  const autoColor =
    status === 'down' ? '#ef4444' :
    status === 'warning' ? '#f59e0b' :
    status === 'up' && util > 0.8 ? '#f59e0b' :
    status === 'up' ? '#22c55e' :
    '#64748b';
  const color = data?.color ?? autoColor;
  const strokeWidth = data?.lineWidth ?? (3 + util * 4);

  // Traçado e animação são independentes. Defaults pelo status se não definidos.
  const lineStyle = data?.lineStyle ?? 'solid';
  const animation = data?.animation ??
    ((status === 'up' || status === 'warning') ? 'flow' : status === 'down' ? 'pulse' : 'none');

  // dashArray por traçado
  const styleDash =
    lineStyle === 'dashed' ? '10 7' :
    lineStyle === 'dotted' ? `0.1 ${Math.max(6, strokeWidth * 2)}` :
    '0';
  const round = lineStyle === 'dotted';
  // Animações de movimento precisam de um padrão tracejado pra serem visíveis
  const needsDash = animation === 'flow' || animation === 'reverse';
  const dashArray = styleDash !== '0' ? styleDash : (needsDash ? '12 9' : '0');

  const animCss =
    animation === 'flow' ? 'fc-flow 1s linear infinite' :
    animation === 'reverse' ? 'fc-flow-rev 1s linear infinite' :
    animation === 'pulse' ? 'fc-pulse 1.2s ease-in-out infinite' :
    undefined;
  const glow = animation === 'glow';
  const isDouble = lineStyle === 'double';

  // Posiciona labels de interface bem perto do nó (22px ao longo da linha) e
  // levemente deslocados perpendicularmente, pra não colidir com a caixa.
  const seg = (a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    return { ux: dx / len, uy: dy / len };
  };
  const s1 = seg(sp, points[1]);
  const t1 = seg(tp, points[points.length - 2]);
  
  // Para evitar sobreposição, aumentamos a distância OFF se o comprimento total do cabo for suficiente,
  // ou ajustamos dinamicamente com base na proximidade.
  const totalLength = points.reduce((acc, p, idx) => idx === 0 ? 0 : acc + Math.hypot(p.x - points[idx - 1].x, p.y - points[idx - 1].y), 0);
  const OFF = totalLength < 160 ? Math.max(30, totalLength * 0.28) : 58;
  
  const srcLabelPos = { x: sp.x + s1.ux * OFF, y: sp.y + s1.uy * OFF };
  const tgtLabelPos = { x: tp.x + t1.ux * OFF, y: tp.y + t1.uy * OFF };

  // ── Drag de waypoint ──
  const onWpDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragWp.current = idx;
  };
  const onWpMove = (e: React.PointerEvent) => {
    if (dragWp.current === null) return;
    const f = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setLocalWp((c) => { const n = [...c]; n[dragWp.current!] = { x: Math.round(f.x), y: Math.round(f.y) }; return n; });
  };
  const onWpUp = (e: React.PointerEvent) => {
    if (dragWp.current === null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragWp.current = null;
    setLocalWp((c) => { setEdgeWaypoints(id, c); return c; });
  };
  const onWpDbl = (idx: number) => (e: React.MouseEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    const n = localWp.filter((_, i) => i !== idx);
    setLocalWp(n); setEdgeWaypoints(id, n);
  };

  // ── Drag das âncoras (endpoints) ──
  const onEndDown = (which: 'source' | 'target') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragEnd.current = which;
  };
  const onEndMove = (e: React.PointerEvent) => {
    if (!dragEnd.current) return;
    const f = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node = dragEnd.current === 'source' ? sourceNode : targetNode;
    const a = pointToAnchor(node, { x: f.x, y: f.y });
    if (dragEnd.current === 'source') setLocalSrcA(a); else setLocalTgtA(a);
  };
  const onEndUp = (e: React.PointerEvent) => {
    if (!dragEnd.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const which = dragEnd.current;
    dragEnd.current = null;
    const a = which === 'source' ? localSrcA : localTgtA;
    if (a) setEdgeAnchor(id, which, a);
  };

  // Duplo-clique na linha → adiciona waypoint no segmento mais próximo
  const onPathDbl = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    const f = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const click = { x: Math.round(f.x), y: Math.round(f.y) };
    let bestSeg = 0, best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const d = distToSegment(click, points[i], points[i + 1]);
      if (d < best) { best = d; bestSeg = i; }
    }
    const n = [...localWp];
    n.splice(bestSeg, 0, click);
    setLocalWp(n); setEdgeWaypoints(id, n);
  };

  const hasSearch = !!data?.searchQuery;
  const q = data?.searchQuery?.toLowerCase() || '';
  const matchesSearch = hasSearch && (
    (data?.sourceInterface?.toLowerCase().includes(q)) ||
    (data?.targetInterface?.toLowerCase().includes(q)) ||
    (data?.sourceIp?.toLowerCase().includes(q)) ||
    (data?.targetIp?.toLowerCase().includes(q))
  );
  
  // Se tem busca ativa, ofuscar o que não bate com a busca (opacity 0.15)
  const fade = hasSearch && !matchesSearch;
  const edgeOpacity = fade ? 0.15 : 1;
  const isGlowingSearch = hasSearch && matchesSearch;

  return (
    <g style={{ opacity: edgeOpacity, transition: 'opacity 0.2s ease-in-out' }}>
      {/* Halo: status down, selecionado, ou animação glow */}
      {(status === 'down' || selected || glow || isGlowingSearch) && (
        <path
          d={edgePath}
          fill="none"
          stroke={isGlowingSearch ? '#3b82f6' : color}
          strokeWidth={strokeWidth + (glow || isGlowingSearch ? 10 : 6)}
          strokeOpacity={glow || isGlowingSearch ? 0.4 : 0.25}
          strokeLinecap="round"
          style={{
            filter: `blur(${glow || isGlowingSearch ? 4 : 2}px)`,
            animation: (glow || isGlowingSearch) ? 'fc-glow 1.6s ease-in-out infinite' : undefined,
          }}
        />
      )}

      {/* Hitbox p/ click/hover/duplo-clique */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(22, strokeWidth + 16)}
        style={{ cursor: editMode ? 'copy' : 'pointer' }}
        className="react-flow__edge-interaction"
        onDoubleClick={onPathDbl}
      />

      {/* Path central invisível com id (React Flow usa internamente) */}
      <path id={id} d={edgePath} fill="none" stroke="none" style={{ pointerEvents: 'none' }} />

      {isDouble ? (
        // Traçado duplo: 2 fios paralelos. Quando animado, cada um vai
        // num sentido (↑ upload e ↓ download = tráfego bidirecional).
        (() => {
          const active = animation !== 'none';
          const sep = Math.max(3, strokeWidth * 0.85);
          const strandW = Math.max(2, strokeWidth * 0.7);
          const strandDash = active ? '12 9' : '0';
          return (
            <>
              <path
                d={offsetPath(points, sep)}
                fill="none"
                stroke={color}
                strokeWidth={strandW}
                strokeDasharray={strandDash}
                strokeLinecap={round ? 'round' : 'butt'}
                style={{ animation: active ? 'fc-flow 1s linear infinite' : undefined, pointerEvents: 'none' }}
              />
              <path
                d={offsetPath(points, -sep)}
                fill="none"
                stroke={color}
                strokeWidth={strandW}
                strokeDasharray={strandDash}
                strokeLinecap={round ? 'round' : 'butt'}
                style={{ animation: active ? 'fc-flow-rev 1s linear infinite' : undefined, pointerEvents: 'none' }}
              />
            </>
          );
        })()
      ) : (
        // Linha simples
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinecap={round ? 'round' : 'butt'}
          style={{ animation: animCss, pointerEvents: 'none' }}
        />
      )}

      <EdgeLabelRenderer>
        {editMode && (
          <>
            {/* Âncoras (endpoints) — arraste para escolher onde a linha encosta */}
            <EndpointDot pt={sp} color="#f59e0b" onDown={onEndDown('source')} onMove={onEndMove} onUp={onEndUp} title="Arraste para mover a conexão no nó de origem" />
            <EndpointDot pt={tp} color="#f59e0b" onDown={onEndDown('target')} onMove={onEndMove} onUp={onEndUp} title="Arraste para mover a conexão no nó de destino" />
            {/* Waypoints */}
            {localWp.map((wp, idx) => (
              <div
                key={idx}
                onPointerDown={onWpDown(idx)}
                onPointerMove={onWpMove}
                onPointerUp={onWpUp}
                onDoubleClick={onWpDbl(idx)}
                className="nodrag nopan"
                title="Arraste para dobrar • duplo-clique para remover"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#3b82f6', border: '2px solid #dbeafe',
                  cursor: 'grab', pointerEvents: 'all', zIndex: 20,
                }}
              />
            ))}
          </>
        )}

        {data?.sourceInterface && (
          <IfLabel
            text={data.sourceInterface}
            ip={data.showIp ? data.sourceIp : undefined}
            errors={data.sourceErrors}
            tx={data.sourceTrafficUp}
            rx={data.sourceTrafficDown}
            speed={data.linkSpeed}
            x={srcLabelPos.x}
            y={srcLabelPos.y}
            color={color}
            showTraffic={!!data.showTrafficBox && !data.hideTrafficBox}
          />
        )}
        {data?.targetInterface && (
          <IfLabel
            text={data.targetInterface}
            ip={data.showIp ? data.targetIp : undefined}
            errors={data.targetErrors}
            tx={data.targetTrafficUp}
            rx={data.targetTrafficDown}
            speed={data.linkSpeed}
            x={tgtLabelPos.x}
            y={tgtLabelPos.y}
            color={color}
            showTraffic={!!data.showTrafficBox && !data.hideTrafficBox}
          />
        )}
      </EdgeLabelRenderer>
    </g>
  );
};

const EndpointDot: React.FC<{
  pt: Pt; color: string; title: string;
  onDown: (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: (e: React.PointerEvent) => void;
}> = ({ pt, color, title, onDown, onMove, onUp }) => (
  <div
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
    title={title}
    className="nodrag nopan"
    style={{
      position: 'absolute',
      transform: `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px)`,
      width: 13, height: 13, borderRadius: 3,
      background: color, border: '2px solid #fde68a',
      cursor: 'grab', pointerEvents: 'all', zIndex: 21,
    }}
  />
);

const IfLabel: React.FC<{
  text: string;
  ip?: string;
  errors?: number;
  tx?: number;
  rx?: number;
  speed?: number;
  x: number;
  y: number;
  color: string;
  showTraffic: boolean;
}> = ({ text, ip, errors, tx, rx, speed, x, y, color, showTraffic }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        fontSize: '9px',
        color,
        fontFamily: 'monospace',
        background: 'rgba(15, 23, 42, 0.95)',
        padding: '3px 6px',
        borderRadius: 4,
        pointerEvents: 'all', // Permitir clique
        whiteSpace: 'nowrap',
        fontWeight: 600,
        border: `1px solid ${color}`,
        zIndex: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        lineHeight: 1.1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 'bold' }}>
        <span>{text}</span>
        {!!errors && errors > 0 && (
          <span title={`${errors} erros na interface`} style={{ cursor: 'help', fontSize: '11px' }}>⚠️</span>
        )}
      </div>
      {ip && (
        <span
          onClick={handleCopy}
          title="Clique para copiar o IP"
          style={{
            color: copied ? '#4ade80' : '#22d3ee',
            fontSize: '8px',
            marginTop: 2,
            cursor: 'pointer',
            background: copied ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
            padding: '1px 3px',
            borderRadius: 2,
            transition: 'all 0.2s',
          }}
        >
          {copied ? 'Copiado!' : ip}
        </span>
      )}
      {showTraffic && (tx !== undefined || rx !== undefined) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 3, paddingTop: 3, display: 'flex', flexDirection: 'column', gap: 1, fontSize: '8.5px', width: '100%' }}>
          <div style={{ color: '#22c55e', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span>↑</span> <span>{formatBitsPerSec(tx)}</span>
          </div>
          <div style={{ color: '#3b82f6', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span>↓</span> <span>{formatBitsPerSec(rx)}</span>
          </div>
          {speed !== undefined && (
            <div style={{ color: '#94a3b8', fontSize: '7.5px', borderTop: '1px dashed rgba(255,255,255,0.05)', marginTop: 2, paddingTop: 2, textAlign: 'center' }}>
              {formatBitsPerSec(speed)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
