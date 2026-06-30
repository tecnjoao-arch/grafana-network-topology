// components/Sparkline.tsx — Mini-gráfico de área (inbound verde / outbound azul).
// Compacto, sem eixos — para o tooltip de hover. Reaproveita BindingSeries.

import React from 'react';
import { BindingSeries } from '../utils/dataBinding';

export const Sparkline: React.FC<{
  inbound?: BindingSeries;
  outbound?: BindingSeries;
  w?: number;
  h?: number;
}> = ({ inbound, outbound, w = 210, h = 46 }) => {
  const all = [...(inbound?.values ?? []), ...(outbound?.values ?? [])];
  if (all.length === 0) return null;
  const vMax = (Math.max(...all) || 1) * 1.12;
  const tAll = [...(inbound?.times ?? []), ...(outbound?.times ?? [])];
  const tMin = Math.min(...tAll);
  const tMax = Math.max(...tAll);
  const span = Math.max(1, tMax - tMin);
  const px = (t: number) => ((t - tMin) / span) * w;
  const py = (v: number) => h - (v / vMax) * (h - 2);
  const line = (s?: BindingSeries) =>
    s && s.values.length
      ? s.values.map((v, i) => `${i ? 'L' : 'M'} ${px(s.times[i]).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')
      : '';
  const area = (s?: BindingSeries) =>
    s && s.values.length
      ? `${line(s)} L ${px(s.times[s.times.length - 1]).toFixed(1)} ${h} L ${px(s.times[0]).toFixed(1)} ${h} Z`
      : '';

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {outbound && <path d={area(outbound)} fill="rgba(59,130,246,0.16)" />}
      {inbound && <path d={area(inbound)} fill="rgba(34,197,94,0.16)" />}
      {outbound && <path d={line(outbound)} fill="none" stroke="#3b82f6" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />}
      {inbound && <path d={line(inbound)} fill="none" stroke="#22c55e" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};
