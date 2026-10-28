// components/CartaoLink.tsx — tudo de um link num cartao: identidade, grafico
// de trafego com as janelas longas, legenda, optica e inventario do SFP.
//
// Separado do InstModal pra poder ser levado a outro plugin (o
// network-topology) como copia fiel: o cartao so precisa de um Link (ver
// utils/dados.ts) e, pras janelas 24h/2d/7d/outro periodo, de uma funcao de
// busca (utils/historico.ts).
//
// UM CARTAO POR LINK, e nao uma tabela mais duas secoes paralelas. A versao
// anterior listava o mesmo link tres vezes — na tabela, no grafico e na
// optica — e o analista tinha que cruzar as tres pelo nome da interface.
//
// O que some quando nao ha o que dizer: erros e descartes so aparecem se
// forem diferentes de zero, ponta remota so se for conhecida. Numa rede
// saudavel isso e a maioria das linhas, e "0 / 0" repetido nao informa nada.

import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2, TimeRange } from '@grafana/data';
import { RadioButtonGroup, TimeRangeInput, useStyles2 } from '@grafana/ui';
import { Estado, Link } from '../types';
import { fmtDesde, formatBitsPerSec } from '../utils/format';
import { usoPct } from '../utils/dados';
import { HistoricoLongo, PeriodoHistorico } from '../utils/historico';
import { amostragemDe, fmtAmostragem, picoAcrescenta, resumo } from '../utils/serie';
import { BlocoOptico } from './Optica';
import { GraficoPotencia } from './Potencia';
import { Trafego } from './Trafego';

type Vista = 'trafego' | 'potencia';

const VISTAS: Array<{ label: string; value: Vista }> = [
  { label: 'Tráfego', value: 'trafego' },
  { label: 'Potência', value: 'potencia' },
];

/** Janela do grafico de trafego. "Painel" usa o que o painel ja tem; as
 *  outras buscam so esta interface, sob demanda. "livre" e o periodo do
 *  seletor de tempo (o mesmo do dashboard), escolhido pelo analista. */
type Janela = 'painel' | '24h' | '2d' | '7d' | 'livre';
const JANELAS: Array<{ label: string; value: Janela }> = [
  { label: 'Painel', value: 'painel' },
  { label: '24h', value: '24h' },
  { label: '2d', value: '2d' },
  { label: '7d', value: '7d' },
];
const HORAS: Record<'24h' | '2d' | '7d', number> = { '24h': 24, '2d': 48, '7d': 168 };

/** Nenhum periodo livre escolhido: o seletor mostra so o placeholder. */
const SEM_PERIODO: TimeRange = {
  from: dateTime(null), to: dateTime(null), raw: { from: dateTime(null), to: dateTime(null) },
};

export type BuscaHistorico = (l: Link, p: PeriodoHistorico) => Promise<HistoricoLongo>;

export const COR: Record<Estado, string> = {
  up: '#00e676', down: '#ff5252', partial: '#ffa726', unknown: '#8e8e8e',
};
export const COR_RX = '#00c853';
export const COR_TX = '#2196f3';

/**
 * A descricao do link, na forma mais util pra quem esta olhando.
 *
 * Formato novo: o caminho interpretado mais a observacao (o par de fibras,
 * "FO29,30"), que nao aparecia em lugar nenhum.
 *
 * Formato antigo: o anel deduzido e o TEXTO CRU do roteador. A deducao do
 * parser legado joga fora o que nao sabe classificar — em "INSTX via Rua A
 * Fo1,2 10,9KM Principal" sobravam so "ANEL_A · via RUA_A", e o
 * par de fibras e a distancia sumiam. O texto cru e a verdade.
 */
