// components/useSemBarraHorizontal.ts — Some a barra de rolagem horizontal
// falsa do dashboard público.
//
// No Grafana 12.4, a barra de carregamento e o menu de hover de TODO painel
// passam 1 px da borda direita (medido: right 1892 numa área que termina em
// 1891, com ou sem autofitpanels). A área do dashboard público tem overflow
// auto e mostra uma barra horizontal que não rola nada — e, com o autofit, ela
// ainda come a altura de uma linha do mapa. Lá nada é mais largo que a tela
// (os painéis ocupam a largura), então a rolagem horizontal dessa área é
// escondida. Só no dashboard público: no Grafana logado não mexe em nada.

import React, { useEffect } from 'react';
import { noDashboardPublico } from '../utils/historicoPublico';

/** A área do dashboard que rola: o primeiro ancestral que rola (overflow auto
 *  ou scroll) e tem a largura da página — não uma caixa de dentro de algum
 *  painel. Pelo eixo vertical: o horizontal este hook mesmo esconde. */
export function areaDoDashboard(de: HTMLElement | null): HTMLElement | null {
  let el = de?.parentElement ?? null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.clientWidth >= window.innerWidth * 0.8) return el;
    el = el.parentElement;
  }
  return null;
}

export function useSemBarraHorizontal(raiz: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!noDashboardPublico()) return;
    const area = areaDoDashboard(raiz.current);
    if (!area) return;
    const antes = area.style.overflowX;
    area.style.overflowX = 'hidden';
    return () => { area.style.overflowX = antes; };
  }, [raiz]);
}
