// components/LinkDetailsModal.tsx — Modal exibido ao clicar numa aresta ou num card.
// • Clique na LINHA → visão geral do link (os dois lados).
// • Clique num CARD de interface → foco naquela interface específica (focusSide).
// Convenção de cores: Inbound = verde, Outbound = azul.
//
// O corpo é o cartão do link do plugin de instituições (src/cartao, cópia fiel
// — não editar): gráfico com janelas 24h/2d/7d/outro período buscadas sob
// demanda, régua e histórico da potência óptica, modelo/serial do SFP. Quando
// a interface não está no formato que o cartão lê ("HOST: Interface X(desc):
// Bits received"), fica a visão antiga.

import React from 'react';
import { createPortal } from 'react-dom';
import { DataFrame, DataQueryRequest } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { LinkEdgeData, LinkStatus, MetricBinding, ModuleInfo, OpticKey } from '../types';
import { formatBitsPerSec, linkUtilization, niceCeil, niceStep, fmtAxisBps, splitIps, canonicalizeIpv6 } from '../utils/format';
import { resolveBindingSeries, resolveBindingDetailed, resolveBindingIdentity, BindingSeries } from '../utils/dataBinding';
import { evalOptical, rxThresholds, txThresholds, formatRange, OpticalLevel } from '../utils/optics';
import { BuscaHistorico, CartaoLink } from '../cartao/components/CartaoLink';
import { acharLink, extrairLinks, soIps } from '../cartao/utils/dados';
import { buscarHistorico } from '../cartao/utils/historico';
import { buscarHistoricoPublico, noDashboardPublico } from '../utils/historicoPublico';
import { classificaSemDom, Direcao, Optica as OpticaCartao } from '../cartao/utils/optica';
import type { Amostras, Estado as EstadoCartao, Link as LinkCartao } from '../cartao/types';

interface Props {
  edgeId: string;
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  /** Séries das queries do painel — usadas pro gráfico histórico */
  series?: DataFrame[];
  /** Pedido da última consulta do painel: as janelas longas do cartão usam
   *  uma query dele como molde (mesmo datasource, grupo e opções). */
  request?: DataQueryRequest;
  /** Fim da janela do dashboard (ms): o "agora" do cartão e onde terminam as
   *  janelas 24h/2d/7d. */
  fimDaJanela?: number;
  /** Foco numa interface específica (clique num card). Ausente = visão geral. */
  focusSide?: 'source' | 'target';
  /** Modo público (internet): só o tráfego — ver semDadosPrivados. */
  publico?: boolean;
  onClose: () => void;
}

const IN_COLOR = '#22c55e';   // Inbound (verde)
const OUT_COLOR = '#3b82f6';  // Outbound (azul)

/** Dados consolidados de um lado (interface) do link. */
interface SideInfo {
  label: string;
  iface?: string;
  ip?: string;
  inbound?: number;
  outbound?: number;
  errors?: number;
  domTemp?: number;
  domVolt?: number;
  domBias?: number;
  domTx?: number;
  domRx?: number;
  optics?: Partial<Record<OpticKey, number>>;
  module?: ModuleInfo;
  inboundBinding?: MetricBinding;
  outboundBinding?: MetricBinding;
  /** Potência Tx/Rx deste lado — o histórico do gráfico de potência quando o
   *  cartão não acha a óptica sozinho (ver opticaDosBindings). */
  domTxBinding?: MetricBinding;
  domRxBinding?: MetricBinding;
  /** Só os bindings DESTE lado, sem espelho: tráfego in, tráfego out,
   *  status, erros. É por eles que o cartão descobre qual interface (host +
   *  nome) mostrar — o espelho apontaria pra interface do roteador vizinho,
   *  e Gi0/0/0/11 existe em todo NCS540. */
  own: Array<MetricBinding | undefined>;
}

