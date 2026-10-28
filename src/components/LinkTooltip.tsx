// components/LinkTooltip.tsx — Tooltip de hover.
// Hover num CARD de interface → mostra aquele lado específico (selo ORIGEM/DESTINO).
// Hover na linha → resumo do link. Convenção: inbound = verde, outbound = azul.

import React from 'react';
import { createPortal } from 'react-dom';
import { DataFrame } from '@grafana/data';
import { LinkEdgeData, MetricBinding } from '../types';
import { formatBitsPerSec } from '../utils/format';
import { resolveBindingSeries } from '../utils/dataBinding';
import { PanelTheme, paletteFor } from '../utils/theme';
import { Sparkline } from './Sparkline';

interface Props {
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  series?: DataFrame[];
  focusSide?: 'source' | 'target';
  x: number;
  y: number;
  /** Tema do painel: o tooltip é parte do mapa e segue a paleta dele */
  theme?: PanelTheme;
  /** Modo público (internet): sem o nome da interface */
  publico?: boolean;
}

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
      inBinding: data.targetTrafficUpBinding ?? data.trafficDownBinding ?? data.sourceTrafficDownBinding,
      outBinding: data.targetTrafficDownBinding ?? data.trafficUpBinding ?? data.sourceTrafficUpBinding,
      pill: 'DESTINO', pillColor: '#10b981',
    };
  }
  return {
    device: sourceLabel, other: targetLabel, iface: data.sourceInterface,
    inbound: data.sourceTrafficUp ?? data.trafficUp,
    outbound: data.sourceTrafficDown ?? data.trafficDown,
    // Fallback espelhado: num link p2p, o inbound de A é o outbound de B.
    inBinding: data.sourceTrafficUpBinding ?? data.trafficUpBinding ?? data.targetTrafficDownBinding,
    outBinding: data.sourceTrafficDownBinding ?? data.trafficDownBinding ?? data.targetTrafficUpBinding,
    pill: focusSide ? 'ORIGEM' : undefined, pillColor: '#3b82f6',
  };
}

export const LinkTooltip: React.FC<Props> = ({ data, sourceLabel, targetLabel, series = [], focusSide, x, y, theme, publico }) => {
  const s = sideStats(data, focusSide, sourceLabel, targetLabel);
  const pal = paletteFor(theme);
  const status = data.status ?? 'unknown';
  const statusColor = pal.line[status];

  const inHist = React.useMemo(() => resolveBindingSeries(series, s.inBinding), [series, s.inBinding]);
  const outHist = React.useMemo(() => resolveBindingSeries(series, s.outBinding), [series, s.outBinding]);

  return createPortal(
    <div
      style={{
        position: 'fixed', left: x + 16, top: y + 16, pointerEvents: 'none', zIndex: 1000,
        background: pal.surface, border: `1px solid ${statusColor}`, borderRadius: 8,
        fontSize: 12, color: pal.text, fontFamily: 'inherit',
        boxShadow: `0 10px 30px ${pal.shadow}`, width: 280, overflow: 'hidden',
      }}
    >
      {/* Header: equipamento + interface */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${pal.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>{s.device}</span>
          {/* Público: sem o nome da interface, como no card */}
          {!publico && <span style={{ fontSize: 11.5, color: pal.ip, fontFamily: 'monospace' }}>{s.iface ?? '—'}</span>}
        </div>
        <div style={{ fontSize: 10.5, color: pal.textMuted, marginTop: 2 }}>↔ {s.other}</div>
        {/* Por que está nessa cor. "Sem coleta" e "série não encontrada" pedem
            reações opostas — sem o motivo, o operador só vê vermelho. */}
        {data.statusDetail && (
          <div style={{ fontSize: 10.5, color: pal.statusText[status], marginTop: 4, fontWeight: 600 }}>
            {data.statusDetail}
          </div>
        )}
      </div>

      <div style={{ padding: 8 }}>
        {/* Gráfico em destaque, com escala no eixo Y */}
        {(inHist || outHist) ? (
          <div style={{ border: `1px solid ${pal.border}`, borderRadius: 6, background: pal.canvas, padding: 4 }}>
            <Sparkline inbound={inHist} outbound={outHist} h={86} w={256} axis pal={pal} />
          </div>
        ) : (
          <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: pal.textMuted, border: `1px dashed ${pal.border}`, borderRadius: 6 }}>
            sem histórico
          </div>
        )}

        {/* In/Out discreto, abaixo do gráfico */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'monospace', marginTop: 6, padding: '0 2px' }}>
          <span><span style={{ color: pal.inbound }}>↓ in</span> <span style={{ fontWeight: 600 }}>{formatBitsPerSec(s.inbound)}</span></span>
          <span><span style={{ color: pal.outbound }}>↑ out</span> <span style={{ fontWeight: 600 }}>{formatBitsPerSec(s.outbound)}</span></span>
        </div>

        <div style={{ fontSize: 10, color: pal.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 6 }}>clique para detalhes</div>
      </div>
    </div>,
    document.body
  );
};
