// utils/optica.ts — potencia optica do template "Cisco 8201 Optical Monitoring".
//
// O template do usuario nao entrega so a potencia: entrega os LIMIARES DO
// PROPRIO TRANSCEIVER (entSensorThreshold), lanes ativas, spread entre lanes,
// status do sensor e o inventario do SFP. Julgar por faixa fixa (-30/-20/0)
// seria jogar fora essa informacao — um SFP LR e um ZR tem faixas diferentes.
//
// Os nomes dos itens vem assim:
//
//   TenGigE0/0/0/7 [INSTX Anel A...] - Rx Power MIN (dBm)
//   TenGigE0/0/0/7 [INSTX Anel A...] - Rx Threshold Alarm Low
//   TenGigE0/0/0/7 [INSTX Anel A...] - Temperature
//   TenGigE0/0/0/7: Module Model
//
// Valores com significado especial, definidos no preprocessing do template:
//   -99  todas as lanes em zero  -> LOS
//   -60  parte das lanes sem sinal (satura para alarmar sem mascarar como LOS)

import type { Amostras } from '../types';

export type NivelOptico = 'ok' | 'warn' | 'alarm' | 'los' | 'nodata';

export interface Direcao {
  power?: number;
  /** Historico da potencia na janela do dashboard, pro grafico sob demanda. */
  serie?: Amostras;
  /** Limiares do transceiver: warning/alarm, low/high. */
  wl?: number;
  wh?: number;
  al?: number;
  ah?: number;
  lanes?: number;
  spread?: number;
  /** entSensorStatus: 1 ok, 2 unavailable, 3 nonoperational. */
  status?: number;
}

export interface Aux {
  value?: number;
  wl?: number;
  wh?: number;
  al?: number;
  ah?: number;
  status?: number;
}

export interface Inventario {
  modelo?: string;
  vendor?: string;
  serial?: string;
  midia?: string;
  hwrev?: string;
  /** entPhysicalDescr — as vezes e o unico campo preenchido pelo fabricante. */
  descricao?: string;
}

export interface Optica {
  porta: string;
  alias: string;
  rx?: Direcao;
  tx?: Direcao;
  aux: Record<string, Aux>;
  inv: Inventario;
  /**
   * O modulo nao mede potencia optica: os "LOS" que ele reporta nao sao
   * medida. Preenchido por classificaSemDom() depois de juntar tudo.
   */
  semDom?: 'cobre' | 'sem-sensor';
}

export interface Estado {
  nivel: NivelOptico;
  label: string;
  /** 0 ok … 5 LOS. Usado para ordenar e para o pior-caso do link. */
  sev: number;
}

// --------------------------------------------------------------- nomes
//
// "PORTA [ALIAS] - DIR metrica" / "PORTA [ALIAS] - TIPO metrica" / "PORTA: campo"

const RE_DIR = /^(.+?)\s*\[(.*)\]\s*-\s*(Rx|Tx)\s+(.+)$/;
const RE_AUX = /^(.+?)\s*\[(.*)\]\s*-\s*(Temperature|Voltage|Current)\s*(.*)$/;
const RE_INV =
  /^(.+?):\s*(Module Model|Module Vendor|Module Serial|Module HW Rev|Module Description|Media Type)$/;

/**
 * O MESMO inventario, com outro nome: "Optics Model: GigabitEthernet0/0/0/12".
 *
 * E o formato do template ligado a um dos NCS540 — campo antes, porta DEPOIS
 * dos dois-pontos. O "Cisco 8201 Optical Monitoring v2" usa o contrario. Os
 * dois convivem no parque, e sem este padrao nenhum SFP daquele PoP
 * aparecia, com ou sem a query de inventario.
 */
const RE_INV_OPTICS =
  /^Optics (Model|Description|Serial|Vendor|Manufacturer|HW Rev|Hardware Revision|Media Type):\s*(.+)$/;

/** Os nomes do formato "Optics X" traduzidos pro nome canonico do outro. */
const CAMPO_OPTICS: Record<string, string> = {
  'Model': 'Module Model',
  'Description': 'Module Description',
  'Serial': 'Module Serial',
  'Vendor': 'Module Vendor',
  'Manufacturer': 'Module Vendor',
  'HW Rev': 'Module HW Rev',
  'Hardware Revision': 'Module HW Rev',
  'Media Type': 'Media Type',
};

export interface ItemOptico {
  porta: string;
  alias: string;
  /** 'dir' potencia e limiares · 'aux' sensores · 'inv' inventario */
  kind: 'dir' | 'aux' | 'inv';
  dir?: 'Rx' | 'Tx';
  tipo?: string;
  campo: string;
}

