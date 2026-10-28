// utils/theme.ts — Paletas do painel (escuro/claro) e contraste garantido.
//
// O tema do painel trocava só o fundo e a grade: nós, cards, tooltip, barra
// lateral e legenda tinham cores fixas de tema escuro. No claro isso dava
// rótulo branco em fundo branco (nó transparente: 1,05:1), linha verde a
// 2,2:1 do fundo e o ↑ azul de TODO card abaixo do mínimo de leitura. No
// escuro, o cinza dos textos secundários e o pulse do DOWN (a linha caía a
// 40% e o link sumia metade do tempo) também reprovavam.
//
// Regras (WCAG 2.1): texto ≥ 4,5:1 sobre o fundo real; linha ≥ 3:1 sobre o
// fundo do mapa. As paletas abaixo passam por construção; cor escolhida pelo
// usuário (cor fixa do link, regra de cor, fundo do nó) passa por
// ensureContrast(), que mantém o matiz e só escurece/clareia o necessário.

import type { LinkStatus } from '../types';

export type PanelTheme = 'dark' | 'light';

export interface Palette {
  /** Fundo do mapa e linhas da grade */
  canvas: string;
  grid: string;
  /** Superfícies opacas: card de interface, barra lateral, legenda, tooltip */
  surface: string;
  /** Fundo padrão do nó (translúcido: a grade aparece por baixo) */
  nodeBg: string;
  /** Contorno do nó em estado normal — no claro, nó branco some no fundo sem ele */
  nodeBorder: string;
  border: string;
  /** Linha divisória dentro de cards e painéis */
  divider: string;
  text: string;
  textMuted: string;
  shadow: string;
  /** Campo de busca, botão em hover */
  field: string;
  /** Interruptor desligado */
  switchOff: string;
  /** Cor das LINHAS por status (≥ 3:1 sobre canvas) */
  line: Record<LinkStatus, string>;
  /** Cor de TEXTO por status (≥ 4,5:1 sobre surface) */
  statusText: Record<LinkStatus, string>;
  /** Tráfego: ↓ inbound verde, ↑ outbound azul (texto) */
  inbound: string;
  outbound: string;
  ip: string;
  /** Potência óptica: identidade Tx/Rx e níveis */
  tx: string;
  rx: string;
  warn: string;
  alarm: string;
  /** "Copiado!" */
  ok: string;
  /** Minimapa: máscara fora da área visível */
  minimapMask: string;
}

const DARK: Palette = {
  canvas: '#020617',
  grid: 'rgba(255,255,255,0.04)',
  surface: '#0f172a',
  nodeBg: 'rgba(15, 23, 42, 0.85)',
  nodeBorder: 'transparent',
  border: '#334155',
  divider: 'rgba(255,255,255,0.1)',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  shadow: 'rgba(0,0,0,0.4)',
  field: '#1e293b',
  switchOff: '#475569',
  line: { up: '#22c55e', warning: '#f59e0b', down: '#ef4444', unknown: '#64748b' },
  // unknown e down mais claros que a linha: #64748b em card escuro dava 3,8:1.
  statusText: { up: '#22c55e', warning: '#f59e0b', down: '#f87171', unknown: '#94a3b8' },
  inbound: '#22c55e',
  outbound: '#3b82f6',
  ip: '#22d3ee',
  tx: '#4ade80',
  rx: '#60a5fa',
  warn: '#facc15',
  alarm: '#f87171',
  ok: '#4ade80',
  minimapMask: 'rgba(2, 6, 23, 0.7)',
};

const LIGHT: Palette = {
  canvas: '#f8fafc',
  grid: 'rgba(15,23,42,0.06)',
  surface: '#ffffff',
  nodeBg: 'rgba(255, 255, 255, 0.92)',
  nodeBorder: '#cbd5e1',
  border: '#cbd5e1',
  divider: 'rgba(15,23,42,0.1)',
  text: '#0f172a',
  textMuted: '#475569',
  shadow: 'rgba(15,23,42,0.14)',
  field: '#f1f5f9',
  switchOff: '#94a3b8',
  // Os tons -600/-700 dos mesmos verdes/âmbar/vermelhos: o -500 do escuro
  // ficava a 2:1 do fundo claro.
  line: { up: '#16a34a', warning: '#d97706', down: '#dc2626', unknown: '#64748b' },
  statusText: { up: '#15803d', warning: '#b45309', down: '#b91c1c', unknown: '#475569' },
  inbound: '#15803d',
  outbound: '#1d4ed8',
  ip: '#0e7490',
  tx: '#15803d',
  rx: '#1d4ed8',
  warn: '#b45309',
  alarm: '#b91c1c',
  ok: '#15803d',
  minimapMask: 'rgba(226, 232, 240, 0.7)',
};

/** O tema do mapa: o fixado no painel ou, em "Seguir o Grafana" (auto, e
 *  também sem valor salvo), o que o Grafana estiver usando agora. */
export function temaEfetivo(opcao: string | undefined, grafanaEscuro: boolean): PanelTheme {
  if (opcao === 'dark' || opcao === 'light') return opcao;
  return grafanaEscuro ? 'dark' : 'light';
}

