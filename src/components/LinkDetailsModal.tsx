// components/LinkDetailsModal.tsx — Modal exibido ao clicar numa aresta.
// Mostra detalhes do link + placeholder pra gráfico de tráfego histórico.

import React from 'react';
import { createPortal } from 'react-dom';
import { LinkEdgeData } from '../types';
import { formatBitsPerSec, linkUtilization } from '../utils/format';

interface Props {
  edgeId: string;
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
}

export const LinkDetailsModal: React.FC<Props> = ({ data, sourceLabel, targetLabel, onClose }) => {
  const util = linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed);
  const utilPct = (util * 100).toFixed(1);
  const status = data?.status ?? 'unknown';

  const [showDom, setShowDom] = React.useState(false);

  // Verifica se existe alguma métrica DOM ativa para exibir o botão
  const hasDomMetrics = !!(
    data.sourceDomTemp !== undefined ||
    data.sourceDomVolt !== undefined ||
    data.sourceDomBias !== undefined ||
    data.sourceDomTxPower !== undefined ||
    data.sourceDomRxPower !== undefined ||
    data.targetDomTemp !== undefined ||
    data.targetDomVolt !== undefined ||
    data.targetDomBias !== undefined ||
    data.targetDomTxPower !== undefined ||
    data.targetDomRxPower !== undefined
  );

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxWidth: '92vw',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 8,
          color: '#e2e8f0',
          fontFamily: 'inherit',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Detalhes do link</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {sourceLabel} {data.sourceInterface ? `(${data.sourceInterface})` : ''} <span style={{ color: '#475569' }}>↔</span> {targetLabel} {data.targetInterface ? `(${data.targetInterface})` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: 16, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* Status badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <StatusBadge status={status} />
              <UtilBadge pct={utilPct} util={util} />
            </div>
            {hasDomMetrics && (
              <button
                onClick={() => setShowDom(!showDom)}
                style={{
                  background: showDom ? '#8970fa' : 'transparent',
                  color: '#fff',
                  border: '1px solid #8970fa',
                  borderRadius: 4,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {showDom ? '📋 Ocultar Diagnóstico Fibra' : '🧬 Detalhes Diagnóstico DOM Fibra'}
              </button>
            )}
          </div>

          {!showDom ? (
            <>
              {/* Grid de informações */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <Field label="Interface origem" value={data.sourceInterface ?? '—'} mono />
                <Field label="Interface destino" value={data.targetInterface ?? '—'} mono />
                <Field label="Upload" value={formatBitsPerSec(data.trafficUp)} color="#22c55e" />
                <Field label="Download" value={formatBitsPerSec(data.trafficDown)} color="#22d3ee" />
                <Field label="Capacidade" value={formatBitsPerSec(data.linkSpeed)} color="#94a3b8" />
                <Field label="Utilização" value={`${utilPct}%`} />
              </div>

              {/* Placeholder pro gráfico histórico */}
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  border: '1px dashed #334155',
                  borderRadius: 6,
                  background: 'rgba(30, 41, 59, 0.4)',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: 12,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>📈</div>
                <div>Gráfico de tráfego histórico</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#475569' }}>
                  (será conectado ao Zabbix na próxima etapa)
                </div>
              </div>
            </>
          ) : (
            /* Diagnóstico de Fibra Óptica (DOM) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#8970fa', marginBottom: 2 }}>
                Tabela de Métricas Ópticas (DOM - Digital Optical Monitoring)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e2e8f0' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '2px solid #334155' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Métrica / Parâmetro</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Origem ({data.sourceInterface ?? 'Lado A'})</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Destino ({data.targetInterface ?? 'Lado B'})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Temperatura</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.sourceDomTemp !== undefined ? `${data.sourceDomTemp.toFixed(1)} °C` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.targetDomTemp !== undefined ? `${data.targetDomTemp.toFixed(1)} °C` : '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Voltagem (Tensão)</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.sourceDomVolt !== undefined ? `${data.sourceDomVolt.toFixed(2)} V` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.targetDomVolt !== undefined ? `${data.targetDomVolt.toFixed(2)} V` : '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Corrente Bias (Laser)</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.sourceDomBias !== undefined ? `${data.sourceDomBias.toFixed(2)} mA` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {data.targetDomBias !== undefined ? `${data.targetDomBias.toFixed(2)} mA` : '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(34, 197, 94, 0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#4ade80' }}>Potência de Transmissão (Tx)</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#4ade80' }}>
                      {data.sourceDomTxPower !== undefined ? `${data.sourceDomTxPower.toFixed(2)} dBm` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#4ade80' }}>
                      {data.targetDomTxPower !== undefined ? `${data.targetDomTxPower.toFixed(2)} dBm` : '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(59, 130, 246, 0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 600, color: '#60a5fa' }}>Potência de Recepção (Rx)</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#60a5fa' }}>
                      {data.sourceDomRxPower !== undefined ? `${data.sourceDomRxPower.toFixed(2)} dBm` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: '#60a5fa' }}>
                      {data.targetDomRxPower !== undefined ? `${data.targetDomRxPower.toFixed(2)} dBm` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                onClick={() => setShowDom(false)}
                style={{
                  marginTop: 10,
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '6px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ⬅️ Voltar para Informações Gerais do Link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const Field: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({ label, value, mono, color }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div
      style={{
        marginTop: 2,
        fontFamily: mono ? 'monospace' : 'inherit',
        color: color ?? '#e2e8f0',
        fontSize: mono ? 13 : 14,
        fontWeight: 600,
      }}
    >
      {value}
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    up: { bg: '#14532d', fg: '#22c55e', label: 'UP' },
    down: { bg: '#7f1d1d', fg: '#ef4444', label: 'DOWN' },
    warning: { bg: '#78350f', fg: '#f59e0b', label: 'WARNING' },
    unknown: { bg: '#334155', fg: '#94a3b8', label: 'UNKNOWN' },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {s.label}
    </span>
  );
};

const UtilBadge: React.FC<{ pct: string; util: number }> = ({ pct, util }) => {
  const color = util > 0.8 ? '#f59e0b' : util > 0.5 ? '#facc15' : '#22d3ee';
  return (
    <span style={{ background: '#1e293b', color, padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: `1px solid ${color}50` }}>
      {pct}% utilizado
    </span>
  );
};
