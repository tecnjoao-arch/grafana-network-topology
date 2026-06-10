// components/LinkTooltip.tsx — Tooltip flutuante exibido ao passar o mouse sobre uma aresta.

import React from 'react';
import { createPortal } from 'react-dom';
import { LinkEdgeData } from '../types';
import { formatBitsPerSec, linkUtilization } from '../utils/format';

interface Props {
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  x: number;
  y: number;
}

export const LinkTooltip: React.FC<Props> = ({ data, sourceLabel, targetLabel, x, y }) => {
  const util = (linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed) * 100).toFixed(1);
  const color =
    data.status === 'down' ? '#ef4444' :
    data.status === 'warning' ? '#f59e0b' :
    data.status === 'up' ? '#22c55e' : '#94a3b8';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: x + 16,
        top: y + 16,
        pointerEvents: 'none',
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.97)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 12,
        color: '#e2e8f0',
        lineHeight: 1.5,
        fontFamily: 'monospace',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        minWidth: 200,
        maxWidth: 320,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color, borderBottom: `1px solid ${color}40`, paddingBottom: 4 }}>
        {sourceLabel} ↔ {targetLabel}
      </div>
      {data.sourceInterface && (
        <div><span style={{ color: '#64748b' }}>src:</span> {data.sourceInterface}</div>
      )}
      {data.targetInterface && (
        <div><span style={{ color: '#64748b' }}>dst:</span> {data.targetInterface}</div>
      )}
      <div><span style={{ color: '#64748b' }}>up:</span> <span style={{ color: '#22c55e' }}>{formatBitsPerSec(data.trafficUp)}</span></div>
      <div><span style={{ color: '#64748b' }}>down:</span> <span style={{ color: '#22d3ee' }}>{formatBitsPerSec(data.trafficDown)}</span></div>
      <div><span style={{ color: '#64748b' }}>speed:</span> {formatBitsPerSec(data.linkSpeed)}</div>
      <div><span style={{ color: '#64748b' }}>util:</span> {util}%</div>
      <div style={{ marginTop: 4, fontSize: 10, color: '#475569', fontStyle: 'italic' }}>clique para mais detalhes</div>
    </div>,
    document.body
  );
};