export function paletteFor(theme?: string): Palette {
  return theme === 'light' ? LIGHT : DARK;
}

// ── Cor ────────────────────────────────────────────────────────────────────

export interface RGBA { r: number; g: number; b: number; a: number }

let ctx2d: CanvasRenderingContext2D | null | undefined;

/** Nome de cor ("white", "tomato") via canvas do navegador, que normaliza
 *  qualquer cor CSS. Cor inválida não muda o fillStyle — daí os dois testes. */
function viaCanvas(c: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  if (ctx2d === undefined) {
    try { ctx2d = document.createElement('canvas').getContext('2d'); } catch { ctx2d = null; }
  }
  if (!ctx2d) return undefined;
  ctx2d.fillStyle = '#000000';
  ctx2d.fillStyle = c;
  const a = String(ctx2d.fillStyle);
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillStyle = c;
  return a === String(ctx2d.fillStyle) ? a : undefined;
}

/** Lê #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() e 'transparent'. */
export function parseColor(c?: string): RGBA | undefined {
  if (!c) return undefined;
  const s = c.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)));
    if (p.length >= 3 && p.slice(0, 3).every((x) => !isNaN(x))) {
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !isNaN(p[3]) ? p[3] : 1 };
    }
    return undefined;
  }
  const norm = viaCanvas(s);
  return norm && norm !== s ? parseColor(norm) : undefined;
}

/** `top` desenhado sobre `base` (base opaca). */
export function over(top: RGBA, base: RGBA): RGBA {
  const a = top.a;
  return { r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a), a: 1 };
}

const lin = (v: number) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const luminance = (c: RGBA) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

/** Razão de contraste WCAG entre duas cores opacas (1 a 21). */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function toHex(c: RGBA): string {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function toHsl({ r, g, b }: RGBA): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) / 6 : max === G ? ((B - R) / d + 2) / 6 : ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): RGBA {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a: 1 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: ch(h + 1 / 3) * 255, g: ch(h) * 255, b: ch(h - 1 / 3) * 255, a: 1 };
}

const memo = new Map<string, string>();

/**
 * A cor com o mesmo matiz, escurecida ou clareada só o necessário pra ter
 * `min` de contraste sobre `bg`. Cor que já passa volta como veio — inclusive
 * na grafia original. Cor ilegível de ler (nome inválido) também volta como
 * veio: melhor a cor do usuário que nenhuma.
 */
export function ensureContrast(color: string, bg: string, min: number): string {
  const key = `${color}|${bg}|${min}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const out = (() => {
    const base = parseColor(bg);
    const raw = parseColor(color);
    if (!base || !raw) return color;
    const b = over(base, { r: 255, g: 255, b: 255, a: 1 });
    const c = over(raw, b);
    if (contrastRatio(c, b) >= min) return color;

    const [h, s, l0] = toHsl(c);
    // O teste é feito na cor JÁ arredondada pra hex: avaliada antes do
    // arredondamento, a resposta saía com 2,98 onde o mínimo era 3.
    const hexDe = (l: number) => toHex(fromHsl(h, s, l));
    const passa = (l: number) => contrastRatio(parseColor(hexDe(l))!, b) >= min;
    const tenta = (escurece: boolean): string | undefined => {
      // Busca binária na luminosidade, partindo da cor original: o primeiro
      // tom que passa é o mais próximo dela. Um extremo sempre passa (é o
      // ponto de partida da busca), então o resultado passa também.
      let lo = escurece ? 0 : l0;
      let hi = escurece ? l0 : 1;
      if (!passa(escurece ? 0 : 1)) return undefined;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (escurece ? passa(mid) : !passa(mid)) lo = mid; else hi = mid;
      }
      return hexDe(escurece ? lo : hi);
    };
    const fundoEscuro = luminance(b) < 0.18;
    return tenta(!fundoEscuro) ?? tenta(fundoEscuro)
      ?? (contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, b) > contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, b) ? '#000000' : '#ffffff');
  })();

  memo.set(key, out);
  return out;
}

/** O fundo efetivo de um elemento translúcido desenhado sobre `base`. */
export function effectiveBg(color: string | undefined, base: string): string {
  const b = parseColor(base);
  const c = parseColor(color);
  if (!b) return base;
  const bo = over(b, { r: 255, g: 255, b: 255, a: 1 });
  return toHex(c ? over(c, bo) : bo);
}

/** Texto principal e secundário legíveis sobre um fundo qualquer (fundo de nó
 *  escolhido pelo usuário): o par da paleta que mais contrasta, garantido. */
export function readableOn(bg: string): { text: string; muted: string } {
  const b = parseColor(bg);
  if (!b) return { text: DARK.text, muted: DARK.textMuted };
  const escuro = contrastRatio(parseColor(LIGHT.text)!, b) >= contrastRatio(parseColor(DARK.text)!, b);
  const par = escuro ? LIGHT : DARK;
  return { text: ensureContrast(par.text, bg, 4.5), muted: ensureContrast(par.textMuted, bg, 4.5) };
}
