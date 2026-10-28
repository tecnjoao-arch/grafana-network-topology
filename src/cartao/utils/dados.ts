// utils/dados.ts — transforma as series do Zabbix no modelo do painel.
//
// O datasource Zabbix devolve uma serie por metrica, com o nome no formato
//
//   HOST: Interface <iface>(<description>): <metrica>
//
// Aqui isso vira: agrupa por host+interface para montar cada Link, e depois
// agrupa os links por SIGLA para montar cada Instituicao.
//
// A chave da instituicao e so a sigla, de proposito. Ver o comentario em
// types.ts: e o que faz os dois links de uma instituicao (que estao em aneis
// diferentes) caírem no mesmo card.

import { DataFrame, Field, FieldType } from '@grafana/data';
import { lerAlias } from './alias';
import { splitIps } from './format';
import * as O from './optica';
import { Amostras, Desde, Estado, Instituicao, Link } from '../types';

/** Metricas que o painel entende, na ordem em que sao testadas. */
const METRICAS: Array<[keyof Numeros, RegExp]> = [
  ['rx', /bits received|bits recebidos/i],
  ['tx', /bits sent|bits enviados/i],
  ['speed', /\bspeed\b/i],
  ['estado', /operational status|status operacional/i],
  ['errosIn', /inbound packets with errors/i],
  ['errosOut', /outbound packets with errors/i],
  ['descartesIn', /inbound packets discarded/i],
  ['descartesOut', /outbound packets discarded/i],
];

/** As metricas escalares — as unicas que METRICAS sabe classificar. Separadas
 *  do historico pra que `medidas[chave] = numero` continue sendo checavel. */
interface Numeros {
  rx?: number; tx?: number; speed?: number; estado?: number;
  errosIn?: number; errosOut?: number;
  descartesIn?: number; descartesOut?: number;
}

interface Medidas extends Numeros {
  /** Historico, so das duas metricas que viram grafico. */
  serieRx?: Amostras; serieTx?: Amostras;
  /** Do status, so o que importa: desde quando ele e o que e. */
  estadoDesde?: Desde;
}

/** "HOST: Interface Gi0/0/0/13(DESC): Bits received" desmontado. */
interface Serie {
  host: string;
  iface: string;
  descricao: string;
  metrica: string;
}

