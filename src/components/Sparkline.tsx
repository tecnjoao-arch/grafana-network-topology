// components/Sparkline.tsx — Mini-gráfico de área (inbound verde / outbound azul).
// Com axis=true ganha um eixo Y compacto (3 níveis, valores redondos) à esquerda.

import React from 'react';
import { BindingSeries } from '../utils/dataBinding';
import { niceCeil, fmtAxisBps } from '../utils/format';

export const Sparkline: React.FC<{
  inbound?: BindingSeries;
  outbound?: BindingSeries;
  w?: number;
  h?: number;
  axis?: boolean;
}> = ({ inbound, outbound, w = 210, h = 46, axis = false }) => {
  const all = [...(inbound?.values ?? []), ...(outbound?.values ?? [])];
  if (all.length === 0) return null;
  const tAll = [...(inbound?.times ?? []), ...(outbound?.times ?? [])];
  const peak = Math.max(...all) || 1;
  const vMax = axis ? niceCeil(peak * 1.05) : peak * 1.12;
  const tMin = Math.min(...tAll);
  const tMax = Math.max(...tAll);
  const span = Math.max(1, tMax - tMin);
  const PL = axis ? 46 : 0;
  const PT = axis ? 4 : 0;
  const PB = axis ? 2 : 0;
  const PR = axis ? 4 : 0;
  const px = (t: number) => PL + ((t - tMin) / span) * (w - PL - PR);
  const py = (v: number) => (h - PB) - (v / vMax) * (h - PT - PB);
  const line = (s?: BindingSeries) =>
    s && s.values.length
      ? s.values.map((v, i) => `${i ? 'L' : 'M'} ${px(s.times[i]).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')
      : '';
  const area = (s?: BindingSeries) =>
    s && s.values.length
      ? `${line(s)} L ${px(s.times[s.times.length - 1]).toFixed(1)} ${h - PB} L ${px(s.times[0]).toFixed(1)} ${h - PB} Z`
      : '';

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {axis && [0, 0.5, 1].map((f) => {
        const yv = vMax * f;
        const y = py(yv);
        return (
          <g key={f}>
            <line x1={PL} x2={w - PR} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" vectorEffect="non-scaling-stroke" />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={8.5} fill="#64748b" fontFamily="monospace">{fmtAxisBps(yv)}</text>
          </g>
        );
      })}
      {/* Mesma leitura do modal: só o inbound preenchido, outbound só linha. */}
      {inbound && <path d={area(inbound)} fill="rgba(34,197,94,0.18)" />}
      {inbound && <path d={line(inbound)} fill="none" stroke="#22c55e" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />}
      {outbound && <path d={line(outbound)} fill="none" stroke="#3b82f6" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};
