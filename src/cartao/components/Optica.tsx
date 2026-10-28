// components/Optica.tsx — a potencia optica no formato do painel Business Text.
//
// A regua nao tem faixa fixa: as zonas vem dos limiares do proprio transceiver
// (entSensorThreshold), que o template "Cisco 8201 Optical Monitoring" coleta.
// Um SFP+ LR alarma em -14.4 dBm e um ZR em -28 — desenhar os dois na mesma
// escala mostraria um link saudavel no vermelho.
//
// Sem os quatro limiares nao existe regua. Nesse caso so o numero aparece:
// uma barra sem escala convida a ler distancia onde nao ha nenhuma.

import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import * as O from '../utils/optica';

/** As cores dos niveis. Iguais as do resto do painel. */
export const COR_NIVEL: Record<O.NivelOptico, string> = {
  ok: '#00c853',
  warn: '#ffa726',
  alarm: '#ff5252',
  los: '#d500f9',
  nodata: '#8e8e8e',
};

// ------------------------------------------------------------- pilula

export function PilulaOptica({ estado }: { estado: O.Estado }) {
  const s = useStyles2(getStyles);
  const cor = COR_NIVEL[estado.nivel];
  return (
    <span className={s.pilula} style={{ color: cor, borderColor: cor }}>
      {estado.label}
    </span>
  );
}

// ------------------------------------------------------------- regua

function Regua({ d }: { d: O.Direcao }) {
  const s = useStyles2(getStyles);
  const r = O.regua(d);
  if (!r) return null;

  const rotulos = O.rotulosRegua(r);
  const linhaDeRotulos = (linha: 'acima' | 'abaixo') => (
    <div className={s.rotulos}>
      {rotulos.filter((x) => x.linha === linha).map((x) => (
        <span
          key={x.valor + x.nivel}
          className={s.rotuloLimiar}
          style={{
            left: x.pct + '%',
            color: COR_NIVEL[x.nivel],
            transform: ANCORA[x.alinha],
          }}
        >
          {x.valor.toFixed(1)}
        </span>
      ))}
    </div>
  );

  return (
    <div className={s.reguaWrap}>
      {linhaDeRotulos('acima')}
      <div className={s.regua}>
        {r.zonas.map((z, i) => (
          <div
            key={i}
            className={s.zona}
            style={{
              left: z.ini + '%',
              width: Math.max(0, z.fim - z.ini) + '%',
              background: COR_NIVEL[z.nivel],
            }}
          />
        ))}
        {r.marcas.map((m, i) => (
          <div
            key={i}
            className={s.marca}
            style={{ left: m.pct + '%' }}
            title={`${m.titulo}: ${m.valor.toFixed(2)} dBm`}
          />
        ))}
        <div className={s.agulha} style={{ left: r.agulha + '%' }} />
      </div>
      {linhaDeRotulos('abaixo')}
    </div>
  );
}

/** Como o texto se prende ao traco. */
const ANCORA: Record<O.RotuloLimiar['alinha'], string> = {
  inicio: 'translateX(0)',
  meio: 'translateX(-50%)',
  fim: 'translateX(-100%)',
};

// ------------------------------------------------------------- direcao

function LinhaDirecao({ rotulo, d }: { rotulo: 'Rx' | 'Tx'; d?: O.Direcao }) {
  const s = useStyles2(getStyles);
  const e = O.estadoDirecao(d);
  const cor = COR_NIVEL[e.nivel];

  return (
    <div className={s.direcao}>
      <span className={s.dirRotulo}>{rotulo}</span>
      <span className={s.dirValor} style={{ color: cor }}>{O.fmtPotencia(d?.power)}</span>
      <PilulaOptica estado={e} />
      <div className={s.dirRegua} title={tituloLimiares(d)}>{d && <Regua d={d} />}</div>
      {d?.lanes !== undefined && d.lanes > 1 && (
        <span className={s.dirExtra} title="Lanes com sinal / spread entre elas">
          {d.lanes}λ{d.spread !== undefined && ` Δ${d.spread.toFixed(1)}`}
        </span>
      )}
    </div>
  );
}

/** Os quatro limiares em texto. Vive no tooltip da regua: eles nao mudam e
 *  a barra ja mostra a posicao relativa, que e a leitura do dia a dia. Quem
 *  precisa do numero exato esta depurando, e ai para o mouse em cima. */
function tituloLimiares(d?: O.Direcao): string | undefined {
  if (!d) return undefined;
  if (d.al === undefined || d.ah === undefined) return 'Sem limiares do transceiver';
  return `Alarm low ${d.al.toFixed(2)} · Warning low ${d.wl?.toFixed(2) ?? '—'}`
    + ` · Warning high ${d.wh?.toFixed(2) ?? '—'} · Alarm high ${d.ah.toFixed(2)} dBm`;
}

