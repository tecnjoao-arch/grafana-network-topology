// icons/index.tsx — Ícones de equipamentos no padrão visual da indústria.
//
// Seguem a convenção que todo diagrama de rede usa (disco com 4 setas =
// roteador, caixa com setas = switch, muro de tijolos = firewall…), mas são
// desenhados aqui: a Cisco permite usar os ícones oficiais sem alterá-los, e
// este plugin precisa recolorir por status e é distribuído como Apache 2.0.
//
// Cada ícone é o conteúdo de um <svg viewBox="0 0 64 64"> gerado a partir de
// uma paleta (topo, lateral, sombra, contorno, símbolos). O mesmo desenho
// serve para o azul de operação normal e para as cores de problema.

import React from 'react';
import { DeviceType, IconColorMode, LinkStatus } from '../types';

// ── Cor ──────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(hex: string, target: RGB, amt: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const c = (a: number, t: number) => Math.max(0, Math.min(255, Math.round(a + (t - a) * amt)));
  return '#' + rgb.map((v, i) => c(v, target[i]).toString(16).padStart(2, '0')).join('');
}

interface Palette {
  top: string;   // face de cima (a mais iluminada)
  side: string;  // face da frente / lateral do cilindro
  sideD: string; // lado escuro do cilindro
  sideL: string; // lado claro do cilindro
  dark: string;  // face lateral das caixas, fendas e telas
  line: string;  // contorno
  hi: string;    // destaques (ondas de rádio, LEDs)
  arw: string;   // setas e símbolos desenhados sobre o ícone
}

function palette(base: string): Palette {
  const side = mix(base, BLACK, 0.28);
  return {
    top: mix(base, BLACK, 0.06),
    side,
    sideD: mix(side, BLACK, 0.16),
    sideL: mix(side, WHITE, 0.14),
    dark: mix(base, BLACK, 0.48),
    line: mix(base, BLACK, 0.66),
    hi: mix(base, WHITE, 0.22),
    // Azul-claro em vez de branco puro: o símbolo parece pintado no ícone
    arw: mix(base, WHITE, 0.84),
  };
}

/** Bases de cor dos ícones. As de problema são tons mais escuros que as cores
 *  de status da moldura: no âmbar claro, a seta clara quase sumia. */
const BASE = {
  normal: '#2E89C6', // azul da convenção de diagramas de rede
  up: '#16A34A',
  warning: '#D97706',
  down: '#DC2626',
  unknown: '#64748B',
};

/** Cor base do ícone para um status, conforme o modo escolhido no painel.
 *  Uma cor fixa definida no nó substitui só a cor calma: problema continua
 *  inconfundível em qualquer modo (exceto no A, onde o status fica na moldura). */
function iconBase(status: LinkStatus | undefined, mode: IconColorMode, fixed?: string): string {
  const calm = fixed && parseHex(fixed) ? fixed : undefined;
  if (mode === 'a') return calm ?? BASE.normal;
  if (status === 'down') return BASE.down;
  if (status === 'warning') return BASE.warning;
  if (status === 'unknown') return BASE.unknown;
  if (status === 'up' && mode === 'b') return calm ?? BASE.up;
  // Operação normal no modo C, ou elemento estático sem status (nuvem, PTT…)
  return calm ?? BASE.normal;
}

// ── Geometria ────────────────────────────────────────────────────────────────

