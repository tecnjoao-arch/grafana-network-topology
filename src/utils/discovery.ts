// utils/discovery.ts — Auto-detecção de hosts/interfaces a partir das séries.
// Lê os identificadores de série (haystacks de listSeriesKeys), classifica cada
// um por tipo de métrica e agrupa por host+interface, devolvendo o "match"
// pronto (o próprio nome da série — casa por substring literal) de cada métrica.
//
// Estrutura declarativa: NOISE_RULES e METRIC_RULES são tabelas ordenadas de
// regex — template novo de Zabbix = adicionar linha, sem tocar na lógica.
//
// Gramáticas de nome reconhecidas (após o prefixo "HOST: "):
//   1) "Interface <iface>(alias): <métrica>"   → tráfego/erros/IP/status
//   2) "<iface> [alias] - <métrica>"           → DOM (templates novos)
//   3) "<iface> - <métrica>"                   → DOM (templates antigos)
//   4) "<iface>: <métrica>"                    → info do módulo (Media Type etc)

import { stableMatch, SEP } from './dataBinding';
export type MetricType =
  // Tráfego e estado
  | 'inbound' | 'outbound' | 'speed' | 'errors' | 'discards' | 'ip' | 'status'
  // Fibra DOM (valores)
  | 'domTx' | 'domRx' | 'domTemp' | 'domVolt' | 'domBias'
  // Limiares ópticos de potência (Alarm/Warning × High/Low)
  | 'rxAlarmHigh' | 'rxAlarmLow' | 'rxWarnHigh' | 'rxWarnLow'
  | 'txAlarmHigh' | 'txAlarmLow' | 'txWarnHigh' | 'txWarnLow'
  // Info do módulo óptico (texto)
  | 'moduleModel' | 'moduleSerial' | 'mediaType';

/** Ruído conhecido: nunca vira binding (avaliado ANTES das regras de métrica,
 *  exceto os limiares Rx/Tx, que têm regras próprias mais específicas). */
const NOISE_RULES: RegExp[] = [
  /sensor status/i,
  /\blanes?\b/i,                                  // "Tx Lanes ativas", "Tx Lane Spread"
  /(temperature|voltage|current) threshold/i,     // limiares que não usamos (ainda)
  /module (description|hw rev|vendor)/i,
];

/** Tabela ordenada: primeira regra que casar define o tipo. Específicas antes
 *  das genéricas (ex: "rx threshold" antes de "rx power"). */
const METRIC_RULES: Array<{ type: MetricType; re: RegExp }> = [
  // Limiares ópticos (existem como "Rx Threshold Alarm High" etc.)
  { type: 'rxAlarmHigh', re: /rx threshold alarm high/i },
  { type: 'rxAlarmLow', re: /rx threshold alarm low/i },
  { type: 'rxWarnHigh', re: /rx threshold warning high/i },
  { type: 'rxWarnLow', re: /rx threshold warning low/i },
  { type: 'txAlarmHigh', re: /tx threshold alarm high/i },
  { type: 'txAlarmLow', re: /tx threshold alarm low/i },
  { type: 'txWarnHigh', re: /tx threshold warning high/i },
  { type: 'txWarnLow', re: /tx threshold warning low/i },
  // DOM — "Tx Power (dBm)" e variação de multi-lane "Tx Power MIN (dBm)"
  { type: 'domTx', re: /tx power/i },
  { type: 'domRx', re: /rx power/i },
  { type: 'domTemp', re: /temperature|temperatura/i },
  { type: 'domVolt', re: /voltage|voltagem/i },
  // Bias: alguns templates chamam de "Current" (corrente do laser, mA)
  { type: 'domBias', re: /\bbias\b|-\s*current\b/i },
  // Info do módulo (texto)
  { type: 'moduleModel', re: /module model/i },
  { type: 'moduleSerial', re: /module serial/i },
  { type: 'mediaType', re: /media type/i },
  // Estado e identidade
  { type: 'ip', re: /endere[çc]o ip|ip address/i },
  { type: 'status', re: /operational status|status operacional/i },
  { type: 'speed', re: /\bspeed\b/i },
  // Erros e descartes
  { type: 'discards', re: /discard|descarte/i },
  { type: 'errors', re: /packets with errors|pacotes com erro/i },
  // Tráfego (as duas ordens de palavras)
  { type: 'inbound', re: /\b(bits|octets|bytes|traffic|tr[áa]fego)\b.*\b(received|recebidos)\b|\b(received|recebidos)\b.*\b(bits|octets|bytes)\b/i },
  { type: 'outbound', re: /\b(bits|octets|bytes|traffic|tr[áa]fego)\b.*\b(sent|enviados)\b|\b(sent|enviados)\b.*\b(bits|octets|bytes)\b/i },
];

