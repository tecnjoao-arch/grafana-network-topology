// components/useMapaAteOFim.ts — O painel do mapa vai até o fim da tela:
//   - no celular (painéis empilhados, tela de até 768 px de largura), em
//     qualquer dashboard, cresce ou encolhe até lá. Sem isto o mapa do
//     dashboard logado passava do fim, a página rolava ~480 px e o desenho
//     virava uma faixa com 21% da altura (medido num iPhone 390×844);
//   - no dashboard público com autofitpanels, estica os 40–78 px que o
//     autofit do Grafana 12.4 deixa vazios embaixo do último painel (medido:
//     o mapa terminava em 930 numa área que vai até 970).
// No computador sem autofitpanels não mexe: o mapa fica com a altura da grade
// do dashboard. Encaixar ali também (0.4.2/0.4.3) foi desfeito a pedido do
// user — fica pros testes com o Grafana 13.
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
// No celular, encolhendo, a grade inteira ganha a mesma regra (ela tem a
// altura do painel mais baixo; sem acompanhar, a página continuaria rolando) e
// o item fica recortado na própria caixa: o Grafana só redesenha o painel no
// tamanho novo um instante depois, e até lá o conteúdo antigo, mais alto,
// vazava por baixo — a página parecia passar do fim e a correção encolhia o
// mapa até o mínimo.
//
// Só quando dá pra fazer com segurança: fora do modo edição do dashboard, com
// o mapa como painel mais baixo e começando no alto da primeira tela, sem
// painel ao lado ao encolher, e nunca abaixo de ALTURA_MIN.

import React, { useEffect } from 'react';
import { noDashboardPublico } from '../utils/historicoPublico';
import { areaDoDashboard } from './useSemBarraHorizontal';

/** Margem que o Grafana deixa entre painéis e embaixo do último. */
const MARGEM = 8;
/** Com autofit: sobra maior que isso não é a do arredondamento dele. */
const SOBRA_MAX = 120;
/** Abaixo de 769 px o Grafana empilha os painéis: é o celular. */
const CELULAR_ATE = 768;
/** Encolhendo, o mapa não fica mais baixo que isto. */
const ALTURA_MIN = 240;
/** O mapa tem que começar até esta fração da primeira tela. */
const TOPO_MAX = 0.6;
/** Freio: se o Grafana e isto entrarem em ciclo, para de ajustar. */
const AJUSTES_MAX_POR_5S = 12;

const ATRIBUTO = 'data-mapa-ate-o-fim';
const ATRIBUTO_GRADE = 'data-mapa-ate-o-fim-grade';
/** O que observar em cada item da grade: o style e os filhos diretos (as
 *  alças do modo edição entram e saem) */
