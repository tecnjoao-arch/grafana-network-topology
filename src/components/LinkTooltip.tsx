// components/LinkTooltip.tsx — Tooltip de hover sobre a aresta.
// Mostra status, interfaces, inbound/outbound, barra de utilização e mini-gráfico.
// Convenção unificada: inbound = verde, outbound = azul.

import React from 'react';
import { createPortal } from 'react-dom';
import { DataFrame } from '@grafana/data';
import { LinkEdgeData } from '../types';
import { formatBitsPerSec, linkUtilization } from '../utils/format';
import { resolveBindingSeries } from '../utils/dataBinding';
import { Sparkline } from './Sparkline';

interface Props {
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  series?: DataFrame[];
  x: number;
  y: number;
}

const IN_COLOR = '#22c55e';
const OUT_COLOR = '#3b82f6';

export const LinkTooltip: React.FC<Props> = ({ data, sourceLabel, targetLabel, series = [], x, y }) => {
  const inbound = data.sourceTrafficUp ?? data.trafficUp;
  const outbound = data.sourceTrafficDown ?? data.trafficDown;
  const util = linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed);
  const utilPct = util * 100;

  const statusColor =
    data.status === 'down' ? '#ef4444' :
    data.status === 'warning' ? '#f59e0b' :
    data.status === 'up' ? '#22c55e' : '#94a3b8';
  const utilColor = utilPct >= 90 ? '#f59e0b' : utilPct >= 50 ? '#facc15' : '#22d3ee';

  const inHist = React.useMemo(
    () => resolveBindingSeries(series, data.sourceTrafficUpBinding ?? data.trafficUpBinding),
    [series, data.sourceTrafficUpBinding, data.trafficUpBinding]
  );
  const outHist = React.useMemo(
    () => resolveBindingSeries(series, data.sourceTrafficDownBinding ?? data.trafficDownBinding),
    [series, data.sourceTrafficDownBinding, data.trafficDownBinding]
  );

  return createPortal(
    <div
      style={{
        position: 'fixed', left: x + 16, top: y + 16, pointerEvents: 'none', zIndex: 1000,
        background: 'rgba(11, 18, 32, 0.98)', border: `1px solid ${statusColor}`, borderRadius: 8,
        padding: 0, fontSize: 12, color: '#e2e8f0', fontFamily: 'inherit',
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)', width: 248, overflow: 'hidden',
      }}
    >
      {/* Header com faixa de status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid #1e293b' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{sourceLabel} <span style={{ color: '#475569' }}>↔</span> {targetLabel}</span>
      </div>

      <div style={{ padding: 10 }}>
        {(data.sourceInterface || data.targetInterface) && (
          <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace', marginBottom: 8 }}>
            {data.sourceInterface ?? '—'} <span style={{ color: '#334155' }}>·</span> {data.targetInterface ?? '—'}
          </div>
        )}

        {/* Inbound / Outbound */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>↓ Inbound</div>
            <div style={{ color: IN_COLOR, fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{formatBitsPerSec(inbound)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>↑ Outbound</div>
            <div style={{ color: OUT_COLOR, fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{formatBitsPerSec(outbound)}</div>
          </div>
        </div>

        {/* Barra de utilização */}
        {data.linkSpeed !== undefined && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 3 }}>
              <span>utilização · {formatBitsPerSec(data.linkSpeed)}</span>
              <span style={{ color: utilColor, fontWeight: 700 }}>{utilPct.toFixed(1)}%</span>
            </div>
            <div style={{ height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, utilPct)}%`, height: '100%', background: utilColor, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Mini-gráfico */}
        {(inHist || outHist) && (
          <div style={{ border: '1px solid #1e293b', borderRadius: 5, background: 'rgba(30,41,59,0.35)', padding: 3, marginBottom: 6 }}>
            <Sparkline inbound={inHist} outbound={outHist} h={42} />
          </div>
        )}

        <div style={{ fontSize: 9.5, color: '#475569', fontStyle: 'italic', textAlign: 'center' }}>clique para detalhes da interface</div>
      </div>
    </div>,
    document.body
  );
};
