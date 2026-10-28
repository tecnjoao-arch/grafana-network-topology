// components/Trafego.tsx — o grafico de trafego de um link.
//
// SVG na mao, sem biblioteca: sao duas linhas, uma area e um crosshair. Puxar
// uma lib de grafico dobraria o bundle de um plugin que inteiro tem 40 KB.
//
// A leitura e a mesma do grafana-network-topology — inbound preenchido,
// outbound so linha, e os rotulos "↓ in" / "↑ out" — porque o analista pula
// de um painel pro outro. Os campos no codigo seguem rx/tx: e o nome que vem
// dos itens do Zabbix (Bits received / Bits sent).
//
// O SVG e desenhado no TAMANHO REAL em pixels, medido por ResizeObserver, e
// nao num viewBox fixo esticado por preserveAspectRatio="none". Esticar
// deforma tudo o que nao e linha: o texto dos eixos afina ou engorda conforme
// a largura do cartao, e num grid responsivo isso muda a cada breakpoint.

import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { Amostras } from '../types';
import { fmtAxisBps, formatBitsPerSec, niceCeil } from '../utils/format';
import { caminhoFaixa } from '../utils/serie';
import { useLargura } from './useLargura';

// Verde = inbound, azul = outbound. Os nomes seguem os campos do modelo
// (rx/tx), que vem dos itens do Zabbix; os ROTULOS na tela sao in/out.
const COR_RX = '#00c853';
const COR_TX = '#2196f3';

interface Props {
  /** A media de cada bloco (numa janela curta, a propria coleta). */
  rx?: Amostras;
  tx?: Amostras;
  /** O maior valor de cada bloco: vira a faixa clara acima da media. */
  rxPico?: Amostras;
  txPico?: Amostras;
  /** Capacidade da interface: vira uma linha tracejada de referencia. */
  speed?: number;
  altura?: number;
}

/** Indice da amostra mais proxima de `t`. Busca binaria — o handler roda a
 *  cada mousemove e a serie pode ter centenas de pontos. */
export function maisProximo(a: Amostras | undefined, t: number): number | undefined {
  if (!a || a.t.length === 0) return undefined;
  let lo = 0;
  let hi = a.t.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a.t[m] < t) lo = m + 1;
    else hi = m;
  }
  if (lo > 0 && Math.abs(a.t[lo - 1] - t) < Math.abs(a.t[lo] - t)) lo--;
  return lo;
}

/**
 * Topo do eixo Y.
 *
 * A capacidade NAO empurra o topo pra cima: num 1G passando 250 Mb/s a curva
 * virava um risco colado no eixo. Mas ela PODE puxar pra baixo: quando o
 * trafego chega perto da capacidade, o niceCeil (passos 1/2/2.5/5/10) salta
 * pro degrau seguinte — 980 Mb/s num link de 1 Gb virava topo de 2 Gb/s, com
 * metade do grafico vazia. O trafego nao passa da capacidade, entao ela e o
 * teto natural nesse caso.
 */
export function topoTrafego(pico: number, speed?: number): number {
  const topo = niceCeil((pico || 1) * 1.05);
  if (speed && pico <= speed && topo > speed) return speed;
  return topo;
}