/** Reconhece um nome de item optico. null se nao for. */
export function parseNomeOptico(nome: string): ItemOptico | null {
  const s = String(nome).trim();

  const d = s.match(RE_DIR);
  if (d) {
    return {
      porta: d[1].trim(), alias: d[2].trim(),
      kind: 'dir', dir: d[3] as 'Rx' | 'Tx', campo: d[4].trim(),
    };
  }

  const a = s.match(RE_AUX);
  if (a) {
    return {
      porta: a[1].trim(), alias: a[2].trim(),
      kind: 'aux', tipo: a[3], campo: a[4].trim(),
    };
  }

  const i = s.match(RE_INV);
  if (i) {
    return { porta: i[1].trim(), alias: '', kind: 'inv', campo: i[2] };
  }

  const io = s.match(RE_INV_OPTICS);
  if (io) {
    return { porta: io[2].trim(), alias: '', kind: 'inv', campo: CAMPO_OPTICS[io[1]] };
  }

  return null;
}

/** Onde cada metrica de direcao entra em Direcao. */
export function campoDirecao(campo: string): keyof Direcao | null {
  // "Power MIN (dBm)" no 8201 (pior lane do QSFP); "Power (dBm)" ou so
  // "Power" onde o SFP tem uma lane, como num ASR9K.
  if (/^Power( MIN)?(\s*\(dBm\))?$/i.test(campo)) return 'power';
  // "Threshold Alarm High" ou "Threshold alarm-high" (a etiqueta do template
  // e com hifen; o nome, com espaco).
  if (/^Threshold[\s-]+Warning[\s-]+Low$/i.test(campo)) return 'wl';
  if (/^Threshold[\s-]+Warning[\s-]+High$/i.test(campo)) return 'wh';
  if (/^Threshold[\s-]+Alarm[\s-]+Low$/i.test(campo)) return 'al';
  if (/^Threshold[\s-]+Alarm[\s-]+High$/i.test(campo)) return 'ah';
  if (/^Lanes ativas$/i.test(campo)) return 'lanes';
  if (/^Lane Spread/i.test(campo)) return 'spread';
  if (/^Sensor Status/i.test(campo)) return 'status';
  return null;
}

/** Onde cada metrica auxiliar entra em Aux. */
export function campoAux(campo: string): keyof Aux | null {
  if (campo === '') return 'value';
  if (/^Threshold Warning Low$/i.test(campo)) return 'wl';
  if (/^Threshold Warning High$/i.test(campo)) return 'wh';
  if (/^Threshold Alarm Low$/i.test(campo)) return 'al';
  if (/^Threshold Alarm High$/i.test(campo)) return 'ah';
  if (/^Sensor Status/i.test(campo)) return 'status';
  return null;
}

export function campoInventario(campo: string): keyof Inventario | null {
  switch (campo) {
    case 'Module Model': return 'modelo';
    case 'Module Vendor': return 'vendor';
    case 'Module Serial': return 'serial';
    case 'Module HW Rev': return 'hwrev';
    case 'Module Description': return 'descricao';
    case 'Media Type': return 'midia';
    default: return null;
  }
}

// --------------------------------------------------------------- estado

/** Julga uma direcao pelos limiares do proprio transceiver.
 *
 *  A ordem importa: LOS e lane-down sao valores sentinela e tem que ser
 *  testados ANTES da comparacao com os limiares, senao -99 vira so
 *  "alarm low" e a diferenca entre "fibra cortada" e "sinal fraco" se perde. */
export function estadoDirecao(d?: Direcao): Estado {
  if (!d || d.power === undefined) return { nivel: 'nodata', label: 'SEM DADO', sev: 0 };
  const v = d.power;

  if (v === -99 || v === -40) return { nivel: 'los', label: 'LOS', sev: 5 };
  if (v === -60) return { nivel: 'alarm', label: 'LANE DOWN', sev: 4 };
  if (d.al !== undefined && v < d.al) return { nivel: 'alarm', label: 'ALARM LOW', sev: 4 };
  if (d.ah !== undefined && v > d.ah) return { nivel: 'alarm', label: 'ALARM HIGH', sev: 4 };
  if (d.wl !== undefined && v < d.wl) return { nivel: 'warn', label: 'WARN LOW', sev: 2 };
  if (d.wh !== undefined && v > d.wh) return { nivel: 'warn', label: 'WARN HIGH', sev: 2 };
  if (d.status !== undefined && d.status > 1) return { nivel: 'warn', label: 'SENSOR', sev: 1 };
  return { nivel: 'ok', label: 'OK', sev: 0 };
}