function descricaoLink(l: Link): string {
  const a = l.alias;
  if (!a.padronizado) {
    return [a.anel, l.descricao].filter(Boolean).join(' · ');
  }
  const partes: string[] = [];
  if (a.anel) partes.push(a.anel);
  if (a.arco) partes.push('Arco ' + a.arco);
  if (a.via) partes.push('via ' + a.via);
  if (a.op) partes.push('operadora ' + a.op);
  if (a.vlan) partes.push('vlan ' + a.vlan);
  if (a.obs) partes.push(a.obs);
  return partes.join(' · ');
}

/** Por que a capacidade esta vazia — as duas causas pedem correcoes
 *  diferentes, e sem isso as duas apareciam como o mesmo "—". */
function tituloCapac(l: Link): string | undefined {
  if (l.speed) return undefined;
  if (l.speed === 0) {
    return 'O item de Speed chegou com valor 0 — o agente SNMP está '
      + 'reportando ifHighSpeed=0 para esta interface.';
  }
  return 'O item de Speed não chegou nesta janela de tempo. O Zabbix costuma '
    + 'gravar Speed só quando o valor muda, então em janelas curtas não há '
    + 'amostra. Use uma query separada só para Speed, com Relative time maior.';
}

/** Aviso de que a optica e da porta fisica, e quem mais esta nela. */
function notaHerdada(l: Link): string | undefined {
  const h = l.opticaHerdada;
  if (!h) return undefined;
  const quem = h.outrosNoPainel === 0
    ? ''
    : h.outrosNoPainel === 1
      ? ' — compartilhada com mais 1 serviço deste painel'
      : ` — compartilhada com mais ${h.outrosNoPainel} serviços deste painel`;
  return `Óptica da porta física ${h.porta}${quem}. O estado é da fibra, não só deste serviço.`;
}

/** Onde o cabo termina do outro lado. Vazio quando a description nao diz. */
function pontaRemota(l: Link): string {
  const { eqp, porta } = l.alias;
  if (eqp && porta) return `${eqp} ${porta}`;
  return eqp || porta || '';
}