// ------------------------------------------------------------- inventario

/**
 * O transceiver em uma linha: modelo, descricao, fabricante e serial.
 *
 * A descricao ("Cisco SFP 1G 1000BASE-LX Pluggable Optics Module") fica
 * VISIVEL. Eu tinha posto no tooltip por repetir o modelo — mas "SFP-GE-L"
 * so diz algo pra quem decorou o catalogo, e "1000BASE-LX" diz o alcance na
 * hora. Ele pediu pra ver; e o campo mais legivel dos seis.
 *
 * HW Rev e midia ficam no tooltip do modelo: so interessam pra quem esta
 * cruzando com um field notice.
 *
 * O serial e selecionavel com um clique (user-select: all), pra colar num
 * RMA. navigator.clipboard seria mais comodo, mas exige HTTPS, e nada garante
 * que o Grafana esteja servido assim.
 */
function LinhaInventario({ inv }: { inv: O.Inventario }) {
  const s = useStyles2(getStyles);
  const nome = inv.modelo || inv.descricao;
  if (!nome && !inv.vendor && !inv.serial) return null;
  const descricao = inv.modelo && inv.descricao && inv.descricao !== inv.modelo ? inv.descricao : '';

  const dica = [
    inv.hwrev ? `HW rev ${inv.hwrev}` : '',
    inv.midia ? `Mídia: ${inv.midia}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div className={s.inv}>
      {nome && <span className={s.invModelo} title={dica || undefined}>{nome}</span>}
      {descricao && <span className={s.invDescricao} title={descricao}>{descricao}</span>}
      {inv.vendor && <span>{inv.vendor}</span>}
      {inv.serial && (
        <span>
          S/N <span className={s.selecionavel} title="Clique para selecionar">{inv.serial}</span>
        </span>
      )}
    </div>
  );
}

/**
 * A linha do SFP, ou — quando a potencia chegou mas o inventario nao — o
 * aviso de onde procurar.
 *
 * Todo transceiver com DOM tem inventario no Zabbix. Potencia sem modelo e,
 * quase sempre, a query C ausente, em modo Metrics ou com janela curta. Sem
 * este aviso o espaco simplesmente ficava vazio, e nao havia como distinguir
 * "o plugin nao mostra isso" de "o dado nao chegou".
 */
function InventarioOuAviso({ inv }: { inv: O.Inventario }) {
  const s = useStyles2(getStyles);
  const tem = !!(inv.modelo || inv.descricao || inv.vendor || inv.serial);
  if (tem) return <LinhaInventario inv={inv} />;
  return (
    // Tres causas possiveis e o painel nao sabe qual: falta a query C, a
    // janela do dashboard e curta demais (o inventario grava a cada ~5h), ou
    // o template do roteador nao coleta inventario — um ASR9K, por
    // exemplo, nao tem nenhum item de modelo/serial.
    <div className={s.semInv}>
      Sem modelo/serial do SFP. Ou falta a query C (modo Text), ou a janela do dashboard
      é curta — o inventário só é gravado a cada ~5h —, ou o template deste roteador não
      coleta inventário. O <b>Diagnóstico das queries</b> mostra o que chegou.
    </div>
  );
}

// ------------------------------------------------------------- bloco

/**
 * O bloco de uma porta: Rx, Tx e os sensores auxiliares.
 *
 * `embutido` e para quando o bloco ja esta dentro do cartao do link: ali o
 * host e a porta ja aparecem no cabecalho do cartao, e repeti-los aqui era
 * metade do excesso de informacao do modal antigo.
 */
export function BlocoOptico(
  { optica, titulo, embutido, nota }:
  { optica: O.Optica; titulo?: string; embutido?: boolean; nota?: string }
) {
  const s = useStyles2(getStyles);
  const inv = optica.inv;
  const sfp = [inv.vendor, inv.modelo || inv.descricao].filter(Boolean).join(' ');

  // Sem DOM: uma linha so, neutra. Regua, auxiliares e o "LOS" do sensor
  // seriam todos numeros que o modulo nao mediu.
  if (optica.semDom) {
    return (
      <div className={embutido ? s.blocoEmbutido : s.bloco}>
        {nota && <div className={s.nota}>{nota}</div>}
        {embutido && <InventarioOuAviso inv={inv} />}
        <div className={s.semDom}>
          <span className={s.pilula} style={{ color: COR_NIVEL.nodata, borderColor: COR_NIVEL.nodata }}>
            SEM DOM
          </span>
          <span>
            {optica.semDom === 'cobre'
              ? 'Transceptor de cobre/DAC — potência óptica não se aplica.'
              : 'O módulo não reporta sensores (Vcc, temperatura e bias em zero) — o LOS do sensor não é medida.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={embutido ? s.blocoEmbutido : s.bloco}>
      {nota && <div className={s.nota}>{nota}</div>}
      {!embutido && (
        <div className={s.blocoCabec}>
          <span className={s.blocoPorta}>{titulo || optica.porta}</span>
          {sfp && <span className={s.blocoSfp}>{sfp}</span>}
          {inv.midia && <span className={s.blocoTag}>{inv.midia}</span>}
        </div>
      )}
      {embutido && <InventarioOuAviso inv={inv} />}

      <LinhaDirecao rotulo="Rx" d={optica.rx} />
      <LinhaDirecao rotulo="Tx" d={optica.tx} />

      <div className={s.auxLinha}>
        {['Temperature', 'Voltage', 'Current'].map((tipo) => {
          const a = optica.aux[tipo];
          if (!a || a.value === undefined) return null;
          const nivel = O.estadoAux(a);
          return (
            <span key={tipo} className={s.auxItem} style={{ color: COR_NIVEL[nivel] }}>
              <span className={s.auxRotulo}>{ROTULO_AUX[tipo]}</span>
              {O.fmtAux(tipo, a.value)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const ROTULO_AUX: Record<string, string> = {
  Temperature: 'Temp',
  Voltage: 'Vcc',
  Current: 'Bias',
};

const getStyles = (theme: GrafanaTheme2) => ({
  pilula: css`
    display: inline-block;
    padding: 0.05em 0.45em;
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    border: 1px solid currentColor;
    border-radius: 3px;
  `,
  reguaWrap: css`display: flex; flex-direction: column; gap: 2px; width: 100%;`,
  regua: css`
    position: relative;
    height: 10px;
    width: 100%;
    border-radius: 5px;
    overflow: hidden;
    background: ${theme.colors.background.secondary};
  `,
  zona: css`position: absolute; top: 0; bottom: 0; opacity: 0.35;`,
  marca: css`
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: ${theme.colors.text.primary};
    opacity: 0.45;
  `,
  agulha: css`
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: ${theme.colors.text.primary};
    box-shadow: 0 0 0 1px ${theme.colors.background.primary};
  `,
  semDom: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  nota: css`
    margin-bottom: ${theme.spacing(0.5)};
    font-size: 0.75em;
    color: ${theme.colors.text.secondary};
  `,
  rotulos: css`
    position: relative;
    height: 12px;
  `,
  rotuloLimiar: css`
    position: absolute;
    top: 0;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 10px;
    line-height: 12px;
    white-space: nowrap;
    opacity: 0.9;
  `,

  direcao: css`
    display: grid;
    grid-template-columns: 1.6em 7em auto minmax(80px, 1fr) auto;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.4)} 0;
  `,
  dirRotulo: css`
    font-size: 0.8em;
    font-weight: 700;
    color: ${theme.colors.text.secondary};
  `,
  dirValor: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  `,
  dirRegua: css`min-width: 80px;`,
  dirExtra: css`
    font-size: 0.72em;
    white-space: nowrap;
    color: ${theme.colors.text.secondary};
  `,

  bloco: css`
    padding: ${theme.spacing(1, 1.25)};
    background: ${theme.colors.background.secondary};
    border-radius: ${theme.shape.radius.default};
    border: 1px solid ${theme.colors.border.weak};
  `,
  blocoEmbutido: css`
    margin-top: ${theme.spacing(0.75)};
    padding-top: ${theme.spacing(0.75)};
    border-top: 1px solid ${theme.colors.border.weak};
  `,
  blocoCabec: css`
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  blocoPorta: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-weight: 700;
  `,
  blocoSfp: css`
    font-size: 0.8em;
    color: ${theme.colors.text.secondary};
  `,
  blocoTag: css`
    font-size: 0.72em;
    padding: 0.05em 0.4em;
    border-radius: 3px;
    color: ${theme.colors.text.secondary};
    background: ${theme.colors.background.primary};
  `,
  auxLinha: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1.5)};
    margin-top: ${theme.spacing(0.5)};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 0.78em;
  `,
  auxItem: css`display: inline-flex; gap: 0.35em;`,
  inv: css`
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: ${theme.spacing(1.5)};
    margin-bottom: ${theme.spacing(0.5)};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 0.78em;
    color: ${theme.colors.text.secondary};
  `,
  invModelo: css`
    font-weight: 700;
    color: ${theme.colors.text.primary};
    cursor: help;
  `,
  invDescricao: css`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ${theme.typography.fontFamily};
  `,
  semInv: css`
    margin-bottom: ${theme.spacing(0.5)};
    font-size: 0.75em;
    color: ${theme.colors.text.disabled};
  `,
  selecionavel: css`
    user-select: all;
    cursor: text;
    color: ${theme.colors.text.primary};
  `,
  auxRotulo: css`
    color: ${theme.colors.text.disabled};
    font-family: ${theme.typography.fontFamily};
  `,
});
