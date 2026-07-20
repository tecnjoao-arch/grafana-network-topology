// components/NetworkTestModal.tsx — Modal dedicado de testes de rede (Globalping).
// Ping / traceroute / MTR / DNS executados por probes EXTERNAS em direção a um
// alvo público — a visão "de fora" da rede, pro analista do NOC. Abre pelo
// clique num equipamento (IP pré-preenchido) ou pela sidebar (alvo livre).

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createMeasurement, getMeasurement, GpMeasurement, GpRateInfo, GpResultItem, GpType } from '../utils/globalping';

interface Props {
  initialTarget?: string;
  token?: string;
  onClose: () => void;
}

const TYPES: Array<{ v: GpType; label: string }> = [
  { v: 'ping', label: 'Ping' },
  { v: 'traceroute', label: 'Traceroute' },
  { v: 'mtr', label: 'MTR' },
  { v: 'dns', label: 'DNS' },
];

const ORIGINS: Array<{ label: string; magic: string }> = [
  { label: 'Brasil', magic: 'brazil' },
  { label: 'São Paulo', magic: 'sao paulo' },
  { label: 'Rio', magic: 'rio de janeiro' },
  { label: 'EUA', magic: 'US' },
  { label: 'Europa', magic: 'europe' },
  { label: 'Mundo', magic: 'world' },
];

export const NetworkTestModal: React.FC<Props> = ({ initialTarget = '', token, onClose }) => {
  const [type, setType] = useState<GpType>('ping');
  const [target, setTarget] = useState(initialTarget);
  const [magic, setMagic] = useState('brazil');
  const [limit, setLimit] = useState(3);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meas, setMeas] = useState<GpMeasurement | null>(null);
  const [rate, setRate] = useState<GpRateInfo | null>(null);

  // Evita setState depois do unmount (o polling continua rodando em background)
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const run = async () => {
    if (!target.trim() || running) return;
    setRunning(true);
    setError(null);
    setMeas(null);
    try {
      const created = await createMeasurement({ type, target, magic, limit, token });
      if (!alive.current) return;
      setRate(created.rate);
      const t0 = Date.now();
      // Polling com resultados parciais até terminar (timeout 60s)
      while (alive.current && Date.now() - t0 < 60000) {
        const m = await getMeasurement(created.id, token);
        if (!alive.current) return;
        setMeas(m);
        if (m.status === 'finished') break;
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 660, maxWidth: '94vw', background: '#0f172a', border: '1px solid #334155',
          borderRadius: 10, color: '#e2e8f0', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '13px 18px', borderBottom: '1px solid #334155',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>🌐 Testes de rede</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              probes externas via Globalping — visão de fora da sua rede
            </div>
          </div>
          <button onClick={onClose} style={btnX}>✕</button>
        </div>

        <div style={{ padding: 16, maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Tipo de teste */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {TYPES.map((t) => (
              <button
                key={t.v}
                onClick={() => setType(t.v)}
                style={{
                  ...chip,
                  background: type === t.v ? '#3b82f6' : '#1e293b',
                  color: type === t.v ? '#fff' : '#cbd5e1',
                  borderColor: type === t.v ? '#3b82f6' : '#334155',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Alvo + executar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              placeholder="IP ou hostname público (ex: 8.8.8.8)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
              style={{ ...inputText, flex: 1 }}
              autoFocus={!initialTarget}
            />
            <button
              onClick={run}
              disabled={running || !target.trim()}
              style={{
                background: running ? '#1e293b' : '#22c55e',
                color: running ? '#64748b' : '#052e16',
                border: 'none', borderRadius: 6, padding: '8px 18px',
                fontWeight: 700, fontSize: 13, cursor: running ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {running ? '⏳ Executando…' : '▶ Executar'}
            </button>
          </div>

          {/* Origem das probes + quantidade */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Origem:</span>
            {ORIGINS.map((o) => (
              <button
                key={o.magic}
                onClick={() => setMagic(o.magic)}
                style={{
                  ...chip,
                  padding: '3px 10px',
                  background: magic === o.magic ? '#0e7490' : '#1e293b',
                  color: magic === o.magic ? '#fff' : '#cbd5e1',
                  borderColor: magic === o.magic ? '#0e7490' : '#334155',
                }}
              >
                {o.label}
              </button>
            ))}
            <input
              type="text"
              value={magic}
              onChange={(e) => setMagic(e.target.value)}
              placeholder="ou digite: cidade, país, AS…"
              style={{ ...inputText, width: 150, padding: '4px 8px', fontSize: 11 }}
              title="Origem livre: cidade, país, continente ou ASN (ex: AS1916)"
            />
            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>Probes:</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ ...inputText, width: 52, padding: '4px 6px', cursor: 'pointer' }}
            >
              {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid #7f1d1d', borderRadius: 6,
              padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 12,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Resultados */}
          {meas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {meas.status === 'finished' ? '✅ Concluído' : '⏳ Executando'} — {meas.type} → <span style={{ color: '#22d3ee', fontFamily: 'monospace' }}>{meas.target}</span> ({meas.probesCount} probe{meas.probesCount > 1 ? 's' : ''})
              </div>
              {meas.results.map((r, i) => <ProbeResult key={i} item={r} />)}
            </div>
          )}

          {/* Rodapé: cota */}
          {rate?.remaining !== undefined && (
            <div style={{ fontSize: 10, color: '#475569', marginTop: 12, textAlign: 'right' }}>
              cota: restam {rate.remaining}/{rate.limit ?? 250} testes nesta hora (por IP)
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Resultado de uma probe: origem + saída bruta estilo terminal. */
const ProbeResult: React.FC<{ item: GpResultItem }> = ({ item }) => {
  const p = item.probe;
  const r = item.result;
  const where = [p.city, p.country].filter(Boolean).join(', ');
  const net = p.network ? `${p.network}${p.asn ? ` (AS${p.asn})` : ''}` : '';
  const statusColor =
    r.status === 'finished' ? '#22c55e' :
    r.status === 'failed' ? '#ef4444' :
    r.status === 'offline' ? '#64748b' : '#f59e0b';

  return (
    <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid #1e293b',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          📍 {where || 'probe'} <span style={{ color: '#64748b', fontWeight: 400, fontSize: 11 }}>· {net}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {r.stats?.avg !== undefined && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#22d3ee' }}>
              avg {r.stats.avg.toFixed(1)} ms
            </span>
          )}
          {r.stats?.loss !== undefined && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: r.stats.loss > 0 ? '#ef4444' : '#22c55e' }}>
              perda {r.stats.loss}%
            </span>
          )}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
        </span>
      </div>
      <pre style={{
        margin: 0, padding: '8px 10px', fontSize: 11, lineHeight: 1.45, color: '#cbd5e1',
        fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: 240, overflowY: 'auto',
      }}>
        {r.rawOutput?.trim() || (r.status === 'offline' ? 'probe offline' : 'aguardando saída…')}
      </pre>
    </div>
  );
};

const chip: React.CSSProperties = {
  padding: '5px 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
  border: '1px solid #334155', fontWeight: 600,
};
const inputText: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
  color: '#e2e8f0', padding: '7px 10px', fontSize: 13, fontFamily: 'monospace',
};
const btnX: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
};