function getSide(data: LinkEdgeData, which: 'source' | 'target', label: string): SideInfo {
  if (which === 'source') {
    return {
      own: [data.sourceTrafficUpBinding, data.sourceTrafficDownBinding, data.sourceStatusBinding, data.sourceErrorBinding],
      label,
      iface: data.sourceInterface,
      ip: data.sourceIp,
      inbound: data.sourceTrafficUp ?? data.trafficUp,
      outbound: data.sourceTrafficDown ?? data.trafficDown,
      errors: data.sourceErrors,
      domTemp: data.sourceDomTemp,
      domVolt: data.sourceDomVolt,
      domBias: data.sourceDomBias,
      domTx: data.sourceDomTxPower,
      domRx: data.sourceDomRxPower,
      optics: data.sourceOpticThresholds,
      module: data.sourceModuleInfo,
      domTxBinding: data.sourceDomTxPowerBinding,
      domRxBinding: data.sourceDomRxPowerBinding,
      // Fallback espelhado: num link p2p, o inbound de A é o outbound de B.
      // Permite gráfico mesmo quando só um dos lados tem binding configurado.
      inboundBinding: data.sourceTrafficUpBinding ?? data.trafficUpBinding ?? data.targetTrafficDownBinding,
      outboundBinding: data.sourceTrafficDownBinding ?? data.trafficDownBinding ?? data.targetTrafficUpBinding,
    };
  }
  return {
    own: [data.targetTrafficUpBinding, data.targetTrafficDownBinding, data.targetStatusBinding, data.targetErrorBinding],
    label,
    iface: data.targetInterface,
    ip: data.targetIp,
    inbound: data.targetTrafficUp ?? data.trafficDown,
    outbound: data.targetTrafficDown ?? data.trafficUp,
    errors: data.targetErrors,
    domTemp: data.targetDomTemp,
    domVolt: data.targetDomVolt,
    domBias: data.targetDomBias,
    domTx: data.targetDomTxPower,
    domRx: data.targetDomRxPower,
    optics: data.targetOpticThresholds,
    module: data.targetModuleInfo,
    domTxBinding: data.targetDomTxPowerBinding,
    domRxBinding: data.targetDomRxPowerBinding,
    inboundBinding: data.targetTrafficUpBinding ?? data.trafficDownBinding ?? data.sourceTrafficDownBinding,
    outboundBinding: data.targetTrafficDownBinding ?? data.trafficUpBinding ?? data.sourceTrafficUpBinding,
  };
}

/** Modo público: o lado sem interface, IP, óptica, módulo nem erros — o card
 *  público também não mostra. Fica o tráfego, que é o que a página da
 *  instituição publica. */
function semDadosPrivados(s: SideInfo): SideInfo {
  return {
    ...s, iface: undefined, ip: undefined, errors: undefined,
    domTemp: undefined, domVolt: undefined, domBias: undefined, domTx: undefined, domRx: undefined,
    optics: undefined, module: undefined, domTxBinding: undefined, domRxBinding: undefined,
  };
}

function hasDom(s: SideInfo): boolean {
  return s.domTemp !== undefined || s.domVolt !== undefined || s.domBias !== undefined
    || s.domTx !== undefined || s.domRx !== undefined;
}

/** A interface deste lado no modelo do cartão, achada pela série que os
 *  bindings do lado medem. Devolve também o refId da query de tráfego: é o
 *  molde das janelas longas. */
function cartaoDoLado(series: DataFrame[], links: LinkCartao[], side: SideInfo): { link?: LinkCartao; refId?: string } {
  const ids = side.own.map((b) => resolveBindingIdentity(series, b));
  const refId = (ids[0] ?? ids[1])?.refId || undefined;
  for (const id of ids) {
    if (!id) continue;
    for (const nome of id.names) {
      // Sem "HOST: " no nome (query de um host só), o host vem do label —
      // senão uma interface repetida em dois roteadores não casaria.
      const link = acharLink(links, { serie: nome })
        ?? (id.host ? acharLink(links, { serie: nome, host: id.host }) : undefined);
      if (link) return { link, refId };
    }
  }
  return { refId };
}

/** O estado que o cartão mostra. Quem decide é o mapa: ele já pesa o ping
 *  do equipamento, o operStatus dos DOIS lados, coleta parada e datasource
 *  fora — o cartão só lê o último operStatus desta interface, sem olhar se o
 *  valor é velho. A única exceção é o contrário: o cartão leu esta interface
 *  DOWN e o mapa diz up (lado sem binding de status, ou a regra '>0' lendo
 *  2 como up). Esconder uma queda medida é o erro que não pode acontecer. */
function estadoNoCartao(mapa: LinkStatus, proprio: EstadoCartao): EstadoCartao {
  if (mapa === 'down') return 'down';
  if (mapa === 'unknown') return 'unknown';
  return proprio === 'down' ? 'down' : 'up';
}

/** A óptica do cartão montada com os bindings DESTE lado — os mesmos que o
 *  card da linha mostra. O cartão acha a óptica sozinho pelo nome do item
 *  ("FourHundredGigE0/0/0/0 [desc] - Rx Power MIN (dBm)"), mas na fibra
 *  coerente (DCO) o Zabbix chama a porta pelo controlador, "Optics0/0/0/0", e
 *  ele não casa: o card mostrava a potência e o cartão não. Fica sem lanes e
 *  status do sensor (não há binding pra eles); limiares, módulo e Temp/Vcc/Bias
 *  vêm se estiverem ligados. */
