// icons/index.tsx — Registry de ícones SVG recoloríveis (usam currentColor).
// Estilo fiel a diagrama de rede (Cisco-like). Fáceis de estender.

import React from 'react';
import { DeviceType } from '../types';

/** Cada ícone é o conteúdo interno de um <svg viewBox="0 0 64 64">.
 *  Usa stroke="currentColor" pra herdar a cor do wrapper. */
const PATHS: Record<string, string> = {
  // Router clássico: disco com 4 setas (2 entrando, 2 saindo) — símbolo de roteamento
  router: `
    <ellipse cx="32" cy="38" rx="26" ry="14" fill="#0b1220" stroke="currentColor" stroke-width="3"/>
    <ellipse cx="32" cy="30" rx="26" ry="14" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M32 30 L46 18"/><path d="M46 24 L46 18 L40 18"/>
      <path d="M32 30 L18 18"/><path d="M18 24 L18 18 L24 18"/>
      <path d="M22 34 L14 34"/><path d="M18 30 L14 34 L18 38"/>
      <path d="M42 34 L50 34"/><path d="M46 30 L50 34 L46 38"/>
    </g>`,
  router_modern: `
    <circle cx="32" cy="32" r="28" fill="#0f172a" stroke="currentColor" stroke-width="2" />
    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M32 16 L32 48 M32 16 L24 24 M32 16 L40 24" />
      <path d="M16 32 L48 32 M48 32 L40 24 M48 32 L40 40" />
    </g>`,
  router_3d: `
    <ellipse cx="32" cy="42" rx="28" ry="12" fill="#1e293b" />
    <path d="M4 28 L4 42 A28 12 0 0 0 60 42 L60 28 Z" fill="#334155" />
    <ellipse cx="32" cy="28" rx="28" ry="12" fill="#475569" />
    <g stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
       <path d="M32 28 L14 28 L20 22 M14 28 L20 34"/>
       <path d="M32 28 L50 28 L44 22 M50 28 L44 34"/>
       <path d="M32 10 L32 24 L26 18 M32 24 L38 18"/>
       <path d="M32 46 L32 32 L26 38 M32 32 L38 38"/>
    </g>`,
  router_cloud: `
    <polygon points="32,4 58,19 58,45 32,60 6,45 6,19" fill="#0f172a" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
    <circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="3" />
    <path d="M32 32 L44 26 M32 32 L20 38" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <path d="M32 32 L20 26 M32 32 L44 38" stroke="currentColor" stroke-width="3" stroke-linecap="round" />`,
  // Switch: caixa com setas bidirecionais cruzadas
  switch: `
    <rect x="5" y="20" width="54" height="24" rx="4" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M14 28 L30 28 M24 24 L30 28 L24 32"/>
      <path d="M50 28 L34 28 M40 24 L34 28 L40 32"/>
      <path d="M14 36 L30 36 M20 32 L14 36 L20 40"/>
      <path d="M50 36 L34 36 M44 32 L50 36 L44 40"/>
    </g>`,
  // Switch L3 / multilayer
  l3switch: `
    <rect x="5" y="18" width="54" height="28" rx="4" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <text x="32" y="30" font-size="11" fill="currentColor" text-anchor="middle" font-family="monospace" font-weight="bold">L3</text>
    <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none">
      <path d="M14 38 L30 38 M24 34 L30 38 L24 42"/>
      <path d="M50 38 L34 38 M40 34 L34 38 L40 42"/>
    </g>`,
  firewall: `
    <path d="M10 14 L32 6 L54 14 L54 34 C54 46 44 54 32 58 C20 54 10 46 10 34 Z" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
      <path d="M16 22 L48 22"/><path d="M16 30 L48 30"/><path d="M16 38 L48 38"/>
      <path d="M24 22 L24 30 M40 22 L40 30"/><path d="M20 30 L20 38 M32 30 L32 38 M44 30 L44 38"/>
    </g>`,
  server: `
    <rect x="14" y="8" width="36" height="48" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2" fill="none">
      <line x1="14" y1="22" x2="50" y2="22"/><line x1="14" y1="36" x2="50" y2="36"/><line x1="14" y1="50" x2="50" y2="50"/>
    </g>
    <circle cx="20" cy="15" r="1.6" fill="#22c55e"/><circle cx="20" cy="29" r="1.6" fill="#22c55e"/><circle cx="20" cy="43" r="1.6" fill="currentColor"/>
    <rect x="28" y="13" width="18" height="3" fill="currentColor" opacity="0.4"/><rect x="28" y="27" width="18" height="3" fill="currentColor" opacity="0.4"/><rect x="28" y="41" width="18" height="3" fill="currentColor" opacity="0.4"/>`,
  // OLT (Optical Line Terminal)
  olt: `
    <rect x="6" y="20" width="52" height="24" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <text x="32" y="29" font-size="9" fill="currentColor" text-anchor="middle" font-family="monospace" font-weight="bold">OLT</text>
    <g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
      <path d="M12 38 L20 38 M26 38 L34 38 M40 38 L48 38"/>
    </g>`,
  cgnat: `
    <rect x="6" y="18" width="52" height="28" rx="4" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <text x="32" y="36" font-size="10" fill="currentColor" text-anchor="middle" font-family="monospace" font-weight="bold">CGNAT</text>`,
  loadbalancer: `
    <circle cx="32" cy="32" r="24" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none">
      <path d="M20 32 L32 32 M32 32 L44 22 M32 32 L44 32 M32 32 L44 42"/>
      <circle cx="20" cy="32" r="3" fill="currentColor"/><circle cx="44" cy="22" r="3" fill="currentColor"/><circle cx="44" cy="32" r="3" fill="currentColor"/><circle cx="44" cy="42" r="3" fill="currentColor"/>
    </g>`,
  wifi: `
    <circle cx="32" cy="50" r="5" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round">
      <path d="M22 42 Q32 32 42 42"/><path d="M16 36 Q32 18 48 36"/><path d="M10 30 Q32 4 54 30"/>
    </g>`,
  antenna: `
    <line x1="32" y1="14" x2="32" y2="52" stroke="currentColor" stroke-width="3"/>
    <circle cx="32" cy="12" r="4" fill="currentColor"/>
    <path d="M22 24 Q32 14 42 24" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M16 30 Q32 12 48 30" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M24 52 L40 52" stroke="currentColor" stroke-width="3"/>`,
  cloud: `
    <path d="M18 46 C8 46 6 36 14 32 C12 20 28 16 34 24 C40 18 56 24 52 34 C60 38 58 46 48 46 Z" fill="#0f172a" stroke="currentColor" stroke-width="3"/>`,
  internet: `
    <circle cx="32" cy="32" r="26" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <ellipse cx="32" cy="32" rx="26" ry="12" stroke="currentColor" stroke-width="2" fill="none"/>
    <ellipse cx="32" cy="32" rx="12" ry="26" stroke="currentColor" stroke-width="2" fill="none"/>
    <path d="M6 32 L58 32 M32 6 L32 58" stroke="currentColor" stroke-width="1.5"/>`,
  database: `
    <ellipse cx="32" cy="12" rx="20" ry="6" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M12 12 L12 52 C12 56 21 60 32 60 C43 60 52 56 52 52 L52 12" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M12 26 C12 30 21 33 32 33 C43 33 52 30 52 26" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M12 40 C12 44 21 47 32 47 C43 47 52 44 52 40" stroke="currentColor" stroke-width="2.5" fill="none"/>`,
  storage: `
    <rect x="10" y="14" width="44" height="36" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2" fill="none"><line x1="10" y1="26" x2="54" y2="26"/><line x1="10" y1="38" x2="54" y2="38"/></g>
    <circle cx="46" cy="20" r="2" fill="currentColor"/><circle cx="46" cy="32" r="2" fill="currentColor"/><circle cx="46" cy="44" r="2" fill="currentColor"/>`,
  desktop: `
    <rect x="10" y="12" width="44" height="30" rx="2" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M24 50 L40 50 M28 42 L28 50 M36 42 L36 50" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  laptop: `
    <rect x="14" y="14" width="36" height="24" rx="2" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M8 46 L56 46 L52 38 L12 38 Z" fill="#0f172a" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`,
  phone: `
    <rect x="20" y="8" width="24" height="48" rx="4" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <line x1="20" y1="16" x2="44" y2="16" stroke="currentColor" stroke-width="2"/>
    <line x1="20" y1="46" x2="44" y2="46" stroke="currentColor" stroke-width="2"/>
    <circle cx="32" cy="51" r="2" fill="currentColor"/>`,
  camera: `
    <rect x="8" y="20" width="40" height="26" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M48 28 L58 22 L58 44 L48 38 Z" fill="#0f172a" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="24" cy="33" r="7" stroke="currentColor" stroke-width="2.5" fill="none"/>`,
  rack: `
    <rect x="16" y="6" width="32" height="52" rx="2" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <g stroke="currentColor" stroke-width="2" fill="none">
      <rect x="20" y="11" width="24" height="8"/><rect x="20" y="23" width="24" height="8"/><rect x="20" y="35" width="24" height="8"/><rect x="20" y="47" width="24" height="6"/>
    </g>`,
  datacenter: `
    <path d="M8 56 L8 24 L32 10 L56 24 L56 56 Z" fill="#0f172a" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <g stroke="currentColor" stroke-width="2" fill="none"><rect x="18" y="32" width="10" height="20"/><rect x="36" y="32" width="10" height="20"/></g>`,
  ups: `
    <rect x="16" y="8" width="32" height="48" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <path d="M34 18 L26 36 L33 36 L30 50 L40 30 L33 30 Z" fill="currentColor"/>`,
  vm: `
    <rect x="8" y="12" width="48" height="34" rx="3" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <circle cx="32" cy="29" r="9" stroke="currentColor" stroke-width="2.5" fill="none"/>
    <path d="M32 24 L32 29 L36 32" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M24 52 L40 52" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  generic: `
    <rect x="12" y="12" width="40" height="40" rx="6" fill="#0f172a" stroke="currentColor" stroke-width="3"/>
    <circle cx="32" cy="32" r="6" fill="currentColor"/>`,
};

export const ICON_KEYS = Object.keys(PATHS);

interface IconProps {
  size?: number;
  status?: string;
  color?: string;
  customIcon?: string;
}

function statusColor(status?: string): string {
  return (
    status === 'down' ? '#ef4444' :
    status === 'warning' ? '#f59e0b' :
    status === 'up' ? '#22c55e' :
    '#22d3ee'
  );
}

export function getDeviceIcon(type: DeviceType, opts: IconProps = {}): React.ReactElement {
  const size = opts.size ?? 56;

  if (type === 'custom') {
    if (opts.customIcon) {
      return <img src={opts.customIcon} alt="custom" width={size} height={size} style={{ objectFit: 'contain' }} />;
    }
    type = 'generic' as DeviceType;
  }

  // Cor: override fixo (opts.color) tem prioridade sobre cor por status
  const color = opts.color ?? statusColor(opts.status);
  const inner = PATHS[type] ?? PATHS.generic;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ color, display: 'block' }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
