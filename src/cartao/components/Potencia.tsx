// components/Potencia.tsx — historico da potencia optica, Rx e Tx.
//
// DOIS GRAFICOS EMPILHADOS, nao duas linhas no mesmo. Rx e Tx tem limiares
// diferentes (num SFP LR, Rx alarma em -22.9 e Tx em -13.5), e as faixas de
// alarme/warning no fundo so fazem sentido pra uma direcao por vez. No mesmo
// eixo, uma das curvas estaria sempre desenhada sobre as faixas da outra.
//
// Juntos somam a mesma altura do grafico de trafego (180px), pra que alternar
// entre os dois no cartao nao faca o modal pular.
//
// Sentinelas (-99 LOS, -60 lane down) nao entram na linha: viram um buraco e
// uma marca vermelha no rodape. Ver trechosPotencia() em optica.ts.

import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, useTheme2 } from '@grafana/ui';
import * as O from '../utils/optica';
import { COR_NIVEL } from './Optica';
import { maisProximo } from './Trafego';
import { useLargura } from './useLargura';

export function GraficoPotencia({ optica }: { optica: O.Optica }) {
  return (
    <>
      <CurvaPotencia rotulo="Rx" d={optica.rx} altura={84} rodape={false} />
      <CurvaPotencia rotulo="Tx" d={optica.tx} altura={96} rodape />
    </>
  );
}

interface CurvaProps {
  rotulo: 'Rx' | 'Tx';
  d?: O.Direcao;
  altura: number;
  /** So o grafico de baixo leva o eixo de tempo — os dois compartilham a janela. */
  rodape: boolean;
}

const PL = 62;
const PR = 10;
const PT = 6;

