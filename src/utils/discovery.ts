// utils/discovery.ts — Auto-detecção de hosts/interfaces a partir das séries.
// Lê os identificadores de série (haystacks de listSeriesKeys), classifica cada
// um por tipo de métrica e agrupa por interface, devolvendo, para cada interface,
// o "match" pronto (o próprio nome da série, que casa por substring literal) de
// cada métrica. Assim o editor preenche todos os bindings de um lado de uma vez.

export type MetricType =
  | 'inbound' | 'outbound' | 'speed' | 'errors' | 'discards'
  | 'ip' | 'status' | 'domTx' | 'domRx' | 'domTemp' | 'domVolt' | 'domBias';

export interface DiscoveredInterface {
  id: string;
  host?: string;
  iface: string;
  label: string;                         // "host · iface" (ou só iface)
  metrics: Partial<Record<MetricType, string>>; // tipo → série (match)
}

export interface DiscoveredHost {
  host: string;
  ifaceCount: number;
  ipKey?: string;
  statusKey?: string;
}

/** Classifica uma série pelo seu nome. null = ruído (thresholds/sensores) ou irrelevante. */
function classify(key: string): MetricType | null {
  const k = key.toLowerCase();
  // Descarta os itens de threshold/sensor/alarme (são a maior parte do "lixo")
  if (/threshold|sensor status|warning (high|low)|alarm/.test(k)) return null;
  if (/tx power/.test(k)) return 'domTx';
  if (/rx power/.test(k)) return 'domRx';
  if (/temperature|temperatura/.test(k)) return 'domTemp';
  if (/voltage|voltagem/.test(k)) return 'domVolt';
  if (/\bbias\b/.test(k)) return 'domBias';
  if (/endere[çc]o ip|ip address/.test(k)) return 'ip';
  if (/operational status|status operacional/.test(k)) return 'status';
  if (/\bspeed\b/.test(k) && !/sent/.test(k)) return 'speed';
  if (/discard|descarte/.test(k)) return 'discards';
  if (/(errors|erros)/.test(k) && /(packets|pacotes)/.test(k)) return 'errors';
  if (/(received|recebidos)/.test(k) && /(bits|octets|bytes|traffic|tr[áa]fego)/.test(k)) return 'inbound';
  if (/(sent|enviados)/.test(k) && /(bits|octets|bytes|traffic|tr[áa]fego)/.test(k)) return 'outbound';
  return null;
}

/** Extrai host e interface de um nome de série (heurístico, tolerante). */
function parseHostIface(key: string): { host?: string; iface?: string } {
  let host: string | undefined;
  let iface: string | undefined;

  // host: "HOST: ..." — antes do primeiro ':' (quando há interface/item depois)
  const hostM = key.match(/^\s*([A-Za-z][\w.\- ]*?):\s+/);
  if (hostM) host = hostM[1].trim();

  // iface: padrão Zabbix "Interface XXX(alias)" → captura até espaço/parêntese/':'
  const ifM = key.match(/Interface\s+([^\s(:]+)/i);
  if (ifM) {
    iface = ifM[1];
  } else {
    // padrão DOM "IFACE - Métrica" (ex: "TenGigE0/0/0/7 - Rx Power")
    const domM = key.match(/(?:^|:\s*)([A-Za-z][\w./-]*\d[\w./-]*)\s*-\s/);
    if (domM) iface = domM[1];
  }
  return { host, iface };
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
    if (!g.metrics[type]) g.metrics[type] = key; // primeiro a casar vence
  }

  // Mescla grupos sem host (ex: DOM) no grupo com host de mesma interface, se único.
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
    if (!h) { h = { host, ifaces: new Set() }; hosts.set(host, h); }
    if (iface) h.ifaces.add(iface);
    const t = classify(key);
    if (t === 'ip' && !h.ipKey) h.ipKey = key;
    if (t === 'status' && !h.statusKey) h.statusKey = key;
  }
  return [...hosts.values()]
    .map((h) => ({ host: h.host, ifaceCount: h.ifaces.size, ipKey: h.ipKey, statusKey: h.statusKey }))
    .sort((a, b) => a.host.localeCompare(b.host));
}
