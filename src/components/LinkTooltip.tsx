// components/LinkTooltip.tsx — Tooltip de hover.
// Hover num CARD de interface → mostra aquele lado específico (selo ORIGEM/DESTINO).
// Hover na linha → resumo do link. Convenção: inbound = verde, outbound = azul.

import React from 'react';
import { createPortal } from 'react-dom';
import { DataFrame } from '@grafana/data';
import { LinkEdgeData, MetricBinding } from '../types';
import { formatBitsPerSec } from '../utils/format';
import { resolveBindingSeries } from '../utils/dataBinding';
import { Sparkline } from './Sparkline';

interface Props {
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  series?: DataFrame[];
  focusSide?: 'source' | 'target';
  x: number;
  y: number;
}

const IN_COLOR = '#22c55e';
const OUT_COLOR = '#3b82f6';

interface SideStats {
  device: string;
  other: string;
  iface?: string;
  inbound?: number;
  outbound?: number;
  inBinding?: MetricBinding;
  outBinding?: MetricBinding;
  pill?: string;
  pillColor: string;
}

function sideStats(data: LinkEdgeData, focusSide: 'source' | 'target' | undefined, sourceLabel: string, targetLabel: string): SideStats {
  if (focusSide === 'target') {
    return {
      device: targetLabel, other: sourceLabel, iface: data.targetInterface,
      inbound: data.targetTrafficUp ?? data.trafficDown,
      outbound: data.targetTrafficDown ?? data.trafficUp,
      inBinding: data.targetTrafficUpBinding ?? data.trafficDownBinding,
      outBinding: data.targetTrafficDownBinding ?? data.trafficUpBinding,
      pill: 'DESTINO', pillColor: '#10b981',
    };
  }
  return {
    device: sourceLabel, other: targetLabel, iface: data.sourceInterface,
    inbound: data.sourceTrafficUp ?? data.trafficUp,
    outbound: data.sourceTrafficDown ?? data.trafficDown,
    inBinding: data.sourceTrafficUpBinding ?? data.trafficUpBinding,
    outBinding: data.sourceTrafficDownBinding ?? data.trafficDownBinding,
    pill: focusSide ? 'ORIGEM' : undefined, pillColor: '#3b82f6',
  };
}

export const LinkTooltip: React.FC<Props> = ({ data, sourceLabel, targetLabel, series = [], focusSide, x, y }) => {
  const s = sideStats(data, focusSide, sourceLabel, targetLabel);
  const statusColor =
    data.status === 'down' ? '#ef4444' :
    data.status === 'warning' ? '#f59e0b' :
    data.status === 'up' ? '#22c55e' : '#94a3b8';

  const inHist = React.useMemo(() => resolveBindingSeries(series, s.inBinding), [series, s.inBinding]);
  const outHist = React.useMemo(() => resolveBindingSeries(series, s.outBinding), [series, s.outBinding]);

  return createPortal(
    <div
      style={{
        position: 'fixed', left: x + 16, top: y + 16, pointerEvents: 'none', zIndex: 1000,
        background: 'rgba(11, 18, 32, 0.98)', border: `1px solid ${s.pill ? s.pillColor : statusColor}`, borderRadius: 8,
        fontSize: 12, color: '#e2e8f0', fontFamily: 'inherit',
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)', width: 250, overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid #1e293b' }}>
        {s.pill ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ background: s.pillColor, color: '#06281d', fontSize: 9, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4 }}>
                {s.pill}
              </span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.device}</span>
            </div>
            <div style={{ fontSize: 11, color: '#22d3ee', fontFamily: 'monospace' }}>{s.iface ?? '—'}</div>
            <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>↔ {s.other}</div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{sourceLabel} <span style={{ color: '#475569' }}>↔</span> {targetLabel}</span>
          </div>
        )}
      </div>

      <div style={{ padding: 10 }}>
        {/* Inbound / Outbound do lado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>↓ Inbound</div>
            <div style={{ color: IN_COLOR, fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>{formatBitsPerSec(s.inbound)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>↑ Outbound</div>
            <div style={{ color: OUT_COLOR, fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>{formatBitsPerSec(s.outbound)}</div>
          </div>
        </div>

        {/* Mini-gráfico do lado */}
        {(inHist || outHist) && (
          <div style={{ border: '1px solid #1e293b', borderRadius: 5, background: 'rgba(30,41,59,0.35)', padding: 3, marginBottom: 6 }}>
            <Sparkline inbound={inHist} outbound={outHist} h={44} />
          </div>
        )}

        <div style={{ fontSize: 9.5, color: '#475569', fontStyle: 'italic', textAlign: 'center' }}>clique para detalhes da interface</div>
      </div>
    </div>,
    document.body
  );
};
