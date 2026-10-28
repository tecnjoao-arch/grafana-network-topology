// utils/serie.ts — o resumo do grafico de trafego, como no MRTG.
//
// O MRTG escreve a amostragem no titulo ("amostragem de 2 horas") e poe
// embaixo Current / Average / Maximum. Aqui e o mesmo, com uma diferenca: no
// MRTG o Maximum e o maior ponto desenhado — que numa janela longa ja e media
// (6,88 G no diario vira 4,10 G no anual). Aqui o maximo vem da serie de PICO
// quando ela existe: o Zabbix guarda o maximo de cada hora nos trends, e o
// datasource devolve o maior valor de cada bloco com consolidateBy(max).

import { Amostras } from '../types';

/** O espaco entre os pontos, em ms: a mediana dos intervalos. Mediana e nao
 *  media: um buraco de 3 horas sem coleta nao pode virar "amostragem de 4
 *  minutos" numa serie de 1 em 1 minuto. */
export function amostragemDe(a?: Amostras): number | undefined {
  if (!a || a.t.length < 2) return undefined;
  const d: number[] = [];
  for (let i = 1; i < a.t.length; i++) d.push(a.t[i] - a.t[i - 1]);
  d.sort((x, y) => x - y);
  const m = d.length >> 1;
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "1 minuto", "5 minutos", "1 hora", "3 horas", "2h10", "1 dia". As
 *  coletas do Zabbix tem alguns segundos de folga (59s, 61s): abaixo de 1 h
 *  arredonda pro minuto. */
export function fmtAmostragem(ms: number): string {
  const s = ms / 1000;
  // Abaixo de 50 s e coleta em segundos (item de 30 s): arredondar pra
  // "1 minuto" errava por um fator 2. De 50 s pra cima e a folga do minuto.
  if (s < 50) return plural(Math.max(1, Math.round(s)), 'segundo', 'segundos');
  if (s < 3600) return plural(Math.max(1, Math.round(s / 60)), 'minuto', 'minutos');
  if (s < 86400) {
    const min = Math.round(s / 60);
    if (min % 60 === 0) return plural(min / 60, 'hora', 'horas');
    return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  }
  const dias = Math.round(s / 86400 * 10) / 10;
  return Number.isInteger(dias) ? plural(dias, 'dia', 'dias') : `${String(dias).replace('.', ',')} dias`;
}

export interface Resumo {
  /** O ultimo ponto do grafico. */
  ultimo?: number;
  /** A media de tudo que esta na tela. */
  media?: number;
  /** O maior valor: do pico quando ha, senao o maior ponto desenhado. */
  maximo?: number;
}

export function resumo(serie?: Amostras, pico?: Amostras): Resumo {
  if (!serie || serie.v.length === 0) return {};
  const soma = serie.v.reduce((acc, v) => acc + v, 0);
  const deMax = pico && pico.v.length ? pico.v : serie.v;
  return {
    ultimo: serie.v[serie.v.length - 1],
    media: soma / serie.v.length,
    maximo: Math.max(...deMax),
  };
}

/**
 * O pico so acrescenta algo quando cada ponto junta mais de uma coleta. Numa
 * janela curta (Last 1 hour, 1 ponto por coleta) pico e media sao o mesmo
 * numero: nao ha faixa, e "faixa clara = pico de cada bloco" na legenda so
 * confundia — foi a pergunta que apareceu no primeiro uso.
 *
 * Compara ponto a ponto pelo horario. Se nenhum horario bate (alinhamento
 * diferente entre os dois pedidos), compara os maximos.
 */
export function picoAcrescenta(media?: Amostras, pico?: Amostras): boolean {
  if (!media || !pico || !media.v.length || !pico.v.length) return false;
  const porT = new Map(media.t.map((t, i) => [t, media.v[i]]));
  let comparou = false;
  for (let i = 0; i < pico.t.length; i++) {
    const m = porT.get(pico.t[i]);
    if (m === undefined) continue;
    comparou = true;
    // folga de 0,1% e 1 b/s: arredondamento da media, nao pico
    if (pico.v[i] > m * 1.001 + 1) return true;
  }
  return !comparou && Math.max(...pico.v) > Math.max(...media.v) * 1.001 + 1;
}

/**
 * A faixa entre a media (embaixo) e o pico (em cima), como um poligono SVG:
 * vai pelo pico da esquerda pra direita e volta pela media. Nao exige que as
 * duas series tenham os mesmos instantes — cada borda segue a sua.
 */
export function caminhoFaixa(
  sup: Amostras | undefined, inf: Amostras | undefined,
  px: (t: number) => number, py: (v: number) => number
): string {
  if (!sup || !inf || sup.t.length < 2 || inf.t.length < 2) return '';
  const p = (t: number, v: number) => `${px(t).toFixed(1)} ${py(v).toFixed(1)}`;
  const cima = sup.t.map((t, i) => `${i ? 'L' : 'M'} ${p(t, sup.v[i])}`);
  const baixo: string[] = [];
  for (let i = inf.t.length - 1; i >= 0; i--) baixo.push(`L ${p(inf.t[i], inf.v[i])}`);
  return [...cima, ...baixo, 'Z'].join(' ');
}