/** Classifica uma série pelo nome. null = ruído conhecido ou não reconhecido.
 *  Ruído primeiro (não captura limiares Rx/Tx), depois a tabela em ordem. */
export function classify(key: string): MetricType | null {
  for (const noise of NOISE_RULES) {
    if (noise.test(key)) return null;
  }
  for (const rule of METRIC_RULES) {
    if (rule.re.test(key)) return rule.type;
  }
  return null;
}

/** Separador usado por haystack() em dataBinding.ts para unir as partes de uma
 *  série (frame.name, field.name, displayNameFromDS, labels). */
const HAYSTACK_SEP = SEP;

/** Host exposto como label pelo datasource ("host=RTR-01"), e não como prefixo
 *  do nome. Nesse modo o nome do item vem sem o "HOST: " na frente. */
const HOST_LABEL_RE = /^\s*(?:host|hostname|host_name)\s*=\s*(.+?)\s*$/i;

/** Aplica as 4 gramáticas a UM segmento já isolado. */
function parseSegment(seg: string): { host?: string; iface?: string } {
  let rest = seg;
  let host: string | undefined;

  // Prefixo de host: "HOST: ..." — guarda contra iface no lugar (iface tem '/')
  const hostM = rest.match(/^\s*([A-Za-z][\w.\- ]*?):\s+(.*)$/);
  if (hostM && !hostM[1].includes('/')) {
    host = hostM[1].trim();
    rest = hostM[2];
  }

  // 1) "Interface <iface>(alias): métrica"
  let m = rest.match(/^Interface\s+([^\s(:]+)/i);
  if (m) return { host, iface: m[1] };

  // 2) "<iface> [alias] - métrica"  |  3) "<iface> - métrica"
  m = rest.match(/^([A-Za-z][\w./-]*\d[\w./-]*)\s*(?:\[[^\]]*\])?\s*-\s/);
  if (m) return { host, iface: m[1] };

  // 4) "<iface>: métrica"
  m = rest.match(/^([A-Za-z][\w./-]*\d[\w./-]*):\s/);
  if (m) return { host, iface: m[1] };

  return { host };
}

/** Extrai host e interface de uma chave de série.
 *
 *  A chave que chega aqui NÃO é o nome cru do item: é o haystack montado por
 *  dataBinding.ts, que concatena frame.name, field.name, displayNameFromDS e os
 *  labels com " • ". O nome de verdade nem sempre é o primeiro segmento — em
 *  datasources que nomeiam o campo de "Value" e jogam o nome completo em
 *  displayNameFromDS, a chave começa com "Value • ...". Como as gramáticas são
 *  ancoradas em ^, testar só a string inteira perdia esses casos por completo
 *  (nenhuma interface detectada). Por isso cada segmento é testado. */
export function parseHostIface(key: string): { host?: string; iface?: string } {
  const segments = key.split(HAYSTACK_SEP);
  let host: string | undefined;
  let iface: string | undefined;

  // Host como label tem prioridade: é o valor explícito do datasource
  for (const seg of segments) {
    const m = seg.match(HOST_LABEL_RE);
    if (m) {
      host = m[1];
      break;
    }
  }

  for (const seg of segments) {
    const r = parseSegment(seg);
    if (!host && r.host) host = r.host;
    if (!iface && r.iface) iface = r.iface;
    if (host && iface) break;
  }

  return { host, iface };
}