function opticaDosBindings(side: SideInfo, series: DataFrame[]): OpticaCartao | undefined {
  if (side.domTx === undefined && side.domRx === undefined) return undefined;
  const historico = (b?: MetricBinding): Amostras | undefined => {
    const s = resolveBindingSeries(series, b);
    return s ? { t: s.times, v: s.values } : undefined;
  };
  const lim = side.optics ?? {};
  const direcao = (power: number | undefined, b: MetricBinding | undefined, l: Pick<Direcao, 'al' | 'wl' | 'wh' | 'ah'>): Direcao | undefined =>
    power === undefined ? undefined : { power, serie: historico(b), ...l };
  const aux: OpticaCartao['aux'] = {};
  if (side.domTemp !== undefined) aux.Temperature = { value: side.domTemp };
  if (side.domVolt !== undefined) aux.Voltage = { value: side.domVolt };
  if (side.domBias !== undefined) aux.Current = { value: side.domBias };
  const o: OpticaCartao = {
    porta: side.iface ?? '',
    alias: '',
    rx: direcao(side.domRx, side.domRxBinding, { al: lim.rxAlarmLow, wl: lim.rxWarnLow, wh: lim.rxWarnHigh, ah: lim.rxAlarmHigh }),
    tx: direcao(side.domTx, side.domTxBinding, { al: lim.txAlarmLow, wl: lim.txWarnLow, wh: lim.txWarnHigh, ah: lim.txAlarmHigh }),
    aux,
    inv: { modelo: side.module?.model, serial: side.module?.serial, midia: side.module?.mediaType },
  };
  // Módulo sem DOM (cobre, sensor zerado) não vira alarme de LOS — a mesma
  // regra que o cartão aplica à óptica que ele mesmo acha.
  o.semDom = classificaSemDom(o);
  return o;
}

/** Modo público: a description do link tem rota da fibra, par de fibras e
 *  distância ("via ROTA_X 53,54") — fora, com o que o cartão deduz dela.
 *  Fica o tipo. */
function aliasPublico(a: LinkCartao['alias']): LinkCartao['alias'] {
  return {
    ...a, anel: '', ramal: '', radial: '', arco: '', via: '', op: '', vlan: '', pop: '',
    link: '', eqp: '', porta: '', id: '', obs: '',
  };
}

/** O Link do cartão corrigido com o que o mapa sabe e o cartão não. */
function paraCartao(l: LinkCartao, mapa: LinkStatus, series: DataFrame[], side: SideInfo, publico = false): LinkCartao {
  const estado = estadoNoCartao(mapa, l.estado);
  // Tráfego com a última amostra velha: o mapa zera (link sem coleta não pode
  // parecer passando tráfego), o cartão mostraria o último valor. Vale o do
  // mapa, pro uso % não contradizer o card da linha.
  const velho = (b?: MetricBinding) => !!b && resolveBindingDetailed(series, b).state === 'stale';
  // IP: o do próprio cartão (item "Endereço IP" no formato dele) ou, se ele
  // não achou, o do binding de IP deste lado — o que a visão antiga mostrava.
  // Sempre na forma canônica (o Zabbix manda "2001:db8::9606:0:0:0:14").
  const ips = (l.ip?.length ? l.ip : soIps(side.ip)).map(canonicalizeIpv6);
  return {
    ...l,
    estado,
    // "Desde quando" é do estado que o cartão calculou. Trocado o estado, a
    // data seria de outro ("DOWN há 3 dias" de um link que estava UP há 3 dias).
    estadoDesde: estado === l.estado ? l.estadoDesde : undefined,
    rx: velho(side.own[0]) ? 0 : l.rx,
    tx: velho(side.own[1]) ? 0 : l.tx,
    ip: ips.length && !publico ? ips : undefined,
    optica: publico ? undefined : l.optica ?? opticaDosBindings(side, series),
    // O papel do link na description (PRIMARIO/SECUNDARIO) saía solto ao lado
    // do UP, sem dizer de quê — o usuário pediu pra tirar, nos dois modos.
    alias: { ...l.alias, papel: '' },
    ...(publico ? {
      // Nome da interface e do roteador (modelo e local do equipamento) fora,
      // como no card da linha: o título do modal já diz qual ponta é. A busca
      // das janelas longas usa o link original — ver buscarPublico.
      iface: '', host: '',
      descricao: '', alias: { ...aliasPublico(l.alias), papel: '' },
      errosIn: 0, errosOut: 0, descartesIn: 0, descartesOut: 0, // o card público também não mostra
    } : {}),
  };
}

