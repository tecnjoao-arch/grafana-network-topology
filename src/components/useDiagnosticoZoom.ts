// components/useDiagnosticoZoom.ts — ?diag=auto (ou ?diag=linhas): descobre, no
// próprio aparelho, que parte do mapa derruba o navegador ao dar zoom.
//
// No iPhone (Safari) a página recarregava sozinha ao dar zoom no mapa — o iOS
// mata a aba que passa do limite de memória — e no Android não. Tirar o
// desfoque do halo, as animações, os cards ou as sombras, um de cada vez, não
// resolveu, e daqui não dá pra medir a memória de um iPhone. Então o teste
// roda lá: em cada rodada parte do mapa fica escondida (ou muda) e o mapa dá
// zoom sozinho, passo a passo, até o máximo. Antes de cada passo a rodada e o
// zoom ficam anotados no aparelho (localStorage); se o Safari derrubar a
// página, ela volta, lê a anotação ("caiu no zoom X") e segue pra próxima
// rodada. No fim, o resultado aparece no canto do mapa — basta um print.
//
// Resultado do ?diag=auto no iPhone (iOS 18.7, 2026-10-28): completo e "só as
// linhas" caem no zoom 0,46; vazio, só cards, só equipamentos e só a grade
// aguentam até 4×. O ?diag=linhas destrincha as linhas: aguentaram as rodadas
// com as linhas numa camada só (will-change), mas a linha "base" também — cai
// só às vezes, sempre no mesmo passo (~5 s depois de abrir). ?diag=confirma
// repete o mapa completo com e sem a correção.
//
// Com a correção, a animação das linhas voltou na teste.22 e o iPhone voltou a
// cair, até sem zoom: no iOS ela ficou desligada (useModoLeve).

import { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';

export type ParteDoMapa = 'linhas' | 'cards' | 'nos' | 'fundo';
const TODAS: ParteDoMapa[] = ['linhas', 'cards', 'nos', 'fundo'];
const SO_LINHAS: ParteDoMapa[] = ['linhas'];

interface Rodada {
  id: string;
  nome: string;
  mostra: ParteDoMapa[];
  /** Classes de teste (fc-diag-*) — ver o CSS em TopologyPanel */
  extras?: string[];
}

const SUITES: Record<string, Rodada[]> = {
  auto: [
    { id: 'completo', nome: 'mapa completo', mostra: TODAS },
    { id: 'vazio', nome: 'mapa vazio', mostra: [] },
    { id: 'so-linhas', nome: 'só as linhas', mostra: ['linhas'] },
    { id: 'so-cards', nome: 'só os cards', mostra: ['cards'] },
    { id: 'so-nos', nome: 'só os equipamentos', mostra: ['nos'] },
    { id: 'so-fundo', nome: 'só a grade do fundo', mostra: ['fundo'] },
  ],
  linhas: [
    { id: 'linhas', nome: 'só as linhas', mostra: SO_LINHAS },
    { id: 'camada-mapa', nome: 'linhas, mapa numa camada só', mostra: SO_LINHAS, extras: ['camada-mapa'] },
    { id: 'camada-linhas', nome: 'linhas numa camada só', mostra: SO_LINHAS, extras: ['camada-linhas'] },
    { id: 'sem-clique', nome: 'linhas sem a área de clique', mostra: SO_LINHAS, extras: ['sem-clique'] },
    { id: 'sem-halo', nome: 'linhas sem o halo', mostra: SO_LINHAS, extras: ['sem-halo'] },
    { id: 'sem-duplo', nome: 'linhas sem o traçado duplo', mostra: SO_LINHAS, extras: ['sem-duplo'] },
  ],
  // A queda é aleatória (perto do limite de memória: "só as linhas" caiu numa
  // vez e aguentou na outra), então a confirmação repete, alternando com e sem
  // a correção do iPhone (linhas numa camada só — fc-ios em TopologyPanel).
  confirma: [1, 2, 3].flatMap((n) => [
    { id: `com-${n}`, nome: `completo, COM a correção (${n})`, mostra: TODAS },
    { id: `sem-${n}`, nome: `completo, sem a correção (${n})`, mostra: TODAS, extras: ['sem-correcao'] },
  ]),
};

function suiteDaUrl(): string {
  try { return new URLSearchParams(window.location.search).get('diag') ?? ''; } catch { return ''; }
}

/** Um por carregamento da página: anotação desta mesma página = o painel só
 *  remontou (não caiu) */
const PAGINA = Math.random().toString(36).slice(2);

/** A página anterior parou no meio da rodada (o Safari a derrubou) */
const caiu = (e: Estado | null): e is Estado => !!e && e.zoom !== null && e.pagina !== PAGINA;

function lerEstado(chave: string): Estado | null {
  try { return JSON.parse(localStorage.getItem(chave) ?? 'null'); } catch { return null; }
}

const PASSO = 1.25;
const ZOOM_MAX = 4;
const ESPERA_PASSO_MS = 900;

interface Estado {
  rodada: number;
  /** Zoom do passo em andamento; 0 = a rodada abriu e ainda não deu zoom;
   *  null = nenhum (a rodada não começou ou acabou) */
  zoom: number | null;
  /** PAGINA de quem anotou o passo */
  pagina?: string;
  resultados: Record<string, string>;
}

export interface Diagnostico {
  ativo: boolean;
  /** Classes pro .react-flow na rodada atual: fc-esconde-* e fc-diag-* */
  classes: string[];
  /** Texto pro canto do mapa: andamento ou resultado */
  linhas: string[];
  recomecar: () => void;
}

export function useDiagnosticoZoom(prontos: boolean): Diagnostico {
  const suite = suiteDaUrl();
  const rodadas = SUITES[suite];
  const ativo = !!rodadas;
  const chave = `fc-diag-zoom-${suite}`;
  const ler = () => lerEstado(chave);
  const gravar = (e: Estado) => {
    try { localStorage.setItem(chave, JSON.stringify(e)); } catch { /* sem armazenamento: o teste não sobrevive à queda */ }
  };
  const { zoomTo, getZoom } = useReactFlow();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [agora, setAgora] = useState<string>('');

  // Começo: retoma a anotação. Passo em andamento = a página caiu nele.
  useEffect(() => {
    if (!ativo) return;
    let e = ler() ?? { rodada: 0, zoom: null, resultados: {} };
    if (caiu(e) && e.rodada < rodadas.length) {
      const queda = e.zoom === 0 ? 'CAIU antes do zoom' : `CAIU no zoom ${e.zoom!.toFixed(2)}`;
      e = { rodada: e.rodada + 1, zoom: null, resultados: { ...e.resultados, [rodadas[e.rodada].id]: queda } };
    } else {
      e = { ...e, zoom: null };
    }
    // A rodada começa a contar já ao abrir. Antes só o primeiro passo de zoom
    // era anotado: no iPhone com a animação a página caía antes dele, voltava
    // na mesma rodada e caía de novo, sem fim (teste.23).
    gravar(e.rodada < rodadas.length ? { ...e, zoom: 0, pagina: PAGINA } : e);
    setEstado(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  // Roda a rodada atual: zoom sozinho até o máximo; aguentou → próxima rodada (página nova, memória limpa)
  useEffect(() => {
    if (!ativo || !prontos || !estado || estado.rodada >= rodadas.length) return;
    let parado = false;
    const r = rodadas[estado.rodada];
    (async () => {
      await new Promise((ok) => setTimeout(ok, 2500)); // as partes escondidas saem da tela
      let z = getZoom();
      while (!parado && z < ZOOM_MAX) {
        z = Math.min(ZOOM_MAX, z * PASSO);
        gravar({ ...estado, zoom: z, pagina: PAGINA });
        setAgora(`rodada ${estado.rodada + 1}/${rodadas.length} (${r.nome}) — zoom ${z.toFixed(2)}`);
        zoomTo(z, { duration: 0 });
        await new Promise((ok) => setTimeout(ok, ESPERA_PASSO_MS));
      }
      if (parado) return;
      gravar({ rodada: estado.rodada + 1, zoom: null, resultados: { ...estado.resultados, [r.id]: `aguentou até ${ZOOM_MAX}×` } });
      window.location.reload();
    })();
    return () => { parado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, prontos, estado, zoomTo, getZoom]);

  if (!ativo) return { ativo: false, classes: [], linhas: [], recomecar: () => {} };
  const fim = !!estado && estado.rodada >= rodadas.length;
  const atual = estado && !fim ? rodadas[estado.rodada] : undefined;
  const linhas = [
    `Diagnóstico de zoom (${suite}) — ${fim ? 'RESULTADO' : 'não toque na tela'}`,
    ...rodadas.map((r, i) => `${i + 1}. ${r.nome}: ${estado?.resultados[r.id] ?? (atual?.id === r.id ? 'rodando…' : '—')}`),
    ...(fim ? [`${navigator.userAgent.match(/iPhone OS [\d_]+|Android [\d.]+/)?.[0] ?? ''} · tela ${screen.width}×${screen.height} · ${window.devicePixelRatio}x`] : [agora]),
  ];
  return {
    ativo,
    classes: atual
      ? [...TODAS.filter((p) => !atual.mostra.includes(p)).map((p) => `fc-esconde-${p}`), ...(atual.extras ?? []).map((x) => `fc-diag-${x}`)]
      : [],
    linhas,
    recomecar: () => { try { localStorage.removeItem(chave); } catch { /* nada a limpar */ } window.location.reload(); },
  };
}