export function estadoAux(a?: Aux): NivelOptico {
  if (!a || a.value === undefined) return 'nodata';
  if ((a.al !== undefined && a.value < a.al) || (a.ah !== undefined && a.value > a.ah)) return 'alarm';
  if ((a.wl !== undefined && a.value < a.wl) || (a.wh !== undefined && a.value > a.wh)) return 'warn';
  return 'ok';
}

/** Pior estado entre Rx, Tx e os sensores auxiliares. */
export function severidade(o: Optica): number {
  if (o.semDom) return 0;
  let sev = Math.max(estadoDirecao(o.rx).sev, estadoDirecao(o.tx).sev);
  for (const k of Object.keys(o.aux)) {
    const n = estadoAux(o.aux[k]);
    sev = Math.max(sev, n === 'alarm' ? 4 : n === 'warn' ? 2 : 0);
  }
  return sev;
}

// --------------------------------------------------------------- formato

/** dBm, com LOS e lane-down escritos por extenso. */
export function fmtPotencia(v?: number): string {
  if (v === undefined) return '—';
  if (v === -99 || v === -40) return 'LOS';
  if (v === -60) return 'LANE DOWN';
  return v.toFixed(2) + ' dBm';
}

/** Voltagem chega em mV e corrente em uA em algumas plataformas. */
export function fmtAux(tipo: string, v?: number): string {
  if (v === undefined) return '—';
  if (tipo === 'Voltage') return (v >= 100 ? v / 1000 : v).toFixed(2) + ' V';
  if (tipo === 'Current') {
    // Acima de 1000 e uA (bias de SFP e de poucos mA): dividido por mil da
    // mA, e nao A — saia "6.50 A" pra uma corrente de 6,5 mA.
    return (v >= 1000 ? v / 1000 : v).toFixed(1) + ' mA';
  }
  return v.toFixed(1) + ' °C';
}

/**
 * As cinco zonas da regua de potencia, em percentual da largura.
 *
 * Sem limiares nao ha regua: uma barra sem escala induz a ler distancia onde
 * nao ha nenhuma. Nesse caso devolve null e a UI mostra so o numero.
 */
export interface Regua {
  zonas: Array<{ nivel: 'alarm' | 'warn' | 'ok'; ini: number; fim: number }>;
  marcas: Array<{ pct: number; valor: number; nivel: 'alarm' | 'warn'; titulo: string }>;
  /** Posicao do valor atual, 0–100. */
  agulha: number;
}

export function regua(d: Direcao): Regua | null {
  if (d.power === undefined) return null;
  if (d.al === undefined || d.ah === undefined || d.wl === undefined || d.wh === undefined) {
    return null;
  }

  const lo = d.al - 3;
  const hi = d.ah + 3;
  const pct = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));

  return {
    zonas: [
      { nivel: 'alarm', ini: 0, fim: pct(d.al) },
      { nivel: 'warn', ini: pct(d.al), fim: pct(d.wl) },
      { nivel: 'ok', ini: pct(d.wl), fim: pct(d.wh) },
      { nivel: 'warn', ini: pct(d.wh), fim: pct(d.ah) },
      { nivel: 'alarm', ini: pct(d.ah), fim: 100 },
    ],
    marcas: [
      { pct: pct(d.al), valor: d.al, nivel: 'alarm', titulo: 'Alarm Low' },
      { pct: pct(d.wl), valor: d.wl, nivel: 'warn', titulo: 'Warning Low' },
      { pct: pct(d.wh), valor: d.wh, nivel: 'warn', titulo: 'Warning High' },
      { pct: pct(d.ah), valor: d.ah, nivel: 'alarm', titulo: 'Alarm High' },
    ],
    // LOS nao tem posicao na regua: ancora na esquerda em vez de sair da barra
    agulha: d.power === -99 || d.power === -40 ? 0 : pct(d.power),
  };
}

/**
 * Onde escrever o numero de cada limiar na regua.
 *
 * Warning em CIMA da barra, alarme EMBAIXO. Numa linha so, o warning low e o
 * alarm low colidem sempre que estao a poucos dB — e no SFP comum estao. Em
 * linhas separadas, o par so colide se for do mesmo tipo (wl com wh), o que
 * exigiria uma janela de operacao de menos de ~3 dB.
 *
 * Cada numero fica sob o SEU traco, e nao na borda da barra: a barra vai 3 dB
 * alem de cada alarme, entao o traco do alarm low nao esta no canto. A versao
 * anterior escrevia o valor do alarme no canto e apontava pro lugar errado.
 */