export interface DiscoveredInterface {
  id: string;
  host?: string;
  iface: string;
  label: string;                                  // "host · iface" (ou só iface)
  metrics: Partial<Record<MetricType, string>>;   // tipo → série (match pronto)
}

export interface DiscoveredHost {
  host: string;
  ifaceCount: number;
  ipKey?: string;
  statusKey?: string;
}

/** Relatório da detecção — alimenta o "diagnóstico" do auto-preenchimento. */
export interface DiscoveryReport {
  totalSeries: number;
  classified: number;
  interfaces: number;
  hosts: number;
  /** Séries que não foram reconhecidas por nenhuma regra (amostra) */
  unmatched: string[];
}

/** Lista interfaces detectadas, cada uma com os matches prontos por métrica. */
export function discoverInterfaces(seriesKeys: string[]): DiscoveredInterface[] {
  const groups = new Map<string, DiscoveredInterface>();

  for (const key of seriesKeys) {
    const type = classify(key);
    if (!type) continue;
    const { host, iface } = parseHostIface(key);
    if (!iface) continue;
    const gk = `${host ?? '?'}|${iface}`;
    let g = groups.get(gk);
    if (!g) {
      g = { id: gk, host, iface, label: host ? `${host} · ${iface}` : iface, metrics: {} };
      groups.set(gk, g);
    }
    // Guarda o segmento distintivo, não o identificador inteiro: a composição
    // do identificador muda conforme o formato que o datasource devolve, e um
    // binding preso a um formato para de casar quando o outro volta.
    if (!g.metrics[type]) g.metrics[type] = stableMatch(key); // primeiro a casar vence
  }

  // Mescla grupos sem host no grupo com host de mesma interface, se for único
  const withHost = [...groups.values()].filter((g) => g.host);
  for (const g of [...groups.values()]) {
    if (g.host) continue;
    const cand = withHost.filter((h) => h.iface === g.iface);
    if (cand.length === 1) {
      for (const [t, k] of Object.entries(g.metrics)) {
        if (!cand[0].metrics[t as MetricType]) cand[0].metrics[t as MetricType] = k;
      }
      groups.delete(g.id);
    }
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Lista hosts detectados (para preencher nós). */
export function discoverHosts(seriesKeys: string[]): DiscoveredHost[] {
  const hosts = new Map<string, { host: string; ifaces: Set<string>; ipKey?: string; statusKey?: string }>();
  for (const key of seriesKeys) {
    const { host, iface } = parseHostIface(key);
    if (!host) continue;
    let h = hosts.get(host);
    if (!h) {
      h = { host, ifaces: new Set() };
      hosts.set(host, h);
    }
    if (iface) h.ifaces.add(iface);
    const t = classify(key);
    if (t === 'ip' && !h.ipKey) h.ipKey = stableMatch(key);
    if (t === 'status' && !h.statusKey) h.statusKey = stableMatch(key);
  }
  return [...hosts.values()]
    .map((h) => ({ host: h.host, ifaceCount: h.ifaces.size, ipKey: h.ipKey, statusKey: h.statusKey }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

/** Diagnóstico: quanto foi reconhecido e amostras do que ficou de fora —
 *  quando aparecer template novo, é isso que revela o padrão a adicionar. */
export function discoveryReport(seriesKeys: string[]): DiscoveryReport {
  let classified = 0;
  const unmatched: string[] = [];
  const ifaces = new Set<string>();
  const hostSet = new Set<string>();

  for (const key of seriesKeys) {
    const type = classify(key);
    const { host, iface } = parseHostIface(key);
    if (host) hostSet.add(host);
    if (type && iface) {
      classified++;
      ifaces.add(`${host ?? '?'}|${iface}`);
    } else if (type === null && !NOISE_RULES.some((n) => n.test(key))) {
      if (unmatched.length < 30) unmatched.push(key);
    }
  }

  return {
    totalSeries: seriesKeys.length,
    classified,
    interfaces: ifaces.size,
    hosts: hostSet.size,
    unmatched,
  };
}