type Mapper = (a: number, b: number) => [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const ID: Mapper = (a, b) => [a, b];

const pts = (M: Mapper, P: Array<[number, number]>) =>
  P.map(([a, b]) => M(a, b).map(r1).join(',')).join(' ');

/** Seta sólida (haste + ponta triangular) desenhada num plano local e levada
 *  à tela por M. Desenhar no plano e depois projetar é o que faz a seta
 *  parecer deitada sobre a face do ícone, acompanhando a perspectiva. */
function arrow(M: Mapper, x1: number, y1: number, x2: number, y2: number,
  t: number, h: number, hl: number, c: string): string {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  return `<polygon points="${pts(M, [
    [x1 + nx * t, y1 + ny * t], [bx + nx * t, by + ny * t], [bx + nx * h, by + ny * h],
    [x2, y2],
    [bx - nx * h, by - ny * h], [bx - nx * t, by - ny * t], [x1 - nx * t, y1 - ny * t],
  ])}" fill="${c}"/>`;
}

/** Haste sem ponta (tronco de onde saem outras setas). */
function stem(M: Mapper, x1: number, y1: number, x2: number, y2: number, t: number, c: string): string {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const nx = (-(y2 - y1) / L) * t, ny = ((x2 - x1) / L) * t;
  return `<polygon points="${pts(M, [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]])}" fill="${c}"/>`;
}

/** Caixa em perspectiva: face da frente (x,y,w,h) + tampo e lateral recuados. */
function box(p: Palette, x: number, y: number, w: number, h: number, dx: number, dy: number): string {
  const s = `stroke="${p.line}" stroke-width="1" stroke-linejoin="round"`;
  return (
    `<path d="M${x} ${y}L${x + dx} ${y - dy}H${x + w + dx}L${x + w} ${y}Z" fill="${p.top}" ${s}/>` +
    `<path d="M${x} ${y}H${x + w}V${y + h}H${x}Z" fill="${p.side}" ${s}/>` +
    `<path d="M${x + w} ${y}L${x + w + dx} ${y - dy}V${y + h - dy}L${x + w} ${y + h}Z" fill="${p.dark}" ${s}/>`
  );
}

/** Lateral de cilindro (roteador, banco de dados) em 3 faixas, escura à
 *  esquerda e clara à direita, como no ícone de referência. Faixas desenhadas
 *  por geometria — sem clipPath, que exigiria id único por ícone na página. */
function cylinder(p: Palette, cx: number, rx: number, ry: number, yTop: number, yBot: number): string {
  const x0 = cx - rx, w = (2 * rx) / 3;
  const arcY = (x: number) => yBot + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  const fills = [p.sideD, p.side, p.sideL];
  let s = '';
  for (let i = 0; i < 3; i++) {
    const a = x0 + i * w;
    // Sobreposição de 0.4 entre faixas evita fresta de antialiasing
    const b = i === 2 ? cx + rx : x0 + (i + 1) * w + 0.4;
    s += `<path d="M${r1(a)} ${yTop}V${r1(arcY(a))}A${rx} ${ry} 0 0 0 ${r1(b)} ${r1(arcY(b))}V${yTop}Z" fill="${fills[i]}"/>`;
  }
  return s + `<path d="M${x0} ${yTop}V${yBot}A${rx} ${ry} 0 0 0 ${cx + rx} ${yBot}V${yTop}" fill="none" stroke="${p.line}"/>`;
}

const line = (x1: number, y1: number, x2: number, y2: number, c: string, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (x: number, y: number, r: number, c: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;

function arc(cx: number, cy: number, r: number, a1: number, a2: number, c: string, w: number): string {
  const at = (a: number) => [r1(cx + r * Math.cos((a * Math.PI) / 180)), r1(cy + r * Math.sin((a * Math.PI) / 180))];
  const [sx, sy] = at(a1), [ex, ey] = at(a2);
  return `<path d="M${sx} ${sy}A${r} ${r} 0 0 1 ${ex} ${ey}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
}

// Caixa "baixa" dos equipamentos de rede (switch, OLT, CGNAT…) e o plano do
// seu tampo: U ao longo da largura (0..46), V ao longo da profundidade (0..17).
const SB = { x: 3, y: 30, w: 46, h: 17, dx: 12, dy: 12, D: 17 };
const TOP: Mapper = (u, v) => [SB.x + u + (v * SB.dx) / SB.D, SB.y - (v * SB.dy) / SB.D];
const switchBox = (p: Palette) => box(p, SB.x, SB.y, SB.w, SB.h, SB.dx, SB.dy);

// Tampo do roteador: círculo de raio 29 achatado pela elipse (29 x 11.5).
// O centro das setas desce um pouco: símbolo chapado parece mais para a
// frente em perspectiva.
const RK = 11.5 / 29;
const ROUTER_TOP: Mapper = (a, b) => [32 + a, 22.8 + b * RK];
const polar = (r: number, deg: number): [number, number] =>
  [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

/** Seta do "X" do roteador. As que entram apontam para o centro e as que saem
 *  começam nele — o X fecha no meio, como no símbolo clássico. */
function routerArrow(deg: number, out: boolean, c: string): string {
  const inner = 3.8, outer = 22;
  const [a1, b1] = polar(out ? inner : outer, deg);
  const [a2, b2] = polar(out ? outer : inner, deg);
  return arrow(ROUTER_TOP, a1, b1, a2, b2, 1.6, 5.2, 7.5, c);
}

/** Mesmo X do roteador, no tampo da caixa (convenção de switch multicamada). */
function l3Arrow(du: number, dv: number, out: boolean, c: string): string {
  const L = Math.hypot(du, dv), u = du / L, v = dv / L;
  const [ra, rb] = out ? [2.2, 14.5] : [14.5, 2.2];
  return arrow(TOP, 23 + u * ra, 8.5 + v * ra, 23 + u * rb, 8.5 + v * rb, 0.95, 3, 4.6, c);
}

const CLOUD = 'M16 50C7 50 3 43 7 36.5C4 28 12 21 20.5 23.5C23 13 37 11 42.5 19C49 15.5 58 21 57 29.5C63 32 63 47 52 50Z';

// ── Ícones ───────────────────────────────────────────────────────────────────

const ICONS: Record<string, (p: Palette) => string> = {
  router: (p) =>
    cylinder(p, 32, 29, 11.5, 22, 41) +
    `<ellipse cx="32" cy="22" rx="29" ry="11.5" fill="${p.top}" stroke="${p.line}"/>` +
    routerArrow(-140, false, p.arw) + routerArrow(-40, true, p.arw) +
    routerArrow(140, true, p.arw) + routerArrow(40, false, p.arw),

  // Duas setas para a direita atrás, duas para a esquerda na frente
  switch: (p) =>
    switchBox(p) +
    arrow(TOP, 5, 12, 21, 12, 1.1, 3.1, 5.2, p.arw) + arrow(TOP, 25, 12, 41, 12, 1.1, 3.1, 5.2, p.arw) +
    arrow(TOP, 20, 5, 4, 5, 1.1, 3.1, 5.2, p.arw) + arrow(TOP, 40, 5, 24, 5, 1.1, 3.1, 5.2, p.arw),

  l3switch: (p) =>
    switchBox(p) +
    l3Arrow(-1, 0.5, false, p.arw) + l3Arrow(1, 0.5, true, p.arw) +
    l3Arrow(-1, -0.5, true, p.arw) + l3Arrow(1, -0.5, false, p.arw),

  firewall: (p) => {
    let s = box(p, 6, 22, 40, 34, 14, 10);
    const m = p.top;
    for (const y of [30.5, 39, 47.5]) s += line(6, y, 46, y, m, 1.5) + line(46, y, 60, y - 10, m, 1.3);
    const joints: Array<[number, number, number[]]> = [
      [22, 30.5, [19.3, 32.7]], [30.5, 39, [12.7, 26, 39.3]],
      [39, 47.5, [19.3, 32.7]], [47.5, 56, [12.7, 26, 39.3]],
    ];
    for (const [a, b, xs] of joints) for (const x of xs) s += line(x, a, x, b, m, 1.5);
    return s;
  },

  // Um tronco que se divide em três: distribuição de carga
  loadbalancer: (p) =>
    switchBox(p) +
    stem(TOP, 3, 8.5, 15, 8.5, 1, p.arw) +
    arrow(TOP, 15, 8.5, 42, 14.5, 1, 2.7, 4.6, p.arw) +
    arrow(TOP, 15, 8.5, 43.5, 8.5, 1, 2.7, 4.6, p.arw) +
    arrow(TOP, 15, 8.5, 42, 2.5, 1, 2.7, 4.6, p.arw),

  // Muitos endereços convergindo para um só (o inverso da OLT)
  cgnat: (p) =>
    switchBox(p) +
    [33.5, 38.5, 43.5].map((y) => line(8, y, 24, 38.5, p.arw, 1.8) + dot(8, y, 1.9, p.arw)).join('') +
    arrow(ID, 24, 38.5, 45, 38.5, 1.4, 4, 6, p.arw),

  // Fibra chegando e se dividindo no splitter (PON)
  olt: (p) =>
    switchBox(p) +
    line(7, 38.5, 21, 38.5, p.arw, 2.2) +
    [33, 38.5, 44].map((y) => line(21, 38.5, 42, y, p.arw, 1.6) + dot(42, y, 2, p.arw)).join('') +
    dot(21, 38.5, 2.8, p.arw),

  // Vários comprimentos de onda na mesma fibra
  dwdm: (p) =>
    switchBox(p) +
    [34, 38.5, 43].map((y, i) =>
      `<path d="M${r1(7 + i * 0.8)} ${y}q2.375 -3.4 4.75 0t4.75 0t4.75 0t4.75 0t4.75 0t4.75 0t4.75 0t4.75 0" fill="none" stroke="${p.arw}" stroke-width="1.5" stroke-linecap="round"/>`
    ).join(''),

  // Access point: disco fino com ondas
  wifi: (p) =>
    `<path d="M8 48V53A24 7 0 0 0 56 53V48Z" fill="${p.side}" stroke="${p.line}"/>` +
    `<ellipse cx="32" cy="48" rx="24" ry="7" fill="${p.top}" stroke="${p.line}"/>` +
    dot(32, 48, 1.9, p.arw) +
    [8, 15, 22].map((r) => arc(32, 42, r, 215, 325, p.hi, 3)).join(''),

  // Rádio ponto a ponto: parabólica redonda vista de três quartos, no mastro,
  // com o alimentador e o sinal. De perfil (fina e no alto), lia como pá de
  // turbina eólica.
  antenna: (p) =>
    `<ellipse cx="32" cy="60" rx="9" ry="2.4" fill="${p.dark}"/>` +
    `<path d="M30 60L31 30H33L34 60Z" fill="${p.side}" stroke="${p.line}"/>` +
    line(32, 31, 29, 24, p.side, 3) +
    `<ellipse cx="27" cy="20" rx="7.5" ry="12" fill="${p.top}" stroke="${p.line}"/>` +
    `<ellipse cx="27.8" cy="20" rx="4.6" ry="8.6" fill="${p.side}"/>` +
    line(28, 20, 39, 20, p.arw, 1.6) + dot(39, 20, 1.7, p.arw) +
    [6, 11].map((r) => arc(39, 20, r, -45, 45, p.hi, 2.6)).join(''),

  server: (p) => {
    let s = box(p, 18, 13, 24, 45, 10, 7);
    for (const y of [25, 37, 49]) s += line(18, y, 42, y, p.top, 1.3);
    for (const y of [17.5, 29.5, 41.5]) s += `<rect x="22" y="${y}" width="16" height="2.6" rx="1.2" fill="${p.top}"/>`;
    return s + dot(23.5, 53.5, 1.6, p.arw) + dot(28.5, 53.5, 1.6, p.hi);
  },

  database: (p) =>
    cylinder(p, 32, 20, 6.5, 14, 50) +
    `<ellipse cx="32" cy="14" rx="20" ry="6.5" fill="${p.top}" stroke="${p.line}"/>` +
    `<path d="M12 26A20 6.5 0 0 0 52 26M12 38A20 6.5 0 0 0 52 38" fill="none" stroke="${p.top}" stroke-width="1.5"/>`,

  storage: (p) => {
    let s = box(p, 5, 28, 42, 26, 12, 9);
    for (const y of [32, 39.5, 47]) {
      s += `<rect x="9" y="${y}" width="28" height="4.8" rx="1.2" fill="${p.dark}"/>` + dot(41.5, r1(y + 2.4), 1.3, p.arw);
    }
    return s;
  },

  cloud: (p) => `<path d="${CLOUD}" fill="${p.top}" stroke="${p.line}" stroke-width="1.2"/>`,

  internet: (p) =>
    `<circle cx="32" cy="32" r="26" fill="${p.top}" stroke="${p.line}" stroke-width="1.2"/>` +
    `<ellipse cx="32" cy="32" rx="11" ry="26" fill="none" stroke="${p.side}" stroke-width="1.8"/>` +
    `<path d="M6 32H58M9.5 19H54.5M9.5 45H54.5" stroke="${p.side}" stroke-width="1.6" fill="none"/>`,

  // PTT: a nuvem com várias redes ligadas a um ponto comum
  ix: (p) =>
    `<path d="${CLOUD}" fill="${p.top}" stroke="${p.line}" stroke-width="1.2"/>` +
    ([[15, 37], [49, 37], [23, 27], [41, 27]] as Array<[number, number]>)
      .map(([x, y]) => line(32, 34, x, y, p.arw, 1.6) + dot(x, y, 2.4, p.arw)).join('') +
    `<rect x="26.5" y="31" width="11" height="6" rx="1.4" fill="${p.arw}"/>`,

  desktop: (p) =>
    `<ellipse cx="27" cy="52" rx="13" ry="3.2" fill="${p.side}" stroke="${p.line}"/>` +
    `<path d="M24 40H30V52H24Z" fill="${p.side}" stroke="${p.line}"/>` +
    box(p, 7, 13, 40, 28, 7, 5) +
    `<rect x="10" y="16" width="34" height="22" rx="1" fill="${p.dark}"/>`,

  laptop: (p) =>
    `<path d="M3 50L15 42H61L49 50Z" fill="${p.top}" stroke="${p.line}" stroke-linejoin="round"/>` +
    `<path d="M3 50H49V54H3Z" fill="${p.side}" stroke="${p.line}" stroke-linejoin="round"/>` +
    `<path d="M49 50L61 42V46L49 54Z" fill="${p.dark}" stroke="${p.line}" stroke-linejoin="round"/>` +
    box(p, 15, 14, 36, 28, 6, 4) +
    `<rect x="18" y="17" width="30" height="22" rx="1" fill="${p.dark}"/>` +
    line(9.6, 47.6, 43.6, 47.6, p.dark, 1.4) + line(12.9, 45.4, 46.9, 45.4, p.dark, 1.4),

  phone: (p) =>
    box(p, 20, 9, 22, 46, 6, 4) +
    `<rect x="22.5" y="13" width="17" height="35" rx="1" fill="${p.dark}"/>` +
    line(28, 11, 34, 11, p.arw, 1.2) + dot(31, 51.5, 1.6, p.arw),

  // Câmera de segurança: suporte na parede e corpo alongado com a lente na
  // ponta. De frente e presa no teto, lia como projetor.
  camera: (p) =>
    `<rect x="3" y="30" width="6" height="18" rx="1" fill="${p.side}" stroke="${p.line}"/>` +
    line(9, 39, 20, 35, p.side, 4) +
    box(p, 14, 26, 36, 12, 9, 6) +
    `<path d="M12 26L22 18H62L54 26Z" fill="${p.top}" stroke="${p.line}" stroke-linejoin="round"/>` +
    `<ellipse cx="54.5" cy="29" rx="2.9" ry="5.2" fill="${p.dark}" stroke="${p.line}"/>` +
    `<ellipse cx="54.8" cy="29" rx="1.4" ry="2.6" fill="${p.hi}"/>` +
    dot(20, 32, 1.3, p.arw),

  rack: (p) => {
    let s = box(p, 16, 10, 28, 48, 8, 5);
    for (let i = 0; i < 6; i++) {
      const y = r1(13 + i * 7.4);
      s += `<rect x="19" y="${y}" width="22" height="5.4" rx="0.8" fill="${p.dark}"/>` +
        dot(37.5, r1(y + 2.7), 1, i % 2 ? p.arw : p.hi);
    }
    return s;
  },

  datacenter: (p) => {
    let s = box(p, 8, 20, 36, 38, 12, 8);
    for (const y of [25, 32, 39]) {
      s += `<rect x="12" y="${y}" width="28" height="4" rx="0.8" fill="${p.dark}"/>` + dot(36, y + 2, 1.1, p.arw);
    }
    return s + `<rect x="22" y="47" width="8" height="11" fill="${p.dark}"/>`;
  },

  ups: (p) =>
    box(p, 16, 14, 28, 44, 9, 6) +
    `<rect x="20" y="18" width="20" height="7" rx="1" fill="${p.dark}"/>` +
    `<polygon points="33,28 24,43 30,43 27,54 38,37 32,37 35,28" fill="${p.arw}"/>`,

  // Máquina virtual: arestas tracejadas (não é uma caixa física) e um cubo
  vm: (p) => {
    const s = `stroke="${p.arw}" stroke-width="1.2" stroke-dasharray="3 2" stroke-linejoin="round"`;
    return (
      `<path d="M8 24L20 16H60L48 24Z" fill="${p.top}" ${s}/>` +
      `<path d="M8 24H48V52H8Z" fill="${p.side}" ${s}/>` +
      `<path d="M48 24L60 16V44L48 52Z" fill="${p.dark}" ${s}/>` +
      `<path d="M22 33H32V43H22ZM22 33L26 30H36L32 33M32 43L36 40V30" fill="none" stroke="${p.arw}" stroke-width="1.3" stroke-linejoin="round"/>`
    );
  },

  generic: (p) => box(p, 12, 24, 30, 30, 12, 10),
};

// Variantes antigas de roteador desenham o roteador padrão
const ALIAS: Record<string, string> = {
  router_modern: 'router',
  router_3d: 'router',
  router_cloud: 'router',
};

/** Tipos com ícone próprio (para testes e listagens). */
export const ICON_KEYS = Object.keys(ICONS);

/** Conteúdo SVG (viewBox 0 0 64 64) de um equipamento. Puro: facilita testar
 *  e pré-visualizar os ícones fora do React. */
export function deviceIconMarkup(
  type: string,
  status?: LinkStatus,
  mode: IconColorMode = 'c',
  fixedColor?: string
): string {
  const key = ALIAS[type] ?? type;
  const draw = ICONS[key] ?? ICONS.generic;
  return draw(palette(iconBase(status, mode, fixedColor)));
}

interface IconProps {
  size?: number;
  status?: LinkStatus;
  /** Cor fixa do equipamento: substitui só a cor de operação normal */
  color?: string;
  customIcon?: string;
  colorMode?: IconColorMode;
}

export function getDeviceIcon(type: DeviceType, opts: IconProps = {}): React.ReactElement {
  const size = opts.size ?? 56;

  if (type === 'custom' && opts.customIcon) {
    return <img src={opts.customIcon} alt="custom" width={size} height={size} style={{ objectFit: 'contain' }} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block' }}
      dangerouslySetInnerHTML={{
        __html: deviceIconMarkup(type === 'custom' ? 'generic' : type, opts.status, opts.colorMode, opts.color),
      }}
    />
  );
}
