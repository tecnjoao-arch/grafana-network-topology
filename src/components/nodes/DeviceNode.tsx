// components/nodes/DeviceNode.tsx — Nó (ícone + label + IP + badge).
// Sem handles fixos: as âncoras das linhas são livres (definidas na aresta).

import React from 'react';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { DeviceNodeData } from '../../types';
import { getDeviceIcon } from '../../icons';
import { useEditor } from '../EditorContext';

interface Props extends NodeProps {
  data: DeviceNodeData;
}

export const DeviceNode: React.FC<Props> = ({ id, data, selected }) => {
  const { label, ip, deviceType, status, customIcon, color, iconSize, searchQuery, nodeWidth, nodeHeight, borderRadius, bgColor, linkUrl } = data as any;
  // Escala da fonte do painel (opção "Escala da fonte" p/ TV de NOC):
  // textos escalam via em; ícone e badge usam px e precisam multiplicar.
  const fontScale = (data as any).fontScale ?? 1;
  const { editMode, setNodeData, openTest } = useEditor();

  // Hover no nó (modo visualização) → mostra o botão 🌐 de testes de rede
  const [hovered, setHovered] = React.useState(false);

  // Tamanho "ao vivo" durante o resize: atualiza só o estado local (visual).
  // A persistência nas options acontece apenas no fim (handleResizeEnd), evitando
  // um onOptionsChange por tick — o que travava a UI e marcava o dashboard sujo.
  const [liveSize, setLiveSize] = React.useState<{ w?: number; h?: number }>({});

  // Quando as props de tamanho chegam (após persistir), o estado local volta a
  // ser autoritativo das props — sem flash, pois os valores coincidem.
  React.useEffect(() => { setLiveSize({}); }, [data.nodeWidth, data.nodeHeight]);

  const handleResize = (_: any, params: any) => {
    setLiveSize({ w: Math.round(params.width), h: Math.round(params.height) });
  };

  const handleResizeEnd = (_: any, params: any) => {
    setLiveSize({ w: Math.round(params.width), h: Math.round(params.height) });
    if (setNodeData) {
      setNodeData(id, { nodeWidth: Math.round(params.width), nodeHeight: Math.round(params.height) });
    }
  };

  const effWidth = liveSize.w ?? nodeWidth;
  const effHeight = liveSize.h ?? nodeHeight;

  const handleNodeClick = (e: React.MouseEvent) => {
    if (!editMode && linkUrl) {
      e.stopPropagation();
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasSearch = !!searchQuery;
  const q = searchQuery?.toLowerCase() || '';
  const matchesSearch = hasSearch && (
    (label?.toLowerCase().includes(q)) ||
    (ip?.toLowerCase().includes(q))
  );

  const fade = hasSearch && !matchesSearch;
  const nodeOpacity = fade ? 0.2 : 1;

  const borderColor =
    selected ? '#3b82f6' :
    status === 'down' ? '#ef4444' :
    status === 'warning' ? '#f59e0b' :
    'transparent';

  return (
    <div
      onClick={handleNodeClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: nodeOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: borderRadius ?? 8,
        background: bgColor ?? 'rgba(15, 23, 42, 0.85)',
        border: `2px solid ${borderColor}`,
        boxShadow: status === 'down' ? '0 0 12px rgba(239,68,68,0.6)' : '0 2px 8px rgba(0,0,0,0.4)',
        minWidth: effWidth ?? 90,
        width: effWidth ? '100%' : 'auto',
        minHeight: effHeight,
        height: effHeight ? '100%' : 'auto',
        boxSizing: 'border-box',
        transition: 'box-shadow 200ms, border-color 200ms, background 200ms, border-radius 200ms',
        position: 'relative',
        justifyContent: 'center',
        cursor: (!editMode && linkUrl) ? 'pointer' : undefined,
      }}
    >
      {/* Botão de testes de rede: aparece no hover (modo visualização).
          Convive com o clique esquerdo (linkUrl) e o botão direito. */}
      {!editMode && hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // não disparar o linkUrl do nó
            openTest?.((ip as string) ?? '');
          }}
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#0e7490',
            border: '2px solid #0f172a',
            color: '#fff',
            fontSize: 13,
            lineHeight: 1,
            cursor: 'pointer',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          🌐
        </button>
      )}

      {editMode && (
        <>
          <NodeResizer
            color="#3b82f6"
            isVisible={selected}
            minWidth={50}
            minHeight={50}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
            handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
          />

          <Handle id="top" type="source" position={Position.Top} style={edgeHStyle} />
          <Handle id="bottom" type="source" position={Position.Bottom} style={edgeHStyle} />
          <Handle id="left" type="source" position={Position.Left} style={edgeHStyle} />
          <Handle id="right" type="source" position={Position.Right} style={edgeHStyle} />
        </>
      )}

      {/* Handles ocultos fallback p/ React Flow não reclamar */}
      {!editMode && (
        <>
          <Handle type="source" position={Position.Top} id="top" style={{ opacity: 0, pointerEvents: 'none' }} />
          <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, pointerEvents: 'none' }} />
        </>
      )}

      <div style={{ position: 'relative', lineHeight: 0 }}>
        {getDeviceIcon(deviceType, { size: Math.round((iconSize ?? 56) * fontScale), status, color, customIcon })}
        {status && status !== 'unknown' && (
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: Math.round(12 * fontScale),
              height: Math.round(12 * fontScale),
              borderRadius: '50%',
              background:
                color ? color :
                status === 'up' ? '#22c55e' :
                status === 'warning' ? '#f59e0b' :
                '#ef4444',
              border: '2px solid #0f172a',
              boxShadow: color ? `0 0 6px ${color}` : (status === 'down' ? '0 0 6px #ef4444' : 'none'),
            }}
          />
        )}
      </div>

      <div
        style={{
          marginTop: 4,
          color: '#f1f5f9',
          fontSize: '0.9em',
          fontWeight: 600,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {ip && (
        <div
          onClick={handleCopy}
          title="Clique para copiar o IP"
          style={{
            color: copied ? '#4ade80' : '#94a3b8',
            fontSize: '0.75em',
            fontFamily: 'monospace',
            cursor: 'pointer',
            background: copied ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
            padding: '2px 4px',
            borderRadius: 4,
            transition: 'all 0.2s',
          }}
        >
          {copied ? 'Copiado!' : ip}
        </div>
      )}
    </div>
  );
};

const edgeHStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  background: '#3b82f6',
  border: '2px solid #0f172a',
  borderRadius: '50%',
  zIndex: 20,
  cursor: 'crosshair',
};
