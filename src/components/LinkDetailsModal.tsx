// components/LinkDetailsModal.tsx — Modal exibido ao clicar numa aresta ou num card.
// • Clique na LINHA → visão geral do link (os dois lados).
// • Clique num CARD de interface → foco naquela interface específica (focusSide).
// Convenção de cores: Inbound = verde, Outbound = azul.

import React from 'react';
import { createPortal } from 'react-dom';
import { DataFrame } from '@grafana/data';
import { LinkEdgeData, MetricBinding, ModuleInfo, OpticKey } from '../types';
import { formatBitsPerSec, linkUtilization, niceCeil, niceStep, fmtAxisBps, splitIps } from '../utils/format';
import { resolveBindingSeries, BindingSeries } from '../utils/dataBinding';
import { evalOptical, rxThresholds, txThresholds, formatRange, OpticalLevel } from '../utils/optics';

interface Props {
  edgeId: string;
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  /** Séries das queries do painel — usadas pro gráfico histórico */
  series?: DataFrame[];
  /** Foco numa interface específica (clique num card). Ausente = visão geral. */
  focusSide?: 'source' | 'target';
  onClose: () => void;
}

const IN_COLOR = '#22c55e';   // Inbound (verde)
const OUT_COLOR = '#3b82f6';  // Outbound (azul)

/** Dados consolidados de um lado (interface) do link. */
interface SideInfo {
  label: string;
  iface?: string;
  ip?: string;
  inbound?: number;
  outbound?: number;
  errors?: number;
  domTemp?: number;
  domVolt?: number;
  domBias?: number;
  domTx?: number;
  domRx?: number;
  optics?: Partial<Record<OpticKey, number>>;
  module?: ModuleInfo;
  inboundBinding?: MetricBinding;
  outboundBinding?: MetricBinding;
}

function getSide(data: LinkEdgeData, which: 'source' | 'target', label: string): SideInfo {
  if (which === 'source') {
    return {
      label,
      iface: data.sourceInterface,
      ip: data.sourceIp,
      inbound: data.sourceTrafficUp ?? data.trafficUp,
      outbound: data.sourceTrafficDown ?? data.trafficDown,
      errors: data.sourceErrors,
      domTemp: data.sourceDomTemp,
      domVolt: data.sourceDomVolt,
      domBias: data.sourceDomBias,
      domTx: data.sourceDomTxPower,
      domRx: data.sourceDomRxPower,
      optics: data.sourceOpticThresholds,
      module: data.sourceModuleInfo,
      // Fallback espelhado: num link p2p, o inbound de A é o outbound de B.
      // Permite gráfico mesmo quando só um dos lados tem binding configurado.
      inboundBinding: data.sourceTrafficUpBinding ?? data.trafficUpBinding ?? data.targetTrafficDownBinding,
      outboundBinding: data.sourceTrafficDownBinding ?? data.trafficDownBinding ?? data.targetTrafficUpBinding,
    };
  }
  return {
    label,
    iface: data.targetInterface,
    ip: data.targetIp,
    inbound: data.targetTrafficUp ?? data.trafficDown,
    outbound: data.targetTrafficDown ?? data.trafficUp,
    errors: data.targetErrors,
    domTemp: data.targetDomTemp,
    domVolt: data.targetDomVolt,
    domBias: data.targetDomBias,
    domTx: data.targetDomTxPower,
    domRx: data.targetDomRxPower,
    optics: data.targetOpticThresholds,
    module: data.targetModuleInfo,
    inboundBinding: data.targetTrafficUpBinding ?? data.trafficDownBinding ?? data.sourceTrafficDownBinding,
    outboundBinding: data.targetTrafficDownBinding ?? data.trafficUpBinding ?? data.sourceTrafficUpBinding,
  };
}

function hasDom(s: SideInfo): boolean {
  return s.domTemp !== undefined || s.domVolt !== undefined || s.domBias !== undefined
    || s.domTx !== undefined || s.domRx !== undefined;
}

