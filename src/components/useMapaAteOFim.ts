// components/useMapaAteOFim.ts — No dashboard público com autofitpanels, o
// painel do mapa vai até o fim da tela.
//
// O autofit do Grafana 12.4 divide a altura em linhas de 38 px e reserva 32 px
// de margem: sobram de 40 a 78 px vazios embaixo do último painel (medido: o
// mapa terminava em 930 numa área que vai até 970; no celular, 45 a 73 px de
// faixa vazia, diferente em cada aparelho). Aqui o item da grade do mapa estica
// até o fim da área do dashboard, e o Grafana repassa a altura nova ao painel.
//
// A altura vai numa regra CSS com !important, não no style do item: o style é
// do React do Grafana, que o reescreve. No computador isso só acontecia ao
// mudar o tamanho da janela; no celular (painéis empilhados) o Grafana refaz o
// encaixe logo depois do esticamento, e escrever no style virava briga — o
// painel pulava ~40 px a cada 2–3 s (teste.14). Com a regra, o que o Grafana
// escreve fica valendo por baixo e a altura vista não muda. Quando ele refaz o
// layout de verdade (janela mudou, barras do Safari aparecem/somem), os
// painéis se mexem e isto recalcula.
//
// Só quando dá pra fazer com segurança: página pública, com autofitpanels (sem
// ele a página rola e "o fim" não é o da tela), o mapa é o painel mais baixo, a
// sobra é pequena e esticar não faz a página rolar.

import React, { useEffect } from 'react';
import { noDashboardPublico } from '../utils/historicoPublico';
import { areaDoDashboard } from './useSemBarraHorizontal';

/** Margem que o Grafana deixa entre painéis e embaixo do último. */
const MARGEM = 8;
/** Sobra maior que isso não é a do arredondamento do autofit: não mexe. */
const SOBRA_MAX = 120;
/** Freio: se o Grafana e isto entrarem em ciclo, para de ajustar. */
const AJUSTES_MAX_POR_5S = 12;

const ATRIBUTO = 'data-mapa-ate-o-fim';

/** Quanto o conteúdo passa do que cabe, no pior dos contêineres que rolam do
 *  painel até a página inteira. Não basta a área do dashboard: no celular ela
 *  cresce junto com o conteúdo e quem rola é um contêiner de fora (medido:
 *  esticando 52 px a área continuava sem rolar e a página rolava 7 px). */
function transbordo(de: HTMLElement): number {
  let pior = 0;
  for (let el: HTMLElement | null = de.parentElement; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll' || el === document.scrollingElement) {
      pior = Math.max(pior, el.scrollHeight - el.clientHeight);
    }
  }
  return pior;
}

export function useMapaAteOFim(raiz: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!noDashboardPublico() || !new URLSearchParams(window.location.search).has('autofitpanels')) return;
    let item: HTMLElement | null = null;
    let area: HTMLElement | null = null;
    const id = Math.random().toString(36).slice(2, 10);
    const regra = document.createElement('style');
    const fixa = (px: number | null) => {
      regra.textContent = px === null ? '' : `[${ATRIBUTO}="${id}"] { height: ${px}px !important; }`;
    };
    let ajustes: number[] = [];

    const ajustar = () => {
      item ??= raiz.current?.closest('.react-grid-item') as HTMLElement | null;
      area ??= areaDoDashboard(raiz.current);
      if (!item || !area) return;
      const agora = Date.now();
      ajustes = ajustes.filter((t) => agora - t < 5000);
      if (ajustes.length >= AJUSTES_MAX_POR_5S) return;
      ajustes.push(agora);
      if (!regra.isConnected) document.head.appendChild(regra);
      item.setAttribute(ATRIBUTO, id);
      // Sem a regra: a altura que o Grafana deu. Tirar e pôr de novo na mesma
      // tarefa não chega a ser desenhado nem visto pelo ResizeObserver.
      fixa(null);
      const r = item.getBoundingClientRect();
      // Outro painel mais embaixo: esticar este passaria por cima dele
      const outros = Array.from(document.querySelectorAll('.react-grid-item')).filter((o) => o !== item);
      if (outros.some((o) => o.getBoundingClientRect().bottom > r.bottom + 1)) return;
      // Página que já rola: "o fim" não é o da tela
      if (transbordo(item) > 1) return;
      const fimDaTela = Math.min(area.getBoundingClientRect().bottom, window.innerHeight);
      let alvo = Math.floor(fimDaTela - MARGEM - r.top);
      if (alvo - r.height < 2 || alvo - r.height > SOBRA_MAX) return;
      fixa(alvo);
      // No celular há um respiro embaixo do último painel (rodapé): o que
      // passou do fim vira rolagem — devolve.
      const passou = transbordo(item);
      if (passou > 0) {
        alvo -= passou;
        fixa(alvo - r.height < 2 ? null : alvo);
      }
    };

    // Depois do autofit e do primeiro desenho; de novo quando a janela muda e
    // quando o Grafana mexe no style de algum painel (refez o layout).
    let t = setTimeout(ajustar, 300);
    const depois = (ms: number) => () => { clearTimeout(t); t = setTimeout(ajustar, ms); };
    const aoMudarJanela = depois(150);
    window.addEventListener('resize', aoMudarJanela);
    // Só o style dos itens da grade (posição e altura de cada painel) — não o
    // que vai dentro deles: o mapa mexe no style dele a cada arraste e zoom.
    const grade = raiz.current?.closest('.react-grid-layout');
    const aoMexer = depois(100);
    const mo = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => n instanceof HTMLElement && mo.observe(n, { attributes: true, attributeFilter: ['style'] }));
      }
      aoMexer();
    });
    if (grade) {
      mo.observe(grade, { childList: true });
      Array.from(grade.children).forEach((n) => mo.observe(n, { attributes: true, attributeFilter: ['style'] }));
    }
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', aoMudarJanela);
      mo.disconnect();
      regra.remove();
      item?.removeAttribute(ATRIBUTO);
    };
  }, [raiz]);
}