/** Tudo de um link num lugar so: identidade, grafico, numeros e optica. */
export function CartaoLink({ l, corUso, agora, buscarHistorico }: {
  l: Link; corUso: (p?: number) => string | undefined; agora: number;
  buscarHistorico?: BuscaHistorico;
}) {
  const s = useStyles2(getStyles);
  const pct = usoPct(l);
  const cor = COR[l.estado];
  const via = descricaoLink(l);
  const remota = pontaRemota(l);
  // O seletor so aparece quando ha historico optico. Um botao que abre um
  // grafico vazio ensina o analista a nao clicar nele.
  const temPotencia = !l.optica?.semDom && !!(l.optica?.rx?.serie || l.optica?.tx?.serie);

  // Sempre abre no trafego: e a pergunta mais comum, e a potencia fica a um
  // clique quando precisa — como ele pediu, nao precisa ficar visivel.
  const [escolhida, setVista] = useState<Vista>('trafego');
  // Se a serie optica some num refresh, o seletor some junto: a vista volta
  // a ser trafego, senao o cartao ficava num meio-termo sem a linha de janela
  // e sem a legenda, e so saia fechando o modal.
  const vista: Vista = escolhida === 'potencia' && temPotencia ? 'potencia' : 'trafego';

  // Janela longa sob demanda: uma query so deste host e desta interface, na
  // hora que alguem pede. O dashboard continua leve na janela curta.
  const [janela, setJanela] = useState<Janela>('painel');
  const [livre, setLivre] = useState<TimeRange | null>(null);
  const [longo, setLongo] = useState<HistoricoLongo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const periodo: PeriodoHistorico | null =
      janela === 'painel' ? null
        : janela === 'livre' ? (livre ? { de: livre.from.valueOf(), ate: livre.to.valueOf() } : null)
          : { horas: HORAS[janela] };
    if (!periodo || !buscarHistorico) {
      setLongo(null);
      setErro(null);
      setBuscando(false);
      return;
    }
    let vivo = true; // fechou o modal ou trocou de janela no meio: descarta
    setBuscando(true);
    setErro(null);
    // Sem isso, enquanto o 7d carrega, a legenda mostraria a media do 2d.
    setLongo(null);
    buscarHistorico(l, periodo)
      .then((h) => { if (vivo) setLongo(h); })
      .catch((e) => { if (vivo) setErro(String(e?.message ?? e)); })
      .finally(() => { if (vivo) setBuscando(false); });
    return () => { vivo = false; };
    // So a identidade do link: o objeto `l` muda a cada refresh do painel, e
    // refazer a busca de 7 dias a cada 30s seria o peso que isto existe pra
    // evitar. (buscarHistorico tem identidade fixa — ver LinksPanel.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janela, livre, l.host, l.iface, buscarHistorico]);

  // O "x" do seletor limpa o periodo e volta pra janela do painel.
  const escolheLivre = (r: TimeRange) => {
    if (!r.from?.isValid() || !r.to?.isValid()) {
      setLivre(null);
      setJanela('painel');
      return;
    }
    setLivre(r);
    setJanela('livre');
  };

  const serie = janela === 'painel' ? l.historico : longo ?? undefined;
  // O pico so existe nas janelas buscadas, e so vale quando os pontos sao
  // blocos: com 1 ponto por coleta, o pico de cada ponto e ele mesmo.
  const picoBuscado = janela === 'painel' ? undefined : longo?.pico;
  const pico = picoBuscado
    && (picoAcrescenta(serie?.rx, picoBuscado.rx) || picoAcrescenta(serie?.tx, picoBuscado.tx))
    ? picoBuscado : undefined;
  const qual = janela === 'livre' ? 'o período' : janela;
  const amostragem = amostragemDe(serie?.rx ?? serie?.tx);
  // "Atual" e o ultimo ponto do grafico, como o Current do MRTG. Num periodo
  // livre que termina no passado (25/09 a 27/09), ele nao e atual.
  const rotuloUltimo = janela === 'livre' && livre && !String(livre.raw.to).startsWith('now')
    ? 'Último' : 'Atual';

  return (
    <section className={s.cartao} style={{ borderTopColor: cor }}>
      <header className={s.cabec}>
        <span className={s.badge} style={{ color: cor, borderColor: cor }}>
          {l.estado === 'unknown' ? '?' : l.estado.toUpperCase()}
        </span>
        {/* So no DOWN: "up ha 3 dias" e ruido num cartao que ja esta verde. */}
        {l.estado === 'down' && l.estadoDesde && (
          <span className={s.desde} style={{ color: cor }} title={new Date(l.estadoDesde.t).toLocaleString('pt-BR')}>
            {fmtDesde(l.estadoDesde, agora)}
          </span>
        )}
        <span className={s.iface}>{l.iface}</span>
        {l.alias.papel && <span className={s.papel}>{l.alias.papel}</span>}
        <span className={s.host}>
          {l.host}
          {l.ip?.map((ip) => (
            <span
              key={ip}
              className={s.ip}
              title="IP da interface no roteador (lado do backbone). Clique para selecionar."
            >
              {ip}
            </span>
          ))}
        </span>
      </header>

      <div className={s.linhaVia}>
        <span className={s.via} title={l.descricao}>{via}</span>
        {temPotencia && (
          <RadioButtonGroup size="sm" options={VISTAS} value={vista} onChange={setVista} />
        )}
      </div>

      {/* A janela do grafico fica numa linha propria, A ESQUERDA: no Grafana 12
          o menu do seletor de tempo abre pra direita a partir do gatilho e nao
          se reposiciona sozinho — na direita do cartao ele sairia da tela. */}
      {vista === 'trafego' && buscarHistorico && (
        <div className={s.linhaPeriodo}>
          <RadioButtonGroup size="sm" options={JANELAS} value={janela} onChange={setJanela} />
          <div className={s.periodo}>
            <TimeRangeInput
              value={janela === 'livre' && livre ? livre : SEM_PERIODO}
              onChange={escolheLivre}
              placeholder="outro período"
              clearable
              showIcon
            />
          </div>
        </div>
      )}

      {vista === 'potencia' && l.optica ? (
        <div className={s.moldura}>
          <GraficoPotencia optica={l.optica} />
        </div>
      ) : janela !== 'painel' && buscando ? (
        <div className={s.semGrafico}>buscando {qual} desta interface…</div>
      ) : janela !== 'painel' && erro ? (
        <div className={s.semGrafico} title={erro}>não deu pra buscar {qual}: {erro}</div>
      ) : serie?.rx || serie?.tx ? (
        <div className={s.moldura}>
          <Trafego rx={serie?.rx} tx={serie?.tx} rxPico={pico?.rx} txPico={pico?.tx} speed={l.speed} />
        </div>
      ) : (
        <div
          className={s.semGrafico}
          title={janela === 'painel' ? 'A query devolveu menos de dois pontos nesta janela.' : undefined}
        >
          {janela === 'painel' ? 'sem histórico'
            : janela === 'livre' ? 'sem dados desta interface no período'
              : `sem dados de ${janela} desta interface`}
        </div>
      )}

      {vista === 'trafego' ? (
        <>
          {/* Como no MRTG: Atual / Media / Maximo de cada sentido, na janela
              do grafico. O maximo vem do pico quando ha (o maior valor de
              verdade), e nao do maior ponto de media. */}
          <div className={s.legenda}>
            {([['rx', '↓ in', COR_RX, l.rx], ['tx', '↑ out', COR_TX, l.tx]] as const).map(([d, seta, c, agoraVal]) => {
              const r = resumo(serie?.[d], pico?.[d]);
              return (
                <React.Fragment key={d}>
                  <span style={{ color: c }}>{seta}</span>
                  <span><span className={s.rotuloLeg}>{rotuloUltimo}</span>{formatBitsPerSec(r.ultimo ?? agoraVal)}</span>
                  <span><span className={s.rotuloLeg}>Média</span>{formatBitsPerSec(r.media)}</span>
                  <span><span className={s.rotuloLeg}>Máx</span>{formatBitsPerSec(r.maximo)}</span>
                </React.Fragment>
              );
            })}
          </div>
          <div className={s.rodapeGrafico}>
            <span title={'Amostragem: o espaço entre os pontos do gráfico, medido nos dados. '
              + 'Em janela curta cada ponto é uma coleta do Zabbix (a média do tráfego naquele '
              + 'intervalo). Em janela longa cada ponto é um bloco de coletas: a linha é a média '
              + 'do bloco e a faixa clara, o pico.'}>
              {amostragem !== undefined && `amostragem de ${fmtAmostragem(amostragem)}`}
              {pico && ' · faixa clara = pico de cada bloco'}
            </span>
            <Capacidade l={l} pct={pct} corUso={corUso} />
          </div>
        </>
      ) : (
        <div className={s.numeros}>
          <span><span style={{ color: COR_RX }}>↓ in</span> {formatBitsPerSec(l.rx)}</span>
          <span><span style={{ color: COR_TX }}>↑ out</span> {formatBitsPerSec(l.tx)}</span>
          <Capacidade l={l} pct={pct} corUso={corUso} />
        </div>
      )}

      {(l.errosIn + l.errosOut > 0 || l.descartesIn + l.descartesOut > 0 || remota) && (
        <div className={s.extras}>
          {l.errosIn + l.errosOut > 0 && (
            <span style={{ color: '#ff5252' }}>erros {l.errosIn} / {l.errosOut}</span>
          )}
          {l.descartesIn + l.descartesOut > 0 && (
            <span style={{ color: '#ffa726' }}>descartes {l.descartesIn} / {l.descartesOut}</span>
          )}
          {remota && <span title="Ponta remota">↔ {remota}</span>}
        </div>
      )}

      {l.optica && <BlocoOptico optica={l.optica} embutido nota={notaHerdada(l)} />}
    </section>
  );
}