export const LinkDetailsModal: React.FC<Props> = ({ data, sourceLabel, targetLabel, series = [], focusSide, onClose }) => {
  const util = linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed);
  const utilPct = (util * 100).toFixed(1);
  const status = data?.status ?? 'unknown';
  const statusAccent =
    status === 'down' ? '#ef4444' : status === 'warning' ? '#f59e0b' : status === 'up' ? '#22c55e' : '#64748b';

  const src = getSide(data, 'source', sourceLabel);
  const tgt = getSide(data, 'target', targetLabel);
  // O modal SEMPRE mostra uma única interface (nunca os dois lados).
  // Sem lado definido (ex: clique na linha) → origem por padrão.
  const focus = focusSide === 'target' ? tgt : src;

  // Séries históricas da interface em foco.
  const inHist = React.useMemo(
    () => resolveBindingSeries(series, focus.inboundBinding),
    [series, focus.inboundBinding]
  );
  const outHist = React.useMemo(
    () => resolveBindingSeries(series, focus.outboundBinding),
    [series, focus.outboundBinding]
  );

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
          width: 620, maxWidth: '92vw', background: '#0f172a', border: '1px solid #334155',
          borderRadius: 10, color: '#e2e8f0', fontFamily: 'inherit',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)', overflow: 'hidden',
        }}
      >
        {/* Faixa de status no topo */}
        <div style={{ height: 4, background: statusAccent }} />
        {/* Header */}
        <div
          style={{
            padding: '14px 18px', borderBottom: '1px solid #334155',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 0.4 }}>Detalhes da interface</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{focus.label}</span>
              {focus.iface && <span style={{ color: '#22d3ee', fontFamily: 'monospace', fontSize: 14 }}>{focus.iface}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginTop: 3 }}>
              ↔ link com {focus === src ? targetLabel : sourceLabel}
            </div>
          </div>
          <button onClick={onClose} style={btnX}>✕</button>
        </div>

        <div style={{ padding: 18, maxHeight: '80vh', overflowY: 'auto' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <StatusBadge status={status} />
            <UtilBadge pct={utilPct} util={util} />
            {data.linkSpeed !== undefined && (
              <span style={badgeNeutral}>Capacidade {formatBitsPerSec(data.linkSpeed)}</span>
            )}
          </div>

          {/* Sempre uma única interface: métricas + gráfico no padrão Grafana */}
          <FocusedView side={focus} speed={data.linkSpeed} />
          {(inHist || outHist) ? (
            <div style={{ marginTop: 16 }}>
              <TrafficChart inbound={inHist} outbound={outHist} speed={data.linkSpeed} title={focus.iface ? `${focus.label} · ${focus.iface}` : focus.label} />
            </div>
          ) : (
            <div style={emptyChart}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>📈</div>
              <div>Sem histórico para exibir</div>
              <div style={{ fontSize: 11, marginTop: 4, color: '#475569' }}>
                Configure os bindings de tráfego desta interface no modo edição.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Visão focada numa única interface (estilo "detalhamento da interface"). */
const FocusedView: React.FC<{ side: SideInfo; speed?: number }> = ({ side, speed }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Inbound / Outbound / Speed / Erros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Metric label="↓ Inbound" value={formatBitsPerSec(side.inbound)} color={IN_COLOR} big />
        <Metric label="↑ Outbound" value={formatBitsPerSec(side.outbound)} color={OUT_COLOR} big />
        <Metric label="Speed" value={speed !== undefined ? formatBitsPerSec(speed) : '—'} color="#cbd5e1" big />
        <Metric label="Erros / Descartes" value={side.errors !== undefined ? String(side.errors) : '0'} color={side.errors && side.errors > 0 ? '#ef4444' : '#22c55e'} big />
      </div>

      {/* Endereços IP (IPv4 em cima, IPv6 embaixo) */}
      {side.ip && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#0b1220', border: '1px solid #33415580', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Endereços IP</div>
            {splitIps(side.ip).map((addr, i) => (
              <div key={i} style={{ marginTop: 4, color: '#cbd5e1', fontSize: i === 0 ? 15 : 13, fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {addr}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOM Fibra + módulo (se houver) */}
      {(hasDom(side) || side.module) && (
        <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a855f7' }}>🧬 Diagnóstico Óptico (DOM)</span>
            {side.module && (
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                {[side.module.model, side.module.serial && `SN ${side.module.serial}`, side.module.mediaType]
                  .filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {hasDom(side) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <OpticField label="Tx Power" value={side.domTx} level={evalOptical(side.domTx, txThresholds(side.optics))} range={formatRange(txThresholds(side.optics))} identity="#4ade80" />
              <OpticField label="Rx Power" value={side.domRx} level={evalOptical(side.domRx, rxThresholds(side.optics))} range={formatRange(rxThresholds(side.optics))} identity="#60a5fa" />
              <Field label="Temperatura" value={side.domTemp !== undefined ? `${side.domTemp.toFixed(1)} °C` : '—'} mono />
              <Field label="Voltagem" value={side.domVolt !== undefined ? `${side.domVolt.toFixed(2)} V` : '—'} mono />
              <Field label="Bias (laser)" value={side.domBias !== undefined ? `${side.domBias.toFixed(2)} mA` : '—'} mono />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Potência óptica com avaliação pelo limiar real da interface: cor por nível
 *  (alarm vermelho / warn amarelo / normal = cor de identidade) + faixa. */
const OpticField: React.FC<{
  label: string;
  value?: number;
  level?: OpticalLevel;
  range?: string;
  identity: string;
}> = ({ label, value, level, range, identity }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}{level === 'warn' || level === 'alarm' ? ' ⚠' : ''}
    </div>
    <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: level === 'alarm' ? '#ef4444' : level === 'warn' ? '#facc15' : identity }}>
      {value !== undefined ? `${value.toFixed(2)} dBm` : '—'}
    </div>
    {range && <div style={{ fontSize: 9.5, color: '#475569', marginTop: 1 }}>faixa: {range}</div>}
  </div>
);

/** Cartão de métrica reutilizável (estilo do print de referência). bar = 0..100 opcional. */
const Metric: React.FC<{ label: string; value: string; color: string; big?: boolean; mono?: boolean; bar?: number }> = ({ label, value, color, big, mono, bar }) => (
  <div style={{ background: '#0b1220', border: `1px solid ${color}33`, borderRadius: 8, padding: big ? '12px 14px' : '10px 12px' }}>
    <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ marginTop: 4, color, fontSize: big ? 19 : 15, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    {bar !== undefined && (
      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${Math.min(100, Math.max(0, bar))}%`, height: '100%', background: color }} />
      </div>
    )}
  </div>
);

/** Marcador de legenda estilo Grafana (segmento de linha, não bolinha). */
const legendMark = (c: string): React.CSSProperties => ({
  display: 'inline-block', width: 13, height: 3, background: c, borderRadius: 2,
  marginRight: 6, verticalAlign: 'middle',
});

/** Gráfico estilo time series do Grafana: ticks redondos nos dois eixos,
 *  crosshair com tooltip de valores no hover, legenda com "último". */
const TrafficChart: React.FC<{ inbound?: BindingSeries; outbound?: BindingSeries; speed?: number; title: string }> = ({ inbound, outbound, speed, title }) => {
  const [hover, setHover] = React.useState<{
    vx: number; pxLeft: number; flip: boolean; label: string; inV?: number; outV?: number;
  } | null>(null);

  const W = 580, H = 210, PT = 10, PB = 30, PR = 12, PL = 60;
  const all = [...(inbound?.values ?? []), ...(outbound?.values ?? [])];
  if (all.length === 0) return null;
  const tAll = [...(inbound?.times ?? []), ...(outbound?.times ?? [])];
  const peak = Math.max(...all) || 1;
  const vMax = niceCeil(peak * 1.05); // teto redondo → rótulos limpos no eixo
  const tMin = Math.min(...tAll);
  const tMax = Math.max(...tAll);
  const span = Math.max(1, tMax - tMin);
  const px = (t: number) => PL + ((t - tMin) / span) * (W - PL - PR);
  const py = (v: number) => H - PB - (v / vMax) * (H - PT - PB);
  const line = (s?: BindingSeries) =>
    s && s.values.length
      ? s.values.map((v, i) => `${i ? 'L' : 'M'} ${px(s.times[i]).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')
      : '';
  const area = (s?: BindingSeries) =>
    s && s.values.length
      ? `${line(s)} L ${px(s.times[s.times.length - 1]).toFixed(1)} ${H - PB} L ${px(s.times[0]).toFixed(1)} ${H - PB} Z`
      : '';
  const fmtT = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Eixo Y: valores em passos redondos (250 Mb/s, 500 Mb/s...) — estilo Grafana
  const yStep = niceStep(vMax / 5);
  const yVals: number[] = [];
  for (let i = 0; i * yStep <= vMax * 1.001; i++) yVals.push(i * yStep);

  // Eixo X: horários redondos (múltiplos de 1/2/5/15/30 min...)
  const MIN = 60000;
  const ladder = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MIN);
  const xStep = ladder.find((s) => s >= span / 6) ?? ladder[ladder.length - 1];
  const xVals: number[] = [];
  for (let t = Math.ceil(tMin / xStep) * xStep; t <= tMax; t += xStep) xVals.push(t);

  const speedFits = speed !== undefined && speed <= vMax;
  const last = (s?: BindingSeries) => (s && s.values.length ? s.values[s.values.length - 1] : undefined);
  const nearest = (s: BindingSeries | undefined, t: number): number | undefined => {
    if (!s || !s.times.length) return undefined;
    let best = 0, bd = Infinity;
    for (let i = 0; i < s.times.length; i++) {
      const d = Math.abs(s.times[i] - t);
      if (d < bd) { bd = d; best = i; }
    }
    return s.values[best];
  };

  // Crosshair: converte a posição do mouse (px renderizados) pra coordenada do viewBox
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relPx = e.clientX - rect.left;
    const vx = (relPx / rect.width) * W;
    if (vx < PL || vx > W - PR) { setHover(null); return; }
    const t = tMin + ((vx - PL) / (W - PL - PR)) * span;
    setHover({
      vx,
      pxLeft: relPx,
      flip: relPx > rect.width * 0.58,
      label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      inV: nearest(inbound, t),
      outV: nearest(outbound, t),
    });
  };

  return (
    <div style={{ border: '1px solid #1e293b', borderRadius: 8, background: 'rgba(15,23,42,0.6)', padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>{title}</div>
      <div style={{ position: 'relative' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grade horizontal + rótulos Y */}
          {yVals.map((yv) => (
            <g key={`y${yv}`}>
              <line x1={PL} x2={W - PR} y1={py(yv)} y2={py(yv)} stroke="rgba(255,255,255,0.06)" />
              <text x={PL - 6} y={py(yv) + 3} textAnchor="end" fontSize={9.5} fill="#94a3b8" fontFamily="monospace">{fmtAxisBps(yv)}</text>
            </g>
          ))}
          {/* Grade vertical + rótulos X (horários redondos) */}
          {xVals.map((t) => (
            <g key={`x${t}`}>
              <line x1={px(t)} x2={px(t)} y1={PT} y2={H - PB} stroke="rgba(255,255,255,0.04)" />
              <text x={px(t)} y={H - PB + 13} textAnchor="middle" fontSize={9.5} fill="#94a3b8" fontFamily="monospace">{fmtT(t)}</text>
            </g>
          ))}
          {/* Áreas + linhas (verde inbound ao fundo, azul outbound por cima) */}
          {/* Só o inbound recebe preenchimento: com as duas áreas pintadas as
              curvas se embolavam. Sem fill, a linha do outbound corre POR CIMA
              da área verde e as duas leituras ficam separáveis num relance. */}
          {inbound && <path d={area(inbound)} fill="rgba(34,197,94,0.25)" />}
          {inbound && <path d={line(inbound)} fill="none" stroke={IN_COLOR} strokeWidth={3} />}
          {outbound && <path d={line(outbound)} fill="none" stroke={OUT_COLOR} strokeWidth={3} />}
          {speedFits && (
            <line x1={PL} x2={W - PR} y1={py(speed!)} y2={py(speed!)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 5" />
          )}
          {/* Eixo base */}
          <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="rgba(255,255,255,0.15)" />
          {/* Crosshair */}
          {hover && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={hover.vx} x2={hover.vx} y1={PT} y2={H - PB} stroke="#94a3b8" strokeWidth={0.8} />
              {hover.inV !== undefined && <circle cx={hover.vx} cy={py(hover.inV)} r={3.2} fill={IN_COLOR} stroke="#0b1220" strokeWidth={1} />}
              {hover.outV !== undefined && <circle cx={hover.vx} cy={py(hover.outV)} r={3.2} fill={OUT_COLOR} stroke="#0b1220" strokeWidth={1} />}
            </g>
          )}
        </svg>
        {/* Tooltip do crosshair (estilo Grafana) */}
        {hover && (
          <div
            style={{
              position: 'absolute', top: 6, left: hover.pxLeft,
              transform: hover.flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
              background: '#1b2537', border: '1px solid #334155', borderRadius: 6,
              padding: '7px 10px', pointerEvents: 'none', minWidth: 158, zIndex: 5,
              boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600, marginBottom: 5 }}>{hover.label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}><span style={legendMark(IN_COLOR)} />Inbound</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(hover.inV)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 11, marginTop: 3 }}>
              <span style={{ color: '#94a3b8' }}><span style={legendMark(OUT_COLOR)} />Outbound</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(hover.outV)}</span>
            </div>
          </div>
        )}
      </div>
      {/* Legenda com último valor */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: '#94a3b8', marginTop: 8, paddingLeft: 4 }}>
        <span><span style={legendMark(IN_COLOR)} />Inbound <span style={{ color: '#64748b' }}>último:</span> <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(last(inbound))}</span></span>
        <span><span style={legendMark(OUT_COLOR)} />Outbound <span style={{ color: '#64748b' }}>último:</span> <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(last(outbound))}</span></span>
        {speed !== undefined && <span><span style={{ color: '#94a3b8' }}>– –</span> Speed <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(speed)}</span></span>}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({ label, value, mono, color }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ marginTop: 2, fontFamily: mono ? 'monospace' : 'inherit', color: color ?? '#e2e8f0', fontSize: mono ? 13 : 14, fontWeight: 600 }}>
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
    <span style={{ background: s.bg, color: s.fg, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {s.label}
    </span>
  );
};

const UtilBadge: React.FC<{ pct: string; util: number }> = ({ pct, util }) => {
  const color = util > 0.8 ? '#f59e0b' : util > 0.5 ? '#facc15' : '#22d3ee';
  return (
    <span style={{ background: '#1e293b', color, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: `1px solid ${color}50` }}>
      {pct}% utilizado
    </span>
  );
};

const badgeNeutral: React.CSSProperties = {
  background: '#1e293b', color: '#94a3b8', padding: '4px 12px', borderRadius: 5,
  fontSize: 11, fontWeight: 600, border: '1px solid #334155',
};
const btnX: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
};
const emptyChart: React.CSSProperties = {
  marginTop: 16, padding: 14, border: '1px dashed #334155', borderRadius: 6,
  background: 'rgba(30, 41, 59, 0.4)', textAlign: 'center', color: '#64748b', fontSize: 12,
};