const DO_ITEM: MutationObserverInit = { attributes: true, attributeFilter: ['style'], childList: true };

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
    const autofit = noDashboardPublico() && new URLSearchParams(window.location.search).has('autofitpanels');
    // Procurados de novo a cada ajuste: enquanto monta a página, o Grafana
    // pode trocá-los
    let item: HTMLElement | null = null;
    let grade: HTMLElement | null = null;
    const id = Math.random().toString(36).slice(2, 10);
    const regra = document.createElement('style');
    let recorta = false;
    const fixa = (px: number | null, alturaGrade?: number) => {
      regra.textContent = (recorta ? `[${ATRIBUTO}="${id}"] { overflow: hidden; overflow: clip; }` : '') + (px === null ? '' :
        ` [${ATRIBUTO}="${id}"] { height: ${px}px !important; }` +
        (alturaGrade ? ` [${ATRIBUTO_GRADE}="${id}"] { height: ${alturaGrade}px !important; }` : ''));
    };
    const solta = () => {
      regra.textContent = '';
      item?.removeAttribute(ATRIBUTO);
    };
    let ajustes: number[] = [];

    const ajustar = () => {
      const celular = window.innerWidth <= CELULAR_ATE;
      if (!celular && !autofit) { solta(); return; }
      recorta = celular;
      item = raiz.current?.closest('.react-grid-item') as HTMLElement | null;
      grade = item?.closest('.react-grid-layout') as HTMLElement | null;
      // No público a área do dashboard é uma caixa que rola; no Grafana logado
      // quem rola pode ser a própria página
      const area = areaDoDashboard(raiz.current) ?? (document.scrollingElement as HTMLElement | null);
      if (!item || !grade || !area) return;
      const agora = Date.now();
      ajustes = ajustes.filter((t) => agora - t < 5000);
      if (ajustes.length >= AJUSTES_MAX_POR_5S) return;
      ajustes.push(agora);
      if (!regra.isConnected) document.head.appendChild(regra);
      item.setAttribute(ATRIBUTO, id);
      // Sem a altura: a que o Grafana deu. Tirar e pôr de novo na mesma tarefa
      // não chega a ser desenhado nem visto pelo ResizeObserver.
      fixa(null);
      // Dashboard em modo edição: a grade mostra as alças de redimensionar
      if (item.querySelector('.react-resizable-handle')) { solta(); return; }
      const r = item.getBoundingClientRect();
      const g = grade.getBoundingClientRect();
      const outros = Array.from(grade.children)
        .filter((o) => o !== item && o.classList.contains('react-grid-item'))
        .map((o) => o.getBoundingClientRect());
      // Outro painel mais embaixo: o mapa não é o último
      if (outros.some((o) => o.bottom > r.bottom + 1)) { solta(); return; }
      // Onde o mapa começa e quanto cabe, contando do alto da página (a página
      // pode estar rolada quando isto roda)
      const doc = area === document.scrollingElement;
      const caixa = area.getBoundingClientRect();
      const topo = doc ? r.top + window.scrollY : r.top - caixa.top + area.scrollTop;
      const visivel = doc ? window.innerHeight : Math.min(caixa.bottom, window.innerHeight) - Math.max(caixa.top, 0);
      if (visivel < ALTURA_MIN || topo < 0 || topo > visivel * TOPO_MAX) { solta(); return; }
      let alvo = Math.floor(visivel - MARGEM - topo);

      if (!celular) {
        // Autofit no computador (como até a 0.4.0): só a sobra do
        // arredondamento, e só crescendo
        if (transbordo(item) > 1 || alvo - r.height < 2 || alvo - r.height > SOBRA_MAX) { solta(); return; }
        fixa(alvo);
        const passou = transbordo(item);
        if (passou > 0) {
          alvo -= passou;
          fixa(alvo - r.height < 2 ? null : alvo);
        }
        return;
      }

      if (alvo < r.height) {
        // Painel ao lado do mapa: encolher deixaria ele passando do fim
        if (outros.some((o) => o.bottom > r.top + 1)) { solta(); return; }
        alvo = Math.max(alvo, Math.min(ALTURA_MIN, r.height));
      }
      const fixaAlvo = () => {
        if (Math.abs(alvo - r.height) < 2) { fixa(null); return; }
        grade?.setAttribute(ATRIBUTO_GRADE, id);
        fixa(alvo, Math.round(r.top - g.top + alvo + (g.bottom - r.bottom)));
      };
      fixaAlvo();
      // Há um respiro embaixo do último painel (rodapé): o que passou do fim
      // vira rolagem — devolve.
      const passou = transbordo(item);
      if (passou > 0 && alvo > ALTURA_MIN) {
        alvo = Math.max(ALTURA_MIN, alvo - passou);
        fixaAlvo();
      }
    };

    // Logo no primeiro quadro: no celular o painel já tem a altura final
    // quando o mapa se desenha e se ajusta — encaixado depois (300 ms), o
    // mapa se ajustava a uma altura e logo a outra, e pulava ao carregar. De
    // novo depois do autofit, quando a janela muda e quando o Grafana mexe no
    // style de algum painel (refez o layout).
    const quadro = requestAnimationFrame(ajustar);
    let t = setTimeout(ajustar, 300);
    const depois = (ms: number) => () => { clearTimeout(t); t = setTimeout(ajustar, ms); };
    const aoMudarJanela = depois(150);
    window.addEventListener('resize', aoMudarJanela);
    // Só o style dos itens da grade (posição e altura de cada painel) e os
    // filhos diretos — não o que vai dentro deles: o mapa mexe no style dele a
    // cada arraste e zoom.
    const gradeObservada = raiz.current?.closest('.react-grid-layout');
    const aoMexer = depois(100);
    const mo = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === 'childList' && m.target === gradeObservada) m.addedNodes.forEach((n) => n instanceof HTMLElement && mo.observe(n, DO_ITEM));
      }
      aoMexer();
    });
    if (gradeObservada) {
      mo.observe(gradeObservada, { childList: true });
      Array.from(gradeObservada.children).forEach((n) => mo.observe(n, DO_ITEM));
    }
    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(t);
      window.removeEventListener('resize', aoMudarJanela);
      mo.disconnect();
      regra.remove();
      item?.removeAttribute(ATRIBUTO);
      if (grade?.getAttribute(ATRIBUTO_GRADE) === id) grade.removeAttribute(ATRIBUTO_GRADE);
    };
  }, [raiz]);
}