/** Capacidade e uso do link — o mesmo nas duas vistas do rodape. */
function Capacidade({ l, pct, corUso }: {
  l: Link; pct?: number; corUso: (p?: number) => string | undefined;
}) {
  const s = useStyles2(getStyles);
  return (
    <span className={s.capac} title={tituloCapac(l)}>
      {l.speed ? formatBitsPerSec(l.speed).replace('/s', '') : '—'}
      {pct !== undefined && (
        <b style={{ color: corUso(pct) }}> {pct.toFixed(1)}%</b>
      )}
    </span>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  cartao: css`
    padding: ${theme.spacing(1.25, 1.5)};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-top-width: 2px;
    border-radius: ${theme.shape.radius.default};
  `,
  cabec: css`
    display: flex;
    align-items: baseline;
    gap: ${theme.spacing(1)};
  `,
  badge: css`
    padding: 0.1em 0.45em;
    font-size: 0.75em;
    font-weight: 700;
    letter-spacing: 0.04em;
    border: 1px solid currentColor;
    border-radius: 3px;
  `,
  desde: css`
    font-size: 0.75em;
    font-weight: 600;
    white-space: nowrap;
  `,
  iface: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-weight: 700;
  `,
  papel: css`
    font-size: 0.72em;
    letter-spacing: 0.04em;
    color: ${theme.colors.text.secondary};
  `,
  host: css`
    display: inline-flex;
    align-items: baseline;
    gap: ${theme.spacing(1)};
    margin-left: auto;
    font-size: 0.78em;
    color: ${theme.colors.text.secondary};
  `,
  ip: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    color: ${theme.colors.text.primary};
    user-select: all;
    cursor: text;
  `,
  linhaVia: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    min-height: 28px;
    margin: ${theme.spacing(0.25)} 0 ${theme.spacing(0.5)};
  `,
  linhaPeriodo: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(0.75)};
  `,
  // O gatilho do seletor de tempo tem a altura de um input (32px), e os
  // botoes ao lado sao "sm" (24px). So o gatilho: o menu aberto fica como e.
  periodo: css`
    & > div > button {
      height: ${theme.spacing(theme.components.height.sm)};
      line-height: 1;
      font-size: ${theme.typography.bodySmall.fontSize};
    }
  `,
  // Descriptions antigas passam de 60 caracteres. Corta com reticencias em
  // vez de empurrar o seletor Trafego|Potencia pra fora; o texto inteiro
  // fica no title.
  via: css`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,

  moldura: css`
    padding: ${theme.spacing(0.5)};
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
  `,
  semGrafico: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 180px;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.disabled};
    border: 1px dashed ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
  `,
  numeros: css`
    display: flex;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(0.75)};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: 600;
  `,
  capac: css`color: ${theme.colors.text.secondary};`,
  // Colunas alinhadas entre a linha do in e a do out, como no MRTG. Em tela
  // estreita rola dentro do cartao em vez de estourar o modal.
  legenda: css`
    display: grid;
    grid-template-columns: max-content repeat(3, max-content);
    column-gap: ${theme.spacing(2.5)};
    row-gap: ${theme.spacing(0.25)};
    margin-top: ${theme.spacing(0.75)};
    overflow-x: auto;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: 600;
    white-space: nowrap;
  `,
  rotuloLeg: css`
    margin-right: ${theme.spacing(0.75)};
    font-weight: 400;
    color: ${theme.colors.text.secondary};
  `,
  rodapeGrafico: css`
    display: flex;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(0.5)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  extras: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1.5)};
    margin-top: ${theme.spacing(0.5)};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 0.75em;
    color: ${theme.colors.text.secondary};
  `,
});