export function Trafego({ rx, tx, rxPico, txPico, speed, altura = 180 }: Props) {
  const s = useStyles2(getStyles);
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const [t, setT] = useState<number | null>(null);

  const esc = useMemo(() => {
    // O pico entra na escala: senao a faixa sairia por cima do grafico.
    const valores = [...(rx?.v ?? []), ...(tx?.v ?? []), ...(rxPico?.v ?? []), ...(txPico?.v ?? [])];
    const tempos = [...(rx?.t ?? []), ...(tx?.t ?? [])];
    if (valores.length === 0 || largura < 40) return null;

    const H = altura;
    const PL = 62;
    const PR = 10;
    const PT = 10;
    const PB = 18;

    const vMax = topoTrafego(Math.max(...valores), speed);

    const tMin = Math.min(...tempos);
    const tMax = Math.max(...tempos);
    const span = Math.max(1, tMax - tMin);

    return {
      H, PL, PR, PT, PB, vMax, tMin, tMax, span,
      px: (x: number) => PL + ((x - tMin) / span) * (largura - PL - PR),
      py: (v: number) => H - PB - (v / vMax) * (H - PT - PB),
      xt: (x: number) => tMin + ((x - PL) / Math.max(1, largura - PL - PR)) * span,
    };
  }, [rx, tx, rxPico, txPico, speed, largura, altura]);

  const foco = useMemo(() => {
    if (!esc || t === null) return null;
    const ir = maisProximo(rx, t);
    const it = maisProximo(tx, t);
    const tRef = ir !== undefined ? rx!.t[ir] : it !== undefined ? tx!.t[it] : null;
    if (tRef === null) return null;
    const ipr = maisProximo(rxPico, tRef);
    const ipt = maisProximo(txPico, tRef);
    return {
      t: tRef,
      rx: ir !== undefined ? rx!.v[ir] : undefined,
      tx: it !== undefined ? tx!.v[it] : undefined,
      rxPico: ipr !== undefined ? rxPico!.v[ipr] : undefined,
      txPico: ipt !== undefined ? txPico!.v[ipt] : undefined,
      x: esc.px(tRef),
    };
  }, [esc, t, rx, tx, rxPico, txPico]);

  const hora = (ms: number) => {
    const curto = esc ? esc.span < 2 * 3600_000 : false;
    // Mais de ~um dia na tela: "09:07" sozinho nao diz de QUAL dia. Com a
    // janela de 2d ou 7d do modal, o eixo leva o dia junto.
    if (esc && esc.span > 20 * 3600_000) {
      return new Date(ms).toLocaleString([], {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    }
    return new Date(ms).toLocaleTimeString([], curto
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' });
  };

  const linha = (a?: Amostras) =>
    a && a.v.length && esc
      ? a.v.map((v, i) => `${i ? 'L' : 'M'} ${esc.px(a.t[i]).toFixed(1)} ${esc.py(v).toFixed(1)}`).join(' ')
      : '';
  const area = (a?: Amostras) =>
    a && a.v.length && esc
      ? `${linha(a)} L ${esc.px(a.t[a.t.length - 1]).toFixed(1)} ${esc.H - esc.PB}`
        + ` L ${esc.px(a.t[0]).toFixed(1)} ${esc.H - esc.PB} Z`
      : '';
  const faixa = (pico?: Amostras, media?: Amostras) =>
    esc ? caminhoFaixa(pico, media, esc.px, esc.py) : '';

  const mostraSpeed = !!speed && !!esc && speed <= esc.vMax;
  // Quando a capacidade e o proprio topo, o rotulo acima da linha sairia do
  // SVG — vai pra baixo dela.
  const yCap = esc && mostraSpeed ? esc.py(speed!) : 0;
  const yRotuloCap = esc && yCap < esc.PT + 12 ? yCap + 11 : yCap - 4;

  return (
    <div className={s.caixa} ref={caixa} style={{ height: altura }}>
      {esc && (
        <svg
          width={largura}
          height={esc.H}
          className={s.svg}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setT(esc.xt(e.clientX - r.left));
          }}
          onMouseLeave={() => setT(null)}
          role="img"
          aria-label={`Tráfego: inbound ${formatBitsPerSec(rx?.v[rx.v.length - 1])},`
            + ` outbound ${formatBitsPerSec(tx?.v[tx.v.length - 1])}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = esc.py(esc.vMax * f);
            const rotula = f === 0 || f === 0.5 || f === 1;
            return (
              <g key={f}>
                <line
                  className={rotula ? s.grade : s.gradeFina}
                  x1={esc.PL} x2={largura - esc.PR} y1={y} y2={y}
                />
                {rotula && (
                  <text className={s.rotulo} x={esc.PL - 6} y={y + 3.5} textAnchor="end">
                    {fmtAxisBps(esc.vMax * f)}
                  </text>
                )}
              </g>
            );
          })}

          {mostraSpeed && (
            <>
              <line
                className={s.capacidade}
                x1={esc.PL} x2={largura - esc.PR}
                y1={yCap} y2={yCap}
              />
              <text className={s.rotuloCapac} x={largura - esc.PR} y={yRotuloCap} textAnchor="end">
                capacidade
              </text>
            </>
          )}

          {/* Faixa do pico: da media ate o maior valor do bloco, mais clara
              que a area da media, com o topo pontilhado. Vem antes pra ficar
              por baixo das linhas. */}
          {rxPico && rx && <path d={faixa(rxPico, rx)} fill={COR_RX} fillOpacity={0.1} />}
          {txPico && tx && <path d={faixa(txPico, tx)} fill={COR_TX} fillOpacity={0.1} />}
          {rxPico && (
            <path d={linha(rxPico)} fill="none" stroke={COR_RX} strokeOpacity={0.6}
              strokeWidth={1} strokeDasharray="2 3" />
          )}
          {txPico && (
            <path d={linha(txPico)} fill="none" stroke={COR_TX} strokeOpacity={0.6}
              strokeWidth={1} strokeDasharray="2 3" />
          )}

          {rx && <path d={area(rx)} fill={COR_RX} fillOpacity={0.16} />}
          {rx && <path d={linha(rx)} fill="none" stroke={COR_RX} strokeWidth={1.75} />}
          {tx && <path d={linha(tx)} fill="none" stroke={COR_TX} strokeWidth={1.75} />}

          {foco && (
            <g>
              <line
                className={s.mira}
                x1={foco.x} x2={foco.x} y1={esc.PT} y2={esc.H - esc.PB}
              />
              {foco.rx !== undefined && (
                <circle cx={foco.x} cy={esc.py(foco.rx)} r={3} fill={COR_RX} />
              )}
              {foco.tx !== undefined && (
                <circle cx={foco.x} cy={esc.py(foco.tx)} r={3} fill={COR_TX} />
              )}
            </g>
          )}

          <text className={s.rotulo} x={esc.PL} y={esc.H - 5} textAnchor="start">
            {hora(esc.tMin)}
          </text>
          <text className={s.rotulo} x={largura - esc.PR} y={esc.H - 5} textAnchor="end">
            {hora(esc.tMax)}
          </text>
        </svg>
      )}

      {foco && esc && (
        <div
          className={s.tooltip}
          style={
            // Vira de lado perto da borda direita pra nao sair do cartao.
            foco.x > largura * 0.6
              ? { right: largura - foco.x + 10 }
              : { left: foco.x + 10 }
          }
        >
          <div className={s.tooltipHora}>{hora(foco.t)}</div>
          <div>
            <span style={{ color: COR_RX }}>↓ in</span> {formatBitsPerSec(foco.rx)}
            {foco.rxPico !== undefined && <span className={s.tooltipPico}> · pico {formatBitsPerSec(foco.rxPico)}</span>}
          </div>
          <div>
            <span style={{ color: COR_TX }}>↑ out</span> {formatBitsPerSec(foco.tx)}
            {foco.txPico !== undefined && <span className={s.tooltipPico}> · pico {formatBitsPerSec(foco.txPico)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  caixa: css`position: relative; width: 100%;`,
  svg: css`display: block;`,
  grade: css`stroke: ${theme.colors.border.medium};`,
  gradeFina: css`stroke: ${theme.colors.border.weak}; opacity: 0.5;`,
  rotulo: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 10px;
    fill: ${theme.colors.text.secondary};
  `,
  capacidade: css`
    stroke: ${theme.colors.text.disabled};
    stroke-dasharray: 5 4;
    opacity: 0.7;
  `,
  rotuloCapac: css`
    font-size: 9px;
    fill: ${theme.colors.text.disabled};
    letter-spacing: 0.04em;
  `,
  mira: css`stroke: ${theme.colors.text.primary}; opacity: 0.45;`,
  tooltip: css`
    position: absolute;
    top: 6px;
    z-index: 1;
    padding: ${theme.spacing(0.5, 0.75)};
    pointer-events: none;
    white-space: nowrap;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 11px;
    line-height: 1.5;
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.canvas};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    box-shadow: ${theme.shadows.z2};
  `,
  tooltipHora: css`
    margin-bottom: 2px;
    color: ${theme.colors.text.secondary};
  `,
  tooltipPico: css`color: ${theme.colors.text.secondary};`,
});