/** "HOST: Interface Gi0/0/0/13(DESC): Bits received" — o item de trafego. */
const NOME_RE = /^(?:([^:]+):\s+)?Interface\s+([^(]+)\((.*)\):\s+(.+)$/;

function parseNomeSerie(nome: string, hostLabel?: string): Serie | null {
  const m = String(nome).match(NOME_RE);
  if (!m) return null;
  return {
    host: (m[1] || hostLabel || '').trim(),
    iface: m[2].trim(),
    descricao: m[3].trim(),
    metrica: m[4].trim(),
  };
}

/** Separa o "HOST: " do resto, para o parser optico ver so o nome do item. */
function separaHost(nome: string, hostLabel?: string): { host: string; item: string } {
  const s = String(nome);
  // "ROUTER-01: TenGigE0/0/0/7 [ALIAS] - Rx Power MIN (dBm)" — o primeiro ":"
  // e o do host, mas "TenGigE0/0/0/7: Module Model" nao tem host nenhum.
  const m = s.match(/^([^:[\]]+):\s+(.+)$/);
  if (m && O.parseNomeOptico(m[2])) {
    return { host: m[1].trim(), item: m[2].trim() };
  }
  return { host: (hostLabel || '').trim(), item: s.trim() };
}

/**
 * Item de texto no formato do trafego que carrega o IP da interface:
 * "Interface Gi0/0/0/12(INSTX ...): Endereço IP". E o IP do lado do PoP —
 * o do roteador nessa interface, nao o da instituicao.
 */
const RE_METRICA_IP = /^(endere[cç]o ip|ip address(es)?)$/i;

/** So o que e endereco de verdade. O item as vezes traz "Sem IP" ou vazio —
 *  isso nao pode aparecer no cartao como se fosse um IP. */
export function soIps(bruto?: string): string[] {
  const v4 = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
  const v6 = /^[0-9a-f]*:[0-9a-f:.]+(\/\d{1,3})?$/i;
  return splitIps(bruto).filter((p) => v4.test(p) || v6.test(p));
}

function classificaMetrica(metrica: string): keyof Numeros | null {
  for (const [chave, re] of METRICAS) if (re.test(metrica)) return chave;
  return null;
}

/** Um campo pode ser um array simples ou um Vector com .get(). */
function valorEm(field: Field, i: number): unknown {
  return field.values.get ? field.values.get(i) : (field.values as unknown as unknown[])[i];
}

/** Ultimo valor nao nulo de um campo numerico. */
function ultimoValor(field: Field): number | undefined {
  for (let i = field.values.length - 1; i >= 0; i--) {
    const v = valorEm(field, i);
    if (v !== null && v !== undefined && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

/**
 * A serie inteira, pareada com o campo de tempo do frame — para o grafico.
 *
 * So RX e TX guardam historico. Guardar de todas as metricas multiplicaria a
 * memoria do painel por oito sem nada na tela usando.
 *
 * Com menos de dois pontos devolve undefined: um ponto nao e um grafico, e
 * desenhar uma linha reta a partir dele diria ao operador que o trafego
 * esteve constante, que e uma afirmacao que o dado nao sustenta.
 */
function amostrasDe(tempo: Field | undefined, field: Field, minimo = 2): Amostras | undefined {
  if (!tempo) return undefined;
  const n = Math.min(tempo.values.length, field.values.length);
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    const ti = valorEm(tempo, i);
    const vi = valorEm(field, i);
    if (ti === null || ti === undefined) continue;
    if (vi === null || vi === undefined || Number.isNaN(Number(vi))) continue;
    t.push(Number(ti));
    v.push(Number(vi));
  }
  return t.length >= minimo ? { t, v } : undefined;
}

/**
 * Uma amostra de Operational status: 1 e up, 2 e down. O que cai no meio e
 * MEDIA de um bucket — trend do Zabbix numa janela longa, ou consolidacao do
 * datasource com poucos pontos — e quer dizer que houve troca dentro dele.
 */
function classeStatus(v: number): 'up' | 'down' | 'misto' {
  if (Math.abs(v - 1) < 0.25) return 'up';
  if (Math.abs(v - 2) < 0.25) return 'down';
  return 'misto';
}

/**
 * Desde quando o status esta no valor atual, pela serie da janela.
 *
 * Anda pra tras a partir do ultimo ponto enquanto a classe for a mesma. O
 * primeiro ponto da sequencia e quando o estado atual foi visto pela primeira
 * vez — com o "discard unchanged" do template, e o ponto gravado na troca.
 *
 * Se a sequencia vai ate o comeco da janela, a troca foi antes dela:
 * `noMinimo`. Se o ultimo ponto e misto, nao ha estado atual limpo pra datar.
 */
export function desdeDe(am: Amostras | undefined): Desde | undefined {
  if (!am || !am.t.length) return undefined;
  const n = am.t.length;
  const atual = classeStatus(am.v[n - 1]);
  if (atual === 'misto') return undefined;
  let i = n - 1;
  while (i > 0 && classeStatus(am.v[i - 1]) === atual) i--;
  if (i === 0) return { t: am.t[0], noMinimo: true, fonte: 'janela' };
  // O ponto anterior e diferente: a troca foi entre t[i-1] e t[i]. Se ele e
  // misto, a troca aconteceu DENTRO daquele bucket — e dele que se data.
  return {
    t: classeStatus(am.v[i - 1]) === 'misto' ? am.t[i - 1] : am.t[i],
    noMinimo: false,
    fonte: 'janela',
  };
}

/**
 * Um problema como o datasource Zabbix entrega no modo Problems: um objeto
 * por problema, num campo "Problems" (confirmado em problemsHandler.ts do
 * grafana-zabbix v6.3.0). `timestamp` e o clock do Zabbix, em segundos;
 * `hosts` e `items` vem do trigger.get, com `name` nos dois.
 */
interface ProblemaZabbix {
  timestamp?: number | string;
  name?: string;
  hosts?: Array<{ name?: string; host?: string }>;
  items?: Array<{ name?: string }>;
}

/** O Zabbix manda 1 = up, 2 = down. Sem dado NAO vira up.
 *
 *  Essa regra veio de um incidente real no plugin de topologia: o mapa ficava
 *  verde quando a serie sumia, porque "sem erro" era tratado como "ok". Aqui
 *  ausencia de dado e sempre 'unknown', que o card mostra em cinza. */
function estadoDe(v?: number): Estado {
  if (v === undefined) return 'unknown';
  if (v === 1) return 'up';
  if (v === 2) return 'down';
  return 'unknown';
}

/** Ultimo valor de um campo, numerico ou texto (o inventario e string). */
function ultimoQualquer(field: Field): number | string | undefined {
  const vals = field.values as unknown as Array<number | string | null>;
  const n = field.values.length;
  for (let i = n - 1; i >= 0; i--) {
    const v = field.values.get ? field.values.get(i) : vals[i];
    if (v !== null && v !== undefined && v !== '') return v as number | string;
  }
  return undefined;
}

/**
 * O que cada query entregou, e o que o plugin fez com cada serie.
 *
 * Existe porque o painel depende de NOMES de item, e o parque tem templates
 * diferentes com nomes diferentes (o inventario do NCS540 e do 8201 estao ao
 * contrario um do outro). Quando algo nao aparece, a pergunta e sempre "a
 * query trouxe? com que nome?" — e isso estava fora do alcance de quem so ve
 * o painel.
 */
export interface DiagQuery {
  series: number;
  trafego: number;
  optica: number;
  inventario: number;
  ip: number;
  /** Problemas do Zabbix casados com uma interface pelo item de status. */
  problemas: number;
  /** Nome reconhecido, mas sem nenhum valor na janela de tempo. */
  semValor: number;
  /** Primeiros nomes que o plugin nao soube classificar. */
  ignoradas: string[];
  totalIgnoradas: number;
}
export type Diagnostico = Map<string, DiagQuery>;

const MAX_IGNORADAS = 8;

function diagDe(diag: Diagnostico | undefined, refId?: string): DiagQuery | undefined {
  if (!diag) return undefined;
  const k = refId || '?';
  if (!diag.has(k)) {
    diag.set(k, {
      series: 0, trafego: 0, optica: 0, inventario: 0, ip: 0, problemas: 0,
      semValor: 0, ignoradas: [], totalIgnoradas: 0,
    });
  }
  return diag.get(k);
}

function ignora(d: DiagQuery | undefined, nome: string) {
  if (!d) return;
  d.totalIgnoradas++;
  if (d.ignoradas.length < MAX_IGNORADAS && !d.ignoradas.includes(nome)) d.ignoradas.push(nome);
}

/** Le os frames e devolve um Link por interface encontrada.
 *
 *  Duas familias de item chegam juntas e sao casadas por host+interface:
 *  o trafego ("Interface X(desc): Bits received") e a optica
 *  ("X [alias] - Rx Power MIN (dBm)"), que vem de outro LLD. */
export function extrairLinks(frames: DataFrame[], diag?: Diagnostico): Link[] {
  const porInterface = new Map<string, { serie: Serie; medidas: Medidas }>();
  const opticas = new Map<string, O.Optica>();
  // IP vem de item TEXT, na query C. Guardado a parte: se criasse um Link,
  // uma query Text sem host faria aparecer um link fantasma sem trafego.
  const ips = new Map<string, string>();

  const pegaOptica = (host: string, porta: string, alias: string): O.Optica => {
    const k = host + '||' + porta;
    if (!opticas.has(k)) opticas.set(k, { porta, alias, aux: {}, inv: {} });
    const o = opticas.get(k)!;
    if (alias && !o.alias) o.alias = alias;
    return o;
  };

  /** Grava um valor optico no transceiver certo. `serie` so e chamada pra
   *  potencia — os outros campos nao guardam historico. */
  const registraOptico = (
    host: string, oi: O.ItemOptico, valor: number | string, serie?: () => Amostras | undefined
  ) => {
    const o = pegaOptica(host, oi.porta, oi.alias);
    if (oi.kind === 'dir' && oi.dir) {
      const campo = O.campoDirecao(oi.campo);
      if (!campo) return;
      const chave = oi.dir === 'Rx' ? 'rx' : 'tx';
      if (!o[chave]) o[chave] = {};
      (o[chave] as unknown as Record<string, number>)[campo] = Number(valor);
      // Historico so da potencia: os limiares nao mudam, e lanes/status
      // nao tem grafico que valha o custo de memoria.
      if (campo === 'power' && serie) {
        const am = serie();
        if (am) o[chave]!.serie = am;
      }
    } else if (oi.kind === 'aux' && oi.tipo) {
      const campo = O.campoAux(oi.campo);
      if (!campo) return;
      if (!o.aux[oi.tipo]) o.aux[oi.tipo] = {};
      (o.aux[oi.tipo] as unknown as Record<string, number>)[campo] = Number(valor);
    } else if (oi.kind === 'inv') {
      const campo = O.campoInventario(oi.campo);
      if (campo) o.inv[campo] = String(valor);
    }
  };

  // Inicio de cada problema de status, por host+interface. Guarda o mais
  // antigo quando ha mais de um (o problema reaberto nao apaga a queda).
  const inicioProblema = new Map<string, number>();
  const registraProblema = (p: ProblemaZabbix): boolean => {
    const ts = Number(p?.timestamp);
    if (!ts) return false;
    const t = ts < 1e11 ? ts * 1000 : ts; // o clock do Zabbix e em segundos
    const hosts = new Set<string>();
    for (const h of p.hosts ?? []) {
      if (h?.name) hosts.add(String(h.name).trim());
      if (h?.host) hosts.add(String(h.host).trim());
    }
    if (!hosts.size) hosts.add('');
    let casou = false;
    for (const it of p.items ?? []) {
      // O nome do item descoberto e o mesmo da query A:
      // "Interface Gi0/0/0/11(CTAV ...): Operational status". So o de status
      // conta — "uso alto" e "erros" tambem viram problema, mas nao queda.
      const s = parseNomeSerie(String(it?.name ?? ''));
      if (!s || classificaMetrica(s.metrica) !== 'estado') continue;
      hosts.forEach((host) => {
        const k = host + '||' + s.iface;
        const antes = inicioProblema.get(k);
        if (antes === undefined || t < antes) inicioProblema.set(k, t);
      });
      casou = true;
    }
    return casou;
  };

  for (const frame of frames) {
    const d = diagDe(diag, frame.refId);

    // Query de Problems: um campo so, "Problems", com os objetos do Zabbix.
    const colProblemas = frame.fields.find((f) =>
      f.name === 'Problems' || (f.config?.custom as { type?: string } | undefined)?.type === 'problems');
    if (colProblemas) {
      for (let i = 0; i < colProblemas.values.length; i++) {
        const p = valorEm(colProblemas, i) as ProblemaZabbix;
        if (d) d.series++;
        if (registraProblema(p)) {
          if (d) d.problemas++;
        } else {
          ignora(d, String(p?.name ?? '(problema sem nome)'));
        }
      }
      continue;
    }

    // O host pode vir como label do frame em vez de prefixo do nome.
    const hostLabel = frame.fields.find((f) => f.labels?.host)?.labels?.host;
    const tempo = frame.fields.find((f) => f.type === FieldType.time);

    // Query Text com "Format as: Table": uma linha por item, colunas
    // Host / Item / Key / Last value. Serie temporal comum tem um campo
    // "Value", mas nunca um "Item" — e isso que separa os dois formatos.
    const colItem = frame.fields.find((f) => /^item$/i.test(f.name));
    const colValor = frame.fields.find((f) => /^(last )?value$/i.test(f.name));
    if (colItem && colValor) {
      const colHost = frame.fields.find((f) => /^host$/i.test(f.name));
      for (let i = 0; i < colItem.values.length; i++) {
        const nomeItem = String(valorEm(colItem, i) ?? '');
        if (d) d.series++;
        const valor = valorEm(colValor, i);
        const host = (colHost ? String(valorEm(colHost, i) ?? '') : '').trim();

        const s = parseNomeSerie(nomeItem, host);
        const ehIp = !!s && RE_METRICA_IP.test(s.metrica);
        const oi = ehIp ? null : O.parseNomeOptico(nomeItem);
        if (!ehIp && !oi) { ignora(d, nomeItem); continue; }
        if (valor === null || valor === undefined || valor === '') { if (d) d.semValor++; continue; }

        if (ehIp) {
          if (d) d.ip++;
          ips.set(s!.host + '||' + s!.iface, String(valor));
        } else {
          if (d) { if (oi!.kind === 'inv') d.inventario++; else d.optica++; }
          registraOptico(host, oi!, valor as number | string);
        }
      }
      continue;
    }

    for (const field of frame.fields) {
      // O campo de tempo nao e uma serie. Sem este corte ele caia no ramo
      // optico pelo frame.name e gravava o TIMESTAMP como potencia; so dava
      // certo porque o campo de valor vem depois e sobrescreve. Uma
      // transformation que invertesse a ordem mostraria 1.7e12 dBm.
      if (field.type === FieldType.time) continue;
      if (d) d.series++;

      const nome = field.config?.displayNameFromDS || field.name || frame.name || '';
      // O backend Go poe labels.host EM CADA campo de valor. O do frame e so
      // o fallback: se varios itens viessem num frame, o host do primeiro
      // contaminaria os outros e dois roteadores virariam um link so.
      const hostDoCampo = field.labels?.host ?? hostLabel;

      // --- texto no formato de trafego (IP da interface)
      if (field.type === FieldType.string) {
        const s = parseNomeSerie(nome, hostDoCampo) ?? parseNomeSerie(frame.name || '', hostDoCampo);
        if (s) {
          if (RE_METRICA_IP.test(s.metrica)) {
            const v = ultimoQualquer(field);
            if (v === undefined) {
              if (d) d.semValor++;
            } else {
              if (d) d.ip++;
              ips.set(s.host + '||' + s.iface, String(v));
            }
          } else {
            ignora(d, nome);
          }
          continue;
        }
      }

      // --- trafego
      if (field.type === FieldType.number) {
        const serie = parseNomeSerie(nome, hostDoCampo)
          ?? parseNomeSerie(frame.name || '', hostDoCampo);
        if (serie) {
          const chaveMetrica = classificaMetrica(serie.metrica);
          if (!chaveMetrica) {
            // "Inbound utilization", "Duplex status"... reconhecidos como
            // interface, mas o painel nao usa.
            ignora(d, nome);
            continue;
          }
          const k = serie.host + '||' + serie.iface;
          if (!porInterface.has(k)) porInterface.set(k, { serie, medidas: {} });
          const alvo = porInterface.get(k)!;
          if (!alvo.serie.descricao) alvo.serie = serie;
          const v = ultimoValor(field);
          if (v === undefined) {
            if (d) d.semValor++;
          } else {
            if (d) d.trafego++;
            alvo.medidas[chaveMetrica] = v;
          }

          if (chaveMetrica === 'rx' || chaveMetrica === 'tx') {
            const am = amostrasDe(tempo, field);
            if (am) alvo.medidas[chaveMetrica === 'rx' ? 'serieRx' : 'serieTx'] = am;
          }
          // Um ponto so ja basta: diz "ha mais de" desde ele.
          if (chaveMetrica === 'estado') {
            alvo.medidas.estadoDesde = desdeDe(amostrasDe(tempo, field, 1));
          }
          continue;
        }
      }

      // --- optica (inclui o inventario, que e texto)
      //
      // O inventario do SFP e value_type TEXT no Zabbix, entao vem por uma
      // query em modo Text — e nesse modo o nome do item costuma estar no
      // frame, com o field chamado so "Value". Por isso as duas fontes sao
      // tentadas, como ja e feito no ramo de trafego.
      let { host, item } = separaHost(nome, hostDoCampo);
      let oi = O.parseNomeOptico(item);
      if (!oi && frame.name && frame.name !== nome) {
        ({ host, item } = separaHost(frame.name, hostDoCampo));
        oi = O.parseNomeOptico(item);
      }
      if (!oi) {
        ignora(d, nome !== 'Value' ? nome : frame.name || nome);
        continue;
      }

      const valor = ultimoQualquer(field);
      if (valor === undefined) {
        if (d) d.semValor++;
        continue;
      }
      if (d) { if (oi.kind === 'inv') d.inventario++; else d.optica++; }
      registraOptico(host, oi, valor, () => amostrasDe(tempo, field));
    }
  }

  // Itens TEXT (inventario) nao trazem label de host, e o prefixo "HOST: "
  // so aparece quando a query pega mais de um host (confirmado no codigo do
  // grafana-zabbix). Com a variable de PoP num host so, o inventario chega
  // sem host e a potencia chega com host (pelo label, no backend Go) — e os
  // dois nunca se juntavam. Se so um transceiver com host conhecido tem
  // aquela porta, o sem-host e dele.
  opticas.forEach((orfa, k) => {
    if (!k.startsWith('||')) return;
    const donos: O.Optica[] = [];
    opticas.forEach((o, k2) => {
      if (!k2.startsWith('||') && O.mesmaInterface(o.porta, orfa.porta)) donos.push(o);
    });
    if (donos.length !== 1) return;
    O.mesclaOptica(donos[0], orfa);
    opticas.delete(k);
  });

  // So da pra decidir depois de juntar potencia, auxiliares e inventario,
  // que chegam em series separadas e em qualquer ordem.
  opticas.forEach((o) => { o.semDom = O.classificaSemDom(o); });

  const achaOptica = (host: string, iface: string): O.Optica | undefined => {
    let achada: O.Optica | undefined;
    opticas.forEach((o, k) => {
      if (k.split('||')[0] === host && O.mesmaInterface(o.porta, iface)) achada = o;
    });
    return achada;
  };

  const links: Link[] = [];
  const herdadas: Link[] = [];
  porInterface.forEach(({ serie, medidas }) => {
    // A optica usa o ifName completo; o item de trafego as vezes abrevia.
    // Casamento exato primeiro; se a interface for subinterface e nao houver
    // sensor com o nome dela (nunca ha — o transceiver mora na fisica),
    // herda da porta fisica.
    let optica = achaOptica(serie.host, serie.iface);
    let opticaHerdada = false;
    if (!optica) {
      const fisica = O.portaFisica(serie.iface);
      if (fisica) {
        optica = achaOptica(serie.host, fisica);
        opticaHerdada = !!optica;
      }
    }

    const link: Link = {
      host: serie.host,
      iface: serie.iface,
      descricao: serie.descricao,
      alias: lerAlias(serie.descricao),
      estado: estadoDe(medidas.estado),
      estadoDesde: medidas.estadoDesde,
      // Sem valor fica sem valor: o mesmo principio do estado (sem dado nao
      // vira up). Com "?? 0" um link sem coleta aparecia como ocioso.
      rx: medidas.rx,
      tx: medidas.tx,
      speed: medidas.speed,
      errosIn: medidas.errosIn ?? 0,
      errosOut: medidas.errosOut ?? 0,
      descartesIn: medidas.descartesIn ?? 0,
      descartesOut: medidas.descartesOut ?? 0,
      historico: medidas.serieRx || medidas.serieTx
        ? { rx: medidas.serieRx, tx: medidas.serieTx }
        : undefined,
      optica,
    };
    links.push(link);
    if (opticaHerdada) herdadas.push(link);
  });

  // O inicio do problema no Zabbix vale mais que a serie: e a hora exata da
  // queda, e nao depende de quanto tempo o dashboard mostra — com "Last 6
  // hours" tudo que caiu antes virava "ha mais de 6h".
  //
  // Casamento exato por host+interface. Sem host de um dos lados, so o
  // problema sem host serve: Gi0/0/0/11 existe em todo NCS540, e casar so
  // pela interface poria a queda de um roteador no link de outro.
  for (const l of links) {
    if (l.estado !== 'down') continue;
    // Exato, sempre: link sem host cai em '||iface' sozinho, e e o unico que
    // pode casar com problema sem host. O fallback que havia aqui dava a
    // hora de um problema sem host a link fora de QUALQUER roteador.
    const t = inicioProblema.get(l.host + '||' + l.iface);
    if (t !== undefined) l.estadoDesde = { t, noMinimo: false, fonte: 'zabbix' };
  }

  // Quantos links do painel estao pendurados em cada transceiver. So da pra
  // contar depois que todos foram casados.
  const usos = new Map<O.Optica, number>();
  for (const l of links) if (l.optica) usos.set(l.optica, (usos.get(l.optica) ?? 0) + 1);
  for (const l of herdadas) {
    l.opticaHerdada = { porta: l.optica!.porta, outrosNoPainel: usos.get(l.optica!)! - 1 };
  }

  // IP: casamento exato por host+interface. Sem host (query Text com um PoP
  // so, sem label), vale a mesma regra do inventario: so se a interface for
  // unica no painel — senao o IP de um roteador iria pro link de outro.
  const porIface = new Map<string, number>();
  for (const l of links) porIface.set(l.iface, (porIface.get(l.iface) ?? 0) + 1);
  for (const l of links) {
    let bruto = ips.get(l.host + '||' + l.iface);
    if (bruto === undefined && porIface.get(l.iface) === 1) bruto = ips.get('||' + l.iface);
    const lista = soIps(bruto);
    if (lista.length) l.ip = lista;
  }

  return links;
}

function unicos(vals: Array<string | undefined>): string[] {
  return Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
}

/**
 * Os links que entram no total de trafego da instituicao.
 *
 * A sub trafega DENTRO da porta fisica: o contador da Te0/0/0/21 ja inclui o
 * da Te0/0/0/21.202. Com as duas na mesma instituicao (dois servicos no mesmo PoP), o
 * total contava o trafego da sub duas vezes. Se a fisica esta ali, a sub sai
 * da soma — a mesma regra do ranking de uso. Ela continua no card e no modal.
 */
function semSubDuplicada(ls: Link[]): Link[] {
  const presentes = new Set(ls.map((l) => l.host + '||' + l.iface));
  return ls.filter((l) => {
    const fisica = l.iface.replace(/\.\d+$/, '');
    return fisica === l.iface || !presentes.has(l.host + '||' + fisica);
  });
}

/** Soma o que tem medida. Nenhum valor medido: sem total, e nao zero. */
function somaMedida(vals: Array<number | undefined>): number | undefined {
  const medidos = vals.filter((v): v is number => v !== undefined);
  return medidos.length ? medidos.reduce((s, v) => s + v, 0) : undefined;
}

/** Agrupa os links por instituicao. A chave e a sigla, so a sigla. */
export function agruparPorInstituicao(links: Link[], tipos: string[]): Instituicao[] {
  const porSigla = new Map<string, Link[]>();

  for (const l of links) {
    if (tipos.length && !tipos.includes(l.alias.tipo)) continue;
    const sigla = l.alias.sigla || '(sem sigla)';
    if (!porSigla.has(sigla)) porSigla.set(sigla, []);
    porSigla.get(sigla)!.push(l);
  }

  const insts: Instituicao[] = [];
  porSigla.forEach((ls, sigla) => {
    ls.sort((a, b) => a.host.localeCompare(b.host) || a.iface.localeCompare(b.iface));

    const up = ls.filter((l) => l.estado === 'up').length;
    const down = ls.filter((l) => l.estado === 'down').length;

    let estado: Estado;
    if (down === ls.length) estado = 'down';
    else if (down > 0) estado = 'partial';
    else if (up === ls.length) estado = 'up';
    else estado = 'unknown';

    // Pior estado optico da instituicao, so quando ha DOM coletado.
    let optica: { sev: number; label: string } | undefined;
    for (const l of ls) {
      // Modulo sem DOM reporta LOS o tempo todo; nao e alarme.
      if (!l.optica || l.optica.semDom) continue;
      for (const d of [l.optica.rx, l.optica.tx]) {
        const e = O.estadoDirecao(d);
        if (e.nivel === 'nodata') continue;
        if (!optica || e.sev > optica.sev) optica = { sev: e.sev, label: e.label };
      }
    }

    // Fora: desde que caiu o ULTIMO link (foi quando o servico parou).
    // Sem redundancia: desde que caiu o PRIMEIRO (foi quando a protecao
    // acabou). Link fora sem data nao entra na conta — nao da pra dizer.
    let desde: Desde | undefined;
    if (estado === 'down' || estado === 'partial') {
      const datas = ls.filter((l) => l.estado === 'down' && l.estadoDesde).map((l) => l.estadoDesde!);
      if (datas.length) {
        datas.sort((a, b) => a.t - b.t);
        desde = estado === 'down' ? datas[datas.length - 1] : datas[0];
      }
    }

    insts.push({
      sigla,
      links: ls,
      optica,
      desde,
      aneis: unicos(ls.map((l) => l.alias.anel)),
      operadoras: unicos(ls.map((l) => l.alias.op)),
      pops: unicos(ls.map((l) => l.host)),
      estado,
      up,
      total: ls.length,
      rx: somaMedida(semSubDuplicada(ls).map((l) => l.rx)),
      tx: somaMedida(semSubDuplicada(ls).map((l) => l.tx)),
      erros: ls.reduce((s, l) => s + l.errosIn + l.errosOut, 0),
      descartes: ls.reduce((s, l) => s + l.descartesIn + l.descartesOut, 0),
      legados: ls.filter((l) => !l.alias.padronizado).length,
    });
  });

  return insts;
}

/** A palavra ao lado do "up/total" no card. UP so com algum link no ar: um
 *  link fora e outro sem status saia "0/2 UP" — e o sem status pode ser
 *  justamente o roteador inalcancavel, a queda total. */
export function rotuloEstado(inst: Pick<Instituicao, 'up' | 'links'>): string {
  if (inst.up > 0) return 'UP';
  return inst.links.some((l) => l.estado === 'down') ? 'DOWN' : 'SEM STATUS';
}

/** O valor pelo qual a instituicao e agrupada na tela.
 *  Uma instituicao com links em dois aneis aparece nos dois grupos. */
export function chavesDeGrupo(inst: Instituicao, por: string): string[] {
  if (por === 'nenhum') return ['Instituicoes'];
  const vals = unicos(inst.links.map((l) => {
    const a = l.alias as unknown as Record<string, string>;
    if (por === 'pop') return l.host;
    return a[por];
  }));
  return vals.length ? vals : ['(sem ' + por + ')'];
}

/**
 * O Link de uma interface, pelo nome de uma serie ("HOST: Interface X(...):
 * Bits received") ou por host + interface. Pra quem chega na interface por
 * outro caminho — o plugin de topologia liga cada ponta do mapa a uma serie
 * pelo nome, e o cartao do link (CartaoLink) precisa do Link inteiro.
 *
 * A interface casa por abreviacao (Gi0/0/0/1 = GigabitEthernet0/0/0/1). Com
 * host, so o exato: nao chuta outro roteador. Sem host, so se a interface for
 * unica — Gi0/0/0/11 existe em todo NCS540.
 */
export function acharLink(
  links: Link[], q: { serie?: string; host?: string; iface?: string }
): Link | undefined {
  let host = q.host?.trim() || '';
  let iface = q.iface?.trim() || '';
  if (q.serie) {
    const s = parseNomeSerie(q.serie);
    if (s) {
      host = host || s.host;
      iface = iface || s.iface;
    }
  }
  if (!iface) return undefined;
  const mesmaIface = links.filter((l) => O.mesmaInterface(l.iface, iface));
  if (host) return mesmaIface.find((l) => l.host === host);
  return mesmaIface.length === 1 ? mesmaIface[0] : undefined;
}

/** Uso do link em percentual da capacidade. Usa a direcao mais carregada.
 *  Sem capacidade conhecida nao ha percentual — nem 0%, que seria mentira. */
export function usoPct(l: Link): number | undefined {
  if (!l.speed || (l.rx === undefined && l.tx === undefined)) return undefined;
  return (Math.max(l.rx ?? 0, l.tx ?? 0) / l.speed) * 100;
}