/** Cor do % de uso no cartão: os degraus do selo "% utilizado" da visão
 *  antiga (50 / 80), nas cores do cartão. */
const corUso = (pct?: number): string | undefined =>
  pct === undefined ? undefined : pct >= 80 ? '#ff5252' : pct >= 50 ? '#ffa726' : '#00c853';

export const LinkDetailsModal: React.FC<Props> = ({
  data, sourceLabel, targetLabel, series = [], request, fimDaJanela, focusSide, publico = false, onClose,
}) => {
  const theme = useTheme2();
  const util = linkUtilization(Math.max(data?.trafficUp ?? 0, data?.trafficDown ?? 0), data?.linkSpeed);
  const utilPct = (util * 100).toFixed(1);
  const status = data?.status ?? 'unknown';
  const statusAccent =
    status === 'down' ? '#ef4444' : status === 'warning' ? '#f59e0b' : status === 'up' ? '#22c55e' : '#64748b';

  const src = getSide(data, 'source', sourceLabel);
  const tgt = getSide(data, 'target', targetLabel);
  // O modal SEMPRE mostra uma única interface (nunca os dois lados).
  // Sem lado definido (ex: clique na linha) → origem por padrão.
  const lado = focusSide === 'target' ? tgt : src;
  const focus = publico ? semDadosPrivados(lado) : lado;

  // Séries históricas da interface em foco.
  const inHist = React.useMemo(
    () => resolveBindingSeries(series, focus.inboundBinding),
    [series, focus.inboundBinding]
  );
  const outHist = React.useMemo(
    () => resolveBindingSeries(series, focus.outboundBinding),
    [series, focus.outboundBinding]
  );

  // ── Cartão do link ──────────────────────────────────────────────────────
  // extrairLinks lê o painel inteiro (~30 ms com 4 mil séries): uma vez por
  // refresh, e só com o modal aberto.
  const links = React.useMemo(() => extrairLinks(series), [series]);
  const achado = cartaoDoLado(series, links, focus);
  const cartao = achado.link ? paraCartao(achado.link, status, series, focus, publico) : undefined;
  const agora = fimDaJanela ?? Date.now();

  // Busca das janelas longas com identidade FIXA. O cartão refaz a busca
  // quando a função muda: recriada a cada refresh, uma janela de 7d aberta
  // voltaria ao Zabbix a cada 10s — justamente o peso que ela existe pra evitar.
  const requestRef = React.useRef(request);
  requestRef.current = request;
  const fimRef = React.useRef(agora);
  fimRef.current = agora;
  const refIdRef = React.useRef(achado.refId);
  refIdRef.current = achado.refId;
  // No modo público o link que o cartão devolve vem sem interface e roteador
  // (paraCartao): com ele a busca procuraria host "" e interface "" e voltaria
  // vazia. As duas buscas usam o link original.
  const linkRef = React.useRef(achado.link);
  linkRef.current = achado.link;
  const buscar = React.useCallback<BuscaHistorico>(
    (l, p) => buscarHistorico(requestRef.current, linkRef.current ?? l, p, fimRef.current, refIdRef.current),
    []
  );
  // No dashboard público a busca do cartão (query só da interface) não passa:
  // o visitante anônimo só roda as queries salvas do painel. Ver historicoPublico.
  const buscarPublico = React.useCallback<BuscaHistorico>(
    (l, p) => buscarHistoricoPublico(requestRef.current, linkRef.current ?? l, p, fimRef.current),
    []
  );
  const busca = !request ? undefined : noDashboardPublico() ? buscarPublico : buscar;

  // Cores do quadro. Com o cartão, as do tema do Grafana: o cartão segue o
  // tema, e cartão claro em moldura escura não dá. A visão antiga tem cores
  // escuras fixas no corpo inteiro e fica com o quadro escuro de sempre — no
  // tema claro o texto claro dela sumiria.
  // Com o cartão, o fundo do quadro é o MESMO do cartão (background.secondary):
  // título e cartão viram uma peça só (ver semMoldura).
  const q = cartao
    ? {
      bg: theme.colors.background.secondary, border: theme.colors.border.weak,
      text: theme.colors.text.primary, muted: theme.colors.text.secondary,
      // secondary, não disabled: "disabled" é baixo contraste de propósito e
      // aqui o texto é informação ("↔ link com ...").
      faint: theme.colors.text.secondary, head: theme.colors.background.secondary,
    }
    : {
      bg: '#0f172a', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', faint: '#94a3b8',
      head: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
        // Quem rola é o fundo, não o corpo do modal: o menu do "outro período"
        // abre DENTRO do cartão com position absolute (Grafana 12) e qualquer
        // overflow no caminho o cortaria. margin:auto no quadro centraliza
        // quando cabe e encosta no topo quando não cabe.
        display: 'flex', overflowY: 'auto', padding: '4vh 12px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          margin: 'auto',
          // Com o cartão, largo: o gráfico usa toda a largura que receber. 900 e
          // não 1100: a altura do gráfico é fixa (180, no cartão) e com 1100 ele
          // virava uma faixa achatada. Nunca abaixo de ~640 se houver tela: o
          // menu do "outro período" abre pra direita e não se reposiciona.
          width: cartao ? 'min(900px, 96vw)' : 620, maxWidth: '100%', background: q.bg, border: `1px solid ${q.border}`,
          // A cor do status no topo do quadro — era a borda de cima do cartão
          borderTop: cartao ? `3px solid ${statusAccent}` : undefined,
          borderRadius: 10, color: q.text, fontFamily: 'inherit',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          overflow: cartao ? 'visible' : 'hidden',
        }}
      >
        {/* Faixa de status no topo. Com o cartão, a borda de cima dele faz isso. */}
        {!cartao && <div style={{ height: 4, background: statusAccent }} />}
        {/* Header */}
        <div
          style={{
            padding: cartao ? '12px 18px 6px' : '14px 18px', borderBottom: cartao ? undefined : `1px solid ${q.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            background: q.head, borderRadius: cartao ? '10px 10px 0 0' : undefined,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: q.muted, letterSpacing: 0.4 }}>Detalhes da interface</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{focus.label}</span>
              {/* Com o cartão, a interface já está no cabeçalho dele. */}
              {!cartao && focus.iface && <span style={{ color: '#22d3ee', fontFamily: 'monospace', fontSize: 14 }}>{focus.iface}</span>}
            </div>
            <div style={{ fontSize: 12, color: q.faint, fontWeight: 400, marginTop: 3 }}>
              {/* `lado`, não `focus`: no público o focus é uma cópia sem os dados privados */}
              ↔ link com {lado === src ? targetLabel : sourceLabel}
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnX, color: q.muted, borderColor: q.border }}>✕</button>
        </div>

        {cartao ? (
          <div style={{ padding: '6px 18px 18px' }}>
            {data.statusDetail && <Causa texto={data.statusDetail} cor={statusAccent} corTexto={q.muted} />}
            <div className={semMoldura}>
              <CartaoLink l={cartao} corUso={corUso} agora={agora} buscarHistorico={busca} />
            </div>
          </div>
        ) : (
        <div style={{ padding: 18, maxHeight: '80vh', overflowY: 'auto' }}>
          {data.statusDetail && <Causa texto={data.statusDetail} cor={statusAccent} corTexto={q.muted} />}
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <StatusBadge status={status} />
            <UtilBadge pct={utilPct} util={util} />
            {data.linkSpeed !== undefined && (
              <span style={badgeNeutral}>Capacidade {formatBitsPerSec(data.linkSpeed)}</span>
            )}
          </div>

          {/* Sempre uma única interface: métricas + gráfico no padrão Grafana */}
          <FocusedView side={focus} speed={data.linkSpeed} semErros={publico} />
          {(inHist || outHist) ? (
            <div style={{ marginTop: 16 }}>
              <TrafficChart inbound={inHist} outbound={outHist} speed={data.linkSpeed} title={focus.iface ? `${focus.label} · ${focus.iface}` : focus.label} />
            </div>
          ) : (
            <div style={emptyChart}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>📈</div>
              <div>Sem histórico para exibir</div>
              <div style={{ fontSize: 11, marginTop: 4, color: '#94a3b8' }}>
                Configure os bindings de tráfego desta interface no modo edição.
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/** O cartão traz moldura própria (borda, fundo e espaçamento): dentro do modal
 *  parecia um modal dentro do modal. Aqui o quadro do modal é a moldura. Sem
 *  editar o cartão (cópia fiel): só neutraliza o <section> raiz dele — se a
 *  origem mudar esse elemento, volta a moldura dupla, nada quebra. */
const semMoldura = css`
  & > section {
    border: none;
    padding: 0;
    background: transparent;
  }
`;

/** Por que o status é o que é — a mesma frase do hover no mapa. */
const Causa: React.FC<{ texto: string; cor: string; corTexto: string }> = ({ texto, cor, corTexto }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: corTexto }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flex: 'none' }} />
    {texto}
  </div>
);

/** Visão focada numa única interface (estilo "detalhamento da interface"). */
const FocusedView: React.FC<{ side: SideInfo; speed?: number; semErros?: boolean }> = ({ side, speed, semErros }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Inbound / Outbound / Speed / Erros */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${semErros ? 3 : 4}, 1fr)`, gap: 10 }}>
        <Metric label="↓ Inbound" value={formatBitsPerSec(side.inbound)} color={IN_COLOR} big />
        <Metric label="↑ Outbound" value={formatBitsPerSec(side.outbound)} color={OUT_COLOR} big />
        <Metric label="Speed" value={speed !== undefined ? formatBitsPerSec(speed) : '—'} color="#cbd5e1" big />
        {!semErros && (
          <Metric label="Erros / Descartes" value={side.errors !== undefined ? String(side.errors) : '0'} color={side.errors && side.errors > 0 ? '#ef4444' : '#22c55e'} big />
        )}
      </div>

      {/* Endereços IP (IPv4 em cima, IPv6 embaixo) */}
      {side.ip && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#0b1220', border: '1px solid #33415580', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Endereços IP</div>
            {/* Normalizado, mas NUNCA abreviado: aqui sobra espaço e é onde o
                operador vem buscar o endereço inteiro pra copiar. */}
            {splitIps(side.ip).map((addr, i) => (
              <div key={i} style={{ marginTop: 4, color: '#cbd5e1', fontSize: i === 0 ? 15 : 13, fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {canonicalizeIpv6(addr)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOM Fibra + módulo (se houver) */}
      {(hasDom(side) || side.module) && (
        <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a855f7' }}>🧬 Diagnóstico Óptico (DOM)</span>
            {side.module && (
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                {[side.module.model, side.module.serial && `SN ${side.module.serial}`, side.module.mediaType]
                  .filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {hasDom(side) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <OpticField label="Tx Power" value={side.domTx} level={evalOptical(side.domTx, txThresholds(side.optics))} range={formatRange(txThresholds(side.optics))} identity="#4ade80" />
              <OpticField label="Rx Power" value={side.domRx} level={evalOptical(side.domRx, rxThresholds(side.optics))} range={formatRange(rxThresholds(side.optics))} identity="#60a5fa" />
              <Field label="Temperatura" value={side.domTemp !== undefined ? `${side.domTemp.toFixed(1)} °C` : '—'} mono />
              <Field label="Voltagem" value={side.domVolt !== undefined ? `${side.domVolt.toFixed(2)} V` : '—'} mono />
              <Field label="Bias (laser)" value={side.domBias !== undefined ? `${side.domBias.toFixed(2)} mA` : '—'} mono />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Potência óptica com avaliação pelo limiar real da interface: cor por nível
 *  (alarm vermelho / warn amarelo / normal = cor de identidade) + faixa. */
const OpticField: React.FC<{
  label: string;
  value?: number;
  level?: OpticalLevel;
  range?: string;
  identity: string;
}> = ({ label, value, level, range, identity }) => (
  <div>
    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}{level === 'warn' || level === 'alarm' ? ' ⚠' : ''}
    </div>
    <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: level === 'alarm' ? '#ef4444' : level === 'warn' ? '#facc15' : identity }}>
      {value !== undefined ? `${value.toFixed(2)} dBm` : '—'}
    </div>
    {range && <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>faixa: {range}</div>}
  </div>
);

/** Cartão de métrica reutilizável (estilo do print de referência). bar = 0..100 opcional. */
const Metric: React.FC<{ label: string; value: string; color: string; big?: boolean; mono?: boolean; bar?: number }> = ({ label, value, color, big, mono, bar }) => (
  <div style={{ background: '#0b1220', border: `1px solid ${color}33`, borderRadius: 8, padding: big ? '12px 14px' : '10px 12px' }}>
    <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ marginTop: 4, color, fontSize: big ? 19 : 15, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    {bar !== undefined && (
      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${Math.min(100, Math.max(0, bar))}%`, height: '100%', background: color }} />
      </div>
    )}
  </div>
);

/** Marcador de legenda estilo Grafana (segmento de linha, não bolinha). */
const legendMark = (c: string): React.CSSProperties => ({
  display: 'inline-block', width: 13, height: 3, background: c, borderRadius: 2,
  marginRight: 6, verticalAlign: 'middle',
});

/** Gráfico estilo time series do Grafana: ticks redondos nos dois eixos,
 *  crosshair com tooltip de valores no hover, legenda com "último". */
const TrafficChart: React.FC<{ inbound?: BindingSeries; outbound?: BindingSeries; speed?: number; title: string }> = ({ inbound, outbound, speed, title }) => {
  const [hover, setHover] = React.useState<{
    vx: number; pxLeft: number; flip: boolean; label: string; inV?: number; outV?: number;
  } | null>(null);

  const W = 580, H = 210, PT = 10, PB = 30, PR = 12, PL = 60;
  const all = [...(inbound?.values ?? []), ...(outbound?.values ?? [])];
  if (all.length === 0) return null;
  const tAll = [...(inbound?.times ?? []), ...(outbound?.times ?? [])];
  const peak = Math.max(...all) || 1;
  const vMax = niceCeil(peak * 1.05); // teto redondo → rótulos limpos no eixo
  const tMin = Math.min(...tAll);
  const tMax = Math.max(...tAll);
  const span = Math.max(1, tMax - tMin);
  const px = (t: number) => PL + ((t - tMin) / span) * (W - PL - PR);
  const py = (v: number) => H - PB - (v / vMax) * (H - PT - PB);
  const line = (s?: BindingSeries) =>
    s && s.values.length
      ? s.values.map((v, i) => `${i ? 'L' : 'M'} ${px(s.times[i]).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')
      : '';
  const area = (s?: BindingSeries) =>
    s && s.values.length
      ? `${line(s)} L ${px(s.times[s.times.length - 1]).toFixed(1)} ${H - PB} L ${px(s.times[0]).toFixed(1)} ${H - PB} Z`
      : '';
  const fmtT = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Eixo Y: valores em passos redondos (250 Mb/s, 500 Mb/s...) — estilo Grafana
  const yStep = niceStep(vMax / 5);
  const yVals: number[] = [];
  for (let i = 0; i * yStep <= vMax * 1.001; i++) yVals.push(i * yStep);

  // Eixo X: horários redondos (múltiplos de 1/2/5/15/30 min...)
  const MIN = 60000;
  const ladder = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MIN);
  const xStep = ladder.find((s) => s >= span / 6) ?? ladder[ladder.length - 1];
  const xVals: number[] = [];
  for (let t = Math.ceil(tMin / xStep) * xStep; t <= tMax; t += xStep) xVals.push(t);

  const speedFits = speed !== undefined && speed <= vMax;
  const last = (s?: BindingSeries) => (s && s.values.length ? s.values[s.values.length - 1] : undefined);
  const nearest = (s: BindingSeries | undefined, t: number): number | undefined => {
    if (!s || !s.times.length) return undefined;
    let best = 0, bd = Infinity;
    for (let i = 0; i < s.times.length; i++) {
      const d = Math.abs(s.times[i] - t);
      if (d < bd) { bd = d; best = i; }
    }
    return s.values[best];
  };

  // Crosshair: converte a posição do mouse (px renderizados) pra coordenada do viewBox
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relPx = e.clientX - rect.left;
    const vx = (relPx / rect.width) * W;
    if (vx < PL || vx > W - PR) { setHover(null); return; }
    const t = tMin + ((vx - PL) / (W - PL - PR)) * span;
    setHover({
      vx,
      pxLeft: relPx,
      flip: relPx > rect.width * 0.58,
      label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      inV: nearest(inbound, t),
      outV: nearest(outbound, t),
    });
  };

  return (
    <div style={{ border: '1px solid #1e293b', borderRadius: 8, background: 'rgba(15,23,42,0.6)', padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>{title}</div>
      <div style={{ position: 'relative' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grade horizontal + rótulos Y */}
          {yVals.map((yv) => (
            <g key={`y${yv}`}>
              <line x1={PL} x2={W - PR} y1={py(yv)} y2={py(yv)} stroke="rgba(255,255,255,0.06)" />
              <text x={PL - 6} y={py(yv) + 3} textAnchor="end" fontSize={9.5} fill="#94a3b8" fontFamily="monospace">{fmtAxisBps(yv)}</text>
            </g>
          ))}
          {/* Grade vertical + rótulos X (horários redondos) */}
          {xVals.map((t) => (
            <g key={`x${t}`}>
              <line x1={px(t)} x2={px(t)} y1={PT} y2={H - PB} stroke="rgba(255,255,255,0.04)" />
              <text x={px(t)} y={H - PB + 13} textAnchor="middle" fontSize={9.5} fill="#94a3b8" fontFamily="monospace">{fmtT(t)}</text>
            </g>
          ))}
          {/* Áreas + linhas (verde inbound ao fundo, azul outbound por cima) */}
          {/* Só o inbound recebe preenchimento: com as duas áreas pintadas as
              curvas se embolavam. Sem fill, a linha do outbound corre POR CIMA
              da área verde e as duas leituras ficam separáveis num relance. */}
          {inbound && <path d={area(inbound)} fill="rgba(34,197,94,0.25)" />}
          {inbound && <path d={line(inbound)} fill="none" stroke={IN_COLOR} strokeWidth={3} />}
          {outbound && <path d={line(outbound)} fill="none" stroke={OUT_COLOR} strokeWidth={3} />}
          {speedFits && (
            <line x1={PL} x2={W - PR} y1={py(speed!)} y2={py(speed!)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 5" />
          )}
          {/* Eixo base */}
          <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="rgba(255,255,255,0.15)" />
          {/* Crosshair */}
          {hover && (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={hover.vx} x2={hover.vx} y1={PT} y2={H - PB} stroke="#94a3b8" strokeWidth={0.8} />
              {hover.inV !== undefined && <circle cx={hover.vx} cy={py(hover.inV)} r={3.2} fill={IN_COLOR} stroke="#0b1220" strokeWidth={1} />}
              {hover.outV !== undefined && <circle cx={hover.vx} cy={py(hover.outV)} r={3.2} fill={OUT_COLOR} stroke="#0b1220" strokeWidth={1} />}
            </g>
          )}
        </svg>
        {/* Tooltip do crosshair (estilo Grafana) */}
        {hover && (
          <div
            style={{
              position: 'absolute', top: 6, left: hover.pxLeft,
              transform: hover.flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
              background: '#1b2537', border: '1px solid #334155', borderRadius: 6,
              padding: '7px 10px', pointerEvents: 'none', minWidth: 158, zIndex: 5,
              boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600, marginBottom: 5 }}>{hover.label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}><span style={legendMark(IN_COLOR)} />Inbound</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(hover.inV)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 11, marginTop: 3 }}>
              <span style={{ color: '#94a3b8' }}><span style={legendMark(OUT_COLOR)} />Outbound</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(hover.outV)}</span>
            </div>
          </div>
        )}
      </div>
      {/* Legenda com último valor */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: '#94a3b8', marginTop: 8, paddingLeft: 4 }}>
        <span><span style={legendMark(IN_COLOR)} />Inbound <span style={{ color: '#94a3b8' }}>último:</span> <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(last(inbound))}</span></span>
        <span><span style={legendMark(OUT_COLOR)} />Outbound <span style={{ color: '#94a3b8' }}>último:</span> <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(last(outbound))}</span></span>
        {speed !== undefined && <span><span style={{ color: '#94a3b8' }}>– –</span> Speed <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{formatBitsPerSec(speed)}</span></span>}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({ label, value, mono, color }) => (
  <div>
    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ marginTop: 2, fontFamily: mono ? 'monospace' : 'inherit', color: color ?? '#e2e8f0', fontSize: mono ? 13 : 14, fontWeight: 600 }}>
      {value}
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    up: { bg: '#14532d', fg: '#22c55e', label: 'UP' },
    down: { bg: '#7f1d1d', fg: '#ef4444', label: 'DOWN' },
    warning: { bg: '#78350f', fg: '#f59e0b', label: 'WARNING' },
    unknown: { bg: '#334155', fg: '#cbd5e1', label: 'UNKNOWN' },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {s.label}
    </span>
  );
};

const UtilBadge: React.FC<{ pct: string; util: number }> = ({ pct, util }) => {
  const color = util > 0.8 ? '#f59e0b' : util > 0.5 ? '#facc15' : '#22d3ee';
  return (
    <span style={{ background: '#1e293b', color, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: `1px solid ${color}50` }}>
      {pct}% utilizado
    </span>
  );
};

const badgeNeutral: React.CSSProperties = {
  background: '#1e293b', color: '#94a3b8', padding: '4px 12px', borderRadius: 5,
  fontSize: 11, fontWeight: 600, border: '1px solid #334155',
};
const btnX: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
};
const emptyChart: React.CSSProperties = {
  marginTop: 16, padding: 14, border: '1px dashed #334155', borderRadius: 6,
  background: 'rgba(30, 41, 59, 0.4)', textAlign: 'center', color: '#94a3b8', fontSize: 12,
};