export interface RotuloLimiar {
  valor: number;
  pct: number;
  nivel: 'alarm' | 'warn';
  linha: 'acima' | 'abaixo';
  /** Ancoragem do texto no traco: centrado, ou crescendo pra um lado so. */
  alinha: 'inicio' | 'meio' | 'fim';
}

/** Distancia minima, em % da largura, pra dois rotulos da mesma linha
 *  poderem ficar centrados sem se sobrepor. */
const VIZINHO_PCT = 9;
/** Perto da borda o rotulo centrado vazaria pra fora da barra. */
const BORDA_PCT = 6;

export function rotulosRegua(r: Regua): RotuloLimiar[] {
  const saida: RotuloLimiar[] = [];

  for (const linha of ['acima', 'abaixo'] as const) {
    const nivel = linha === 'acima' ? 'warn' : 'alarm';
    // Mesmo valor duas vezes na mesma linha (wl === wh) vira um rotulo so.
    const vistos = new Set<string>();
    const daLinha = r.marcas
      .filter((m) => m.nivel === nivel)
      .filter((m) => {
        const k = m.valor.toFixed(1);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .sort((a, b) => a.pct - b.pct)
      .map((m): RotuloLimiar => ({
        valor: m.valor, pct: m.pct, nivel, linha,
        alinha: m.pct < BORDA_PCT ? 'inicio' : m.pct > 100 - BORDA_PCT ? 'fim' : 'meio',
      }));

    // Vizinhos proximos: em vez de esconder um, afasta os dois — o da
    // esquerda cresce pra esquerda e o da direita pra direita.
    for (let i = 1; i < daLinha.length; i++) {
      if (daLinha[i].pct - daLinha[i - 1].pct < VIZINHO_PCT) {
        daLinha[i - 1].alinha = 'fim';
        daLinha[i].alinha = 'inicio';
      }
    }
    saida.push(...daLinha);
  }
  return saida;
}

/**
 * Junta num transceiver o que chegou de outra query sem identificacao de
 * host. So preenche o que o destino nao tem: o destino veio da query com
 * host conhecido e e a fonte mais confiavel.
 */
export function mesclaOptica(destino: Optica, origem: Optica): void {
  for (const k of Object.keys(origem.inv) as Array<keyof Inventario>) {
    if (destino.inv[k] === undefined) destino.inv[k] = origem.inv[k];
  }
  for (const k of ['rx', 'tx'] as const) {
    const o = origem[k];
    if (!o) continue;
    destino[k] = { ...o, ...destino[k] };
  }
  for (const [tipo, a] of Object.entries(origem.aux)) {
    destino.aux[tipo] = { ...a, ...destino.aux[tipo] };
  }
  if (!destino.alias && origem.alias) destino.alias = origem.alias;
}

// --------------------------------------------------------------- sem DOM

/**
 * Cobre e DAC. Inclui o que o template NAO pega: o regex dele
 * (/CR4|CR[0-9]|Copper|Direct.Attach/) foi escrito pra DAC por descricao,
 * e passam como "Fiber":
 *   - SFP 1000BASE-T ("GLC-T", "SFP-GE-T")
 *   - DAC pelo part number Cisco ("QSFP-100G-CU3M", "SFP-H10GB-CU1M"),
 *     quando o modelo chega mas a descricao nao
 */
const RE_COBRE =
  /Copper|Direct.?Attach|\bDAC\b|\bCR\d|BASE-?TX?\b|\bGLC-TE?\b|SFP-(?:GE|10G)-T\b|-CU\d/i;

/**
 * Este transceiver mede potencia optica de verdade?
 *
 * Um SFP de cobre, ou um modulo sem DOM, faz o sensor devolver o sentinela
 * de LOS o tempo todo. Levar isso a serio pinta de vermelho um link passando
 * 210 Mb/s — que foi exatamente o que apareceu numa Gi0/0/0/24 real.
 *
 * Duas evidencias, nenhuma dependente de horario:
 *
 *   1. O inventario diz cobre/DAC. Precisa da query C (modo Text).
 *   2. Todo sensor auxiliar reporta exatamente zero E as duas direcoes estao
 *      em LOS ou ausentes. Uma fibra CORTADA nao zera nada disso: o modulo
 *      continua alimentado, com Vcc ~3.3 V e temperatura normal. Vcc zero e
 *      modulo que nao tem o que medir.
 *
 * O que NAO e usado, de proposito: "o link esta up, entao o LOS e falso".
 * Parece obvio, mas o status operacional e a potencia sao itens diferentes
 * com coletas em momentos diferentes. Logo depois de um corte, a potencia ja
 * diz -99 e o status ainda diz up por um ciclo — e essa regra esconderia
 * justamente o alarme mais urgente.
 */
export function classificaSemDom(o: Optica): Optica['semDom'] {
  const inv = [o.inv.midia, o.inv.modelo, o.inv.descricao].filter(Boolean).join(' ');
  if (inv && RE_COBRE.test(inv)) return 'cobre';

  const aux = Object.values(o.aux).filter((a) => a.value !== undefined);
  const auxZerado = aux.length > 0 && aux.every((a) => a.value === 0);
  const semLuz = (d?: Direcao) => !d || d.power === undefined || d.power === -99 || d.power === -40;
  if (auxZerado && semLuz(o.rx) && semLuz(o.tx)) return 'sem-sensor';

  return undefined;
}

// --------------------------------------------------------------- subinterface

/**
 * A porta fisica de uma subinterface: "TenGigE0/0/0/33.1301" -> "TenGigE0/0/0/33".
 * null se ja for fisica.
 *
 * O transceiver mora na porta fisica, entao o sensor optico nunca tem o nome
 * da subinterface. Sem isso, todo cliente entregue por VLAN (PESAGRO,
 * METRONIT...) ficava sem optica nenhuma.
 */
export function portaFisica(iface: string): string | null {
  const m = String(iface).match(/^(.+)\.\d+$/);
  return m ? m[1] : null;
}

// --------------------------------------------------------------- historico

/** Valor que o preprocessing do template usa como marcador, nao como medida. */
export function ehSentinela(v: number): boolean {
  return v === -99 || v === -40 || v === -60;
}

export interface EventoOptico {
  t: number;
  tipo: 'los' | 'lane';
}

/**
 * Quebra a serie de potencia nos sentinelas.
 *
 * -99 nao e "potencia muito baixa", e "nao ha luz". Se entrasse na linha, a
 * escala iria ate -99 e toda a variacao real — que acontece em decimos de dB
 * — viraria um traco reto. Entao o grafico desenha so os trechos de medida
 * real, com um buraco onde houve LOS, e marca o LOS a parte.
 */
export function trechosPotencia(a: Amostras): { trechos: Amostras[]; eventos: EventoOptico[] } {
  const trechos: Amostras[] = [];
  const eventos: EventoOptico[] = [];
  let atual: Amostras = { t: [], v: [] };

  for (let i = 0; i < a.t.length; i++) {
    const v = a.v[i];
    if (ehSentinela(v)) {
      eventos.push({ t: a.t[i], tipo: v === -60 ? 'lane' : 'los' });
      if (atual.t.length) trechos.push(atual);
      atual = { t: [], v: [] };
      continue;
    }
    atual.t.push(a.t[i]);
    atual.v.push(v);
  }
  if (atual.t.length) trechos.push(atual);
  return { trechos, eventos };
}

/**
 * Faixa vertical do grafico de potencia, em dBm.
 *
 * Cobre os dados reais E os quatro limiares, com uma folga. Os limiares
 * entram de proposito — ao contrario da capacidade no grafico de trafego —
 * porque aqui a pergunta e "quao perto do alarme a potencia andou", e sem as
 * faixas no fundo a curva nao responde isso.
 */
export function faixaPotencia(d: Direcao): { lo: number; hi: number } | null {
  const reais = (d.serie?.v ?? []).filter((v) => !ehSentinela(v));
  const pontos = [...reais];
  for (const lim of [d.al, d.wl, d.wh, d.ah]) if (lim !== undefined) pontos.push(lim);
  if (pontos.length === 0) return null;

  let lo = Math.min(...pontos);
  let hi = Math.max(...pontos);
  if (hi - lo < 2) {
    // Serie quase reta e sem limiares: abre 1 dB pra cada lado, senao o
    // ruido de 0.01 dB ocuparia a altura toda e pareceria instabilidade.
    const meio = (lo + hi) / 2;
    lo = meio - 1;
    hi = meio + 1;
  }
  const folga = (hi - lo) * 0.08;
  return { lo: Math.floor(lo - folga), hi: Math.ceil(hi + folga) };
}

/** O template usa o ifName no sensor e o path no inventario. Casa os dois. */
export function mesmaInterface(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/^module mau /, '')
      .replace(/\/cpu0\//, '/0/')
      .replace(/^(tengige|te)/, 'te')
      .replace(/^(hundredgige|hu)/, 'hu')
      .replace(/^(fourhundredgige|fh)/, 'fh')
      .replace(/^(gigabitethernet|gi)/, 'gi')
      .replace(/^(twentyfivegige|tf)/, 'tf')
      .replace(/^(xgigabitethernet|xge)/, 'xge');
  return norm(a) === norm(b);
}
