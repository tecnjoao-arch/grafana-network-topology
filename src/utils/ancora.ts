// utils/ancora.ts — Onde a ponta de um link encosta no nó.
//
// A âncora é uma fração 0..1 da caixa do nó (0,0 = canto superior esquerdo).
// Antes, criar um link só deixava a ponta perto dos 4 pontos de conexão (meio
// de cada lado: o React Flow puxava a linha pro mais próximo, daí os "pulos"),
// e arrastar a ponta depois não tinha ímã nenhum — deixar uma linha reta era
// questão de acertar o pixel no olho, e várias ficavam 2–3 px tortas.
// Aqui a ponta vai pra borda mais perto de onde o usuário soltou e, chegando
// perto de ficar reta com o ponto vizinho da rota (ou do meio do lado), encaixa.

export type Pt = { x: number; y: number };
export interface Caixa { x: number; y: number; w: number; h: number }

const limita = (v: number) => Math.min(1, Math.max(0, v));

/** A caixa do nó em coordenadas do mapa (nó interno do React Flow). */
export function caixaDoNo(no: any): Caixa {
  return {
    x: no?.internals?.positionAbsolute?.x ?? no?.position?.x ?? 0,
    y: no?.internals?.positionAbsolute?.y ?? no?.position?.y ?? 0,
    w: no?.measured?.width ?? 0,
    h: no?.measured?.height ?? 0,
  };
}

/**
 * A âncora no ponto da BORDA mais perto de `p` — em qualquer ponto de
 * qualquer lado, não só no meio. Com `vizinho` (o próximo ponto da rota) e
 * `ima` (raio, em px do mapa), a ponta encaixa alinhada a ele quando está a
 * menos de `ima`: lado de cima/baixo alinha o x (linha vertical reta), lado
 * esquerdo/direito alinha o y. Sem vizinho perto, encaixa no meio do lado.
 */
export function ancoraNaBorda(c: Caixa, p: Pt, vizinho?: Pt, ima = 0): Pt {
  if (!c.w || !c.h) return { x: 0.5, y: 0.5 };
  let fx = limita((p.x - c.x) / c.w);
  let fy = limita((p.y - c.y) / c.h);
  const lados = [fy, 1 - fy, fx, 1 - fx]; // cima, baixo, esquerda, direita
  const lado = lados.indexOf(Math.min(...lados));
  const horizontal = lado <= 1; // cima/baixo: a ponta anda no x
  if (lado === 0) fy = 0; else if (lado === 1) fy = 1; else if (lado === 2) fx = 0; else fx = 1;
  if (ima > 0) {
    if (horizontal) {
      const x = c.x + fx * c.w;
      if (vizinho && Math.abs(x - vizinho.x) <= ima && vizinho.x >= c.x && vizinho.x <= c.x + c.w) fx = (vizinho.x - c.x) / c.w;
      else if (Math.abs(fx - 0.5) * c.w <= ima) fx = 0.5;
    } else {
      const y = c.y + fy * c.h;
      if (vizinho && Math.abs(y - vizinho.y) <= ima && vizinho.y >= c.y && vizinho.y <= c.y + c.h) fy = (vizinho.y - c.y) / c.h;
      else if (Math.abs(fy - 0.5) * c.h <= ima) fy = 0.5;
    }
  }
  return { x: fx, y: fy };
}

/** O ponto do mapa de uma âncora. */
export function pontoDaAncora(c: Caixa, a: Pt): Pt {
  return { x: c.x + a.x * c.w, y: c.y + a.y * c.h };
}

/** Raio do ímã: 8 px de TELA, em px do mapa (com zoom baixo, mais px do mapa). */
export const imaNoZoom = (zoom: number) => 8 / Math.max(0.05, zoom || 1);