function CurvaPotencia({ rotulo, d, altura, rodape }: CurvaProps) {
  const s = useStyles2(getStyles);
  const theme = useTheme2();
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const [t, setT] = useState<number | null>(null);

  const PB = rodape ? 16 : 4;
  const serie = d?.serie;

  const esc = useMemo(() => {
    if (!d || !serie || largura < 40) return null;
    const faixa = O.faixaPotencia(d);
    if (!faixa) return null;
    const { lo, hi } = faixa;
    const tMin = serie.t[0];
    const tMax = serie.t[serie.t.length - 1];
    const span = Math.max(1, tMax - tMin);
    const plotH = altura - PT - PB;

    return {
      lo, hi, tMin, tMax, span,
      px: (x: number) => PL + ((x - tMin) / span) * (largura - PL - PR),
      // Limita a faixa: limiar fora da escala desenha na borda, nao fora do SVG.
      py: (v: number) => PT + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotH,
      xt: (x: number) => tMin + ((x - PL) / Math.max(1, largura - PL - PR)) * span,
    };
  }, [d, serie, largura, altura, PB]);

  const partes = useMemo(() => (serie ? O.trechosPotencia(serie) : null), [serie]);

  const foco = useMemo(() => {
    if (!esc || !serie || t === null) return null;
    const i = maisProximo(serie, t);
    if (i === undefined) return null;
    return { t: serie.t[i], v: serie.v[i], x: esc.px(serie.t[i]) };
  }, [esc, serie, t]);

  const hora = (ms: number) => {
    const curto = esc ? esc.span < 2 * 3600_000 : false;
    return new Date(ms).toLocaleTimeString([], curto
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' });
  };

  const faixas = esc && d && d.al !== undefined && d.wl !== undefined
    && d.wh !== undefined && d.ah !== undefined
    ? [
      { de: esc.lo, ate: d.al, nivel: 'alarm' as const },
      { de: d.al, ate: d.wl, nivel: 'warn' as const },
      { de: d.wl, ate: d.wh, nivel: 'ok' as const },
      { de: d.wh, ate: d.ah, nivel: 'warn' as const },
      { de: d.ah, ate: esc.hi, nivel: 'alarm' as const },
    ]
    : [];

  const limiares = d
    ? ([
      ['al', d.al, 'alarm'], ['wl', d.wl, 'warn'], ['wh', d.wh, 'warn'], ['ah', d.ah, 'alarm'],
    ] as Array<[string, number | undefined, 'alarm' | 'warn']>)
    : [];

  const linha = (a: { t: number[]; v: number[] }) =>
    esc ? a.v.map((v, i) => `${i ? 'L' : 'M'} ${esc.px(a.t[i]).toFixed(1)} ${esc.py(v).toFixed(1)}`).join(' ') : '';

  const corAtual = COR_NIVEL[O.estadoDirecao(d).nivel];

  // O container com o ref existe SEMPRE, inclusive sem serie: se ele so
  // aparecesse quando o dado chega, o ResizeObserver ja teria rodado com
  // ref nulo e a largura ficaria 0 pra sempre — o grafico nunca desenharia.
  return (
    <div className={s.caixa} ref={caixa} style={{ height: altura }}>
      {!serie && <div className={s.vazio}>{rotulo}: sem histórico nesta janela</div>}
      {esc && (
        <svg
          width={largura}
          height={altura}
          className={s.svg}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setT(esc.xt(e.clientX - r.left));
          }}
          onMouseLeave={() => setT(null)}
          role="img"
          aria-label={`Potência ${rotulo}: ${O.fmtPotencia(d?.power)}`}
        >
          {faixas.map((f, i) => {
            const y1 = esc.py(f.ate);
            const y2 = esc.py(f.de);
            if (y2 - y1 <= 0) return null;
            return (
              <rect
                key={i}
                x={PL} width={largura - PL - PR} y={y1} height={y2 - y1}
                fill={COR_NIVEL[f.nivel]}
                fillOpacity={f.nivel === 'ok' ? 0.07 : 0.12}
              />
            );
          })}

          {limiares.map(([k, v, nivel]) => v !== undefined && v >= esc.lo && v <= esc.hi && (
            <line
              key={k}
              x1={PL} x2={largura - PR} y1={esc.py(v)} y2={esc.py(v)}
              stroke={COR_NIVEL[nivel]} strokeOpacity={0.55} strokeDasharray="3 3"
            />
          ))}

          {[esc.hi, esc.lo].map((v) => (
            <text key={v} className={s.rotulo} x={PL - 6} y={esc.py(v) + (v === esc.hi ? 8 : -1)} textAnchor="end">
              {v} dBm
            </text>
          ))}

          <text className={s.nome} x={4} y={PT + (altura - PT - PB) / 2 + 4}>{rotulo}</text>

          {partes?.trechos.map((tr, i) => (
            <path
              key={i}
              d={linha(tr)}
              fill="none"
              stroke={theme.colors.text.primary}
              strokeWidth={1.6}
            />
          ))}

          {partes?.eventos.map((ev, i) => (
            <rect
              key={i}
              x={esc.px(ev.t) - 1.5} width={3}
              y={altura - PB - 5} height={5}
              fill={ev.tipo === 'los' ? COR_NIVEL.los : COR_NIVEL.alarm}
            >
              <title>{ev.tipo === 'los' ? 'LOS' : 'Lane down'} · {hora(ev.t)}</title>
            </rect>
          ))}

          {foco && (
            <g>
              <line className={s.mira} x1={foco.x} x2={foco.x} y1={PT} y2={altura - PB} />
              {!O.ehSentinela(foco.v) && (
                <circle cx={foco.x} cy={esc.py(foco.v)} r={3} fill={corAtual} />
              )}
            </g>
          )}

          {rodape && (
            <>
              <text className={s.rotulo} x={PL} y={altura - 4} textAnchor="start">{hora(esc.tMin)}</text>
              <text className={s.rotulo} x={largura - PR} y={altura - 4} textAnchor="end">{hora(esc.tMax)}</text>
            </>
          )}
        </svg>
      )}

      {foco && esc && (
        <div
          className={s.tooltip}
          style={foco.x > largura * 0.6 ? { right: largura - foco.x + 10 } : { left: foco.x + 10 }}
        >
          <span className={s.tooltipHora}>{hora(foco.t)}</span>
          {' '}{rotulo}{' '}
          <b style={{ color: O.ehSentinela(foco.v) ? COR_NIVEL.los : undefined }}>
            {O.fmtPotencia(foco.v)}
          </b>
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  caixa: css`position: relative; width: 100%;`,
  svg: css`display: block;`,
  rotulo: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 10px;
    fill: ${theme.colors.text.secondary};
  `,
  nome: css`
    font-size: 11px;
    font-weight: 700;
    fill: ${theme.colors.text.secondary};
  `,
  mira: css`stroke: ${theme.colors.text.primary}; opacity: 0.45;`,
  vazio: css`
    display: flex;
    align-items: center;
    height: 100%;
    padding-left: ${PL}px;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.disabled};
  `,
  tooltip: css`
    position: absolute;
    top: 4px;
    z-index: 1;
    padding: ${theme.spacing(0.25, 0.75)};
    pointer-events: none;
    white-space: nowrap;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 11px;
    color: ${theme.colors.text.primary};
    background: ${theme.colors.background.canvas};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    box-shadow: ${theme.shadows.z2};
  `,
  tooltipHora: css`color: ${theme.colors.text.secondary};`,
});
