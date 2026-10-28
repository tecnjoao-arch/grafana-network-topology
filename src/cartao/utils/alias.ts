// utils/alias.ts — le a description padronizada da interface.
//
//   INST:EXEMPLO|Anel:NORTE|Via:RUA_A|PRIMARIO|FO1,2
//
// Porta TypeScript do tools/formato.js, que e quem gera as descriptions.
// Os dois PRECISAM concordar: tools/teste-alias.js roda as 269 descriptions
// reais do parque pelos dois e falha se algum campo divergir.
//
// Durante a migracao convivem dois formatos. parseAlias() devolve null para o
// alias antigo, e ai parseLegado() tenta adivinhar pela regex de sempre — e o
// painel sabe dizer quantas interfaces ja migraram.

export const SEP = '|';
export const TAG = ':';

export type Tipo =
  'INST' | 'BB' | 'OPE' | 'PAR' | 'SVC' | 'MGT' | 'LAN' | 'TST' | 'AGG' | 'UPLINK' | 'PTT';

export const TIPOS: Tipo[] = [
  'INST', 'BB', 'OPE', 'PAR', 'SVC', 'MGT', 'LAN', 'TST', 'AGG', 'UPLINK', 'PTT',
];

/** Etiqueta escrita na description -> chave interna. */
export const TAGS = {
  anel: 'Anel', ramal: 'Ramal', radial: 'Radial', arco: 'Arco', via: 'Via', papel: 'Papel',
  op: 'Op', vlan: 'Vlan',
  pop: 'PoP', link: 'Link', eqp: 'Eqp', porta: 'Porta', id: 'Id',
} as const;

export type ChaveTag = keyof typeof TAGS;

const CHAVE_POR_TAG: Record<string, ChaveTag> = Object.fromEntries(
  Object.entries(TAGS).map(([k, v]) => [v.toLowerCase(), k as ChaveTag])
) as Record<string, ChaveTag>;

const TIPO_RE = new RegExp('^(' + TIPOS.join('|') + ')' + TAG + '(.*)$');

/** Campos escritos sem etiqueta ("|PRIMARIO"), reconhecidos pelo valor.
 *  Espelha formato.SEM_ETIQUETA — so vale pra vocabulario fechado. */
const SEM_ETIQUETA = new Set<ChaveTag>(['papel']);
const PAPEIS = ['PRIMARIO', 'SECUNDARIO', 'UNICO', 'BALANCEADO'];

export interface Alias {
  tipo: Tipo;
  sigla: string;
  /** A topologia, pra agrupar: o anel, ou RAMAL_X / RADIAL_X quando a
   *  description diz "Ramal:X" / "Radial:X". */
  anel: string;
  /** "Ramal:X" e "Radial:X" como vieram escritos. */
  ramal: string;
  radial: string;
  arco: string;
  via: string;
  papel: string;
  op: string;
  vlan: string;
  pop: string;
  link: string;
  eqp: string;
  porta: string;
  id: string;
  obs: string;
  /** true quando veio do formato novo; false quando foi adivinhado do legado. */
  padronizado: boolean;
}

function vazio(): Omit<Alias, 'tipo' | 'padronizado'> {
  return {
    sigla: '', anel: '', ramal: '', radial: '', arco: '', via: '', papel: '', op: '',
    vlan: '', pop: '', link: '', eqp: '', porta: '', id: '', obs: '',
  };
}

/** Le o formato novo. null se a description ainda for a antiga. */
export function parseAlias(texto: string): Alias | null {
  const s = String(texto || '');
  const partes = s.split(SEP);
  const cabeca = partes[0].trim().match(TIPO_RE);
  if (!cabeca) return null;

  const r: Alias = {
    ...vazio(),
    tipo: cabeca[1] as Tipo,
    sigla: cabeca[2].trim(),
    padronizado: true,
  };

  const soltos: string[] = [];
  for (const p of partes.slice(1)) {
    const m = p.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    const chave = m ? CHAVE_POR_TAG[m[1].toLowerCase()] : undefined;
    if (chave) {
      (r as unknown as Record<string, string>)[chave] = m![2].trim();
      continue;
    }
    // Campo sem etiqueta: so o campo inteiro conta, senao "backup do
    // PRIMARIO" numa observacao viraria papel.
    const papel = PAPEIS.find((v) => v === p.trim().toUpperCase());
    if (papel && !r.papel) {
      r.papel = papel;
      continue;
    }
    soltos.push(p);
  }
  r.obs = soltos.join(SEP).trim();
  // Ramal e radial sao topologia, como o anel, e o painel agrupa por um campo
  // so: "Radial:X" entra no grupo RADIAL_X, como "Anel:RAMAL_Y" sempre
  // entrou no RAMAL_Y. Sem isso a radial caia em "(sem anel)".
  if (!r.anel && r.ramal) r.anel = 'RAMAL_' + r.ramal.toUpperCase();
  else if (!r.anel && r.radial) r.anel = 'RADIAL_' + r.radial.toUpperCase();
  return r;
}

// --------------------------------------------------------------- legado
//
// Enquanto a migracao nao termina, a maioria das descriptions ainda esta no
// texto livre antigo. Aqui so extraimos o essencial para o card nao ficar
// vazio: quem e, e em que anel esta quando da para saber.

/**
 * As regras do formato antigo que dependem da REDE: nomes de anel, ruas das
 * rotas de fibra, grafias das instituicoes e sufixos que so existem nela.
 * Sairam do codigo (o repositorio e publico); quem tem descriptions antigas
 * passa as suas com configurarLegado(). Sem elas, a description antiga ainda
 * e lida — so sem o anel e a via deduzidos e sem acertar a grafia da sigla.
 *
 *   configurarLegado({
 *     aneis: [[/anel\s*norte/i, 'NORTE']],
 *     vias: [[/rua\s*a\b/i, 'RUA_A', 'NORTE']],      // [regra, via, anel]
 *     canonico: { 'INST-X-ANTIGO': 'INST-X' },
 *     sufixos: [/-SUFIXO-LOCAL$/i],
 *   });
 */
export interface RegrasLegado {
  aneis?: Array<[RegExp, string]>;
  vias?: Array<[RegExp, string, string]>;
  canonico?: Record<string, string>;
  sufixos?: RegExp[];
}

let ANEL_LEG: Array<[RegExp, string]> = [];

const ARCO_LEG: Array<[RegExp, string]> = [
  [/\barc[o]?\s*[.\s_]\s*norte/i, 'NORTE'],
  [/\barc[o]?\s*[.\s_]\s*sul/i, 'SUL'],
  [/centro\s+norte/i, 'NORTE'], [/centro\s+sul/i, 'SUL'],
];

// Os mesmos nomes de formato.VIA. Se divergissem, agrupando por via o
// mesmo caminho viraria dois grupos: "RUA_A" pros links ainda no formato
// antigo e "AVENIDA_RUA_A" pros ja migrados. [regra, via, anel da via]
let VIA_LEG: Array<[RegExp, string, string]> = [];

const PAPEL_LEG: Array<[RegExp, string]> = [
  [/(prim[aá]rio|principal|link[_\s]*0\b)/i, 'PRIMARIO'],
  [/(secund[aá]rio|link[_\s]*1\b)/i, 'SECUNDARIO'],
  [/balanceado|ospf/i, 'BALANCEADO'],
];

/** Interfaces que nao sao link de cliente, no formato antigo. */
const NAO_CLIENTE =
  /bundle-ether|LACP|LINK\s*\d?\s*(ASR|POP|NCS|AGG|CISCO)|Link\s+ASR|vpws|l2vpn|xconnect|^evc[_\s]|term[oô]metro|perfsonar|medidor|honeypot|\bLAN\b|\bteste?\b|tempor[aá]rio|^PTT|^BGP|^UPLK/i;

/** Grafias canonicas — as mesmas de tools/classificar.js. Exportada pro
 *  teste conferir as duas: elas ja divergiram (faltavam duas instituicoes
 *  aqui), e a mesma instituicao virava dois cards na transicao. Vem de
 *  configurarLegado(). */
export const CANONICO: Record<string, string> = {};

/** Pedacos que nunca fazem parte da sigla: os de qualquer rede, mais os de
 *  configurarLegado(). */
const SUFIXO_GERAL: RegExp[] = [
  /-XGE[\d/]+$/i, /-TE[\d/.]+$/i, /-GI[\d/.]+$/i,
  /-\d+GBPS?$/i,
  /-CISCOME\d+.*$/i,          // INST-X-CiscoME3400-Gi0/1
  /-FIBRA-PROPRIA.*$/i,       // INST-X - FIBRA PROPRIA (RAMAL X) 1GBPS
];
let SUFIXO_LIXO: RegExp[] = [...SUFIXO_GERAL];

/** As regras do formato antigo desta rede (ver RegrasLegado). Substitui as
 *  que houver; chamar de novo com {} volta ao comportamento sem regras. */
export function configurarLegado(r: RegrasLegado): void {
  ANEL_LEG = [...(r.aneis ?? [])];
  VIA_LEG = [...(r.vias ?? [])];
  for (const k of Object.keys(CANONICO)) delete CANONICO[k];
  Object.assign(CANONICO, r.canonico ?? {});
  SUFIXO_LIXO = [...(r.sufixos ?? []), ...SUFIXO_GERAL];
}

/** Nome de interface, como aparece nas descriptions. */
const IFACE_RE =
  '(?:XGE|Hu|HundredGigE|Te|TenGigE|Gi|GigabitEthernet|Fa|Eth|LAG|Po|[tg])[-\\s]?\\d+(?:[/.]\\d+)*';

/** A ponta remota, quando a description antiga ja diz onde o cabo termina.
 *  Muitas dizem: "CPE INSTX XGE0/0/2", "porta t0/2/0/1", "|HPA5500|Te-1/1/1". */
function pontaRemotaLegado(d: string): { eqp: string; porta: string } {
  let porta = '';
  for (const re of [
    new RegExp('\\bporta\\s+(' + IFACE_RE + ')', 'i'),
    new RegExp('\\bCPE\\s+\\S+\\s+(' + IFACE_RE + ')', 'i'),
    new RegExp('\\|\\s*(' + IFACE_RE + ')\\s*$', 'i'),
    new RegExp('[-\\s](' + IFACE_RE + ')\\s*$', 'i'),
  ]) {
    const m = d.match(re);
    if (m) { porta = m[1].replace(/\s+/g, ''); break; }
  }

  let eqp = '';
  const cpe = d.match(/\bCPE\s+([A-Z0-9-]+)/i);
  const entrePipes = d.match(/\|([A-Za-z][\w-]{3,})\|/);
  const modelo = d.match(/\b((?:Cisco[\s_]?\d{4,}|CiscoME\d+[A-Z]*|ME\d{4}[A-Z]*(?:-[A-Z0-9]+)*|HPA\d+[-\w]*|ARUBA\d+|C\d{4}|S\d{4}[-\w]*))\b/i);
  if (cpe) eqp = 'CPE-' + cpe[1].toUpperCase();
  else if (entrePipes) eqp = entrePipes[1];
  else if (modelo) eqp = modelo[1].replace(/\s+/g, '-');

  // o modelo colado na interface ("CiscoME3400-Gi0/1") vem junto — apara
  if (eqp) eqp = eqp.replace(new RegExp('[-_\\s]' + IFACE_RE + '$', 'i'), '');
  return { eqp, porta };
}

function primeiro<T extends [RegExp, ...unknown[]]>(regras: T[], d: string): T | null {
  for (const r of regras) if (r[0].test(d)) return r;
  return null;
}

/** Best-effort para a description antiga. Nunca devolve null: o painel
 *  precisa mostrar a interface de qualquer jeito, so que marcada. */
export function parseLegado(texto: string): Alias {
  const d = String(texto || '');
  const arco = primeiro(ARCO_LEG, d);
  const via = primeiro(VIA_LEG, d);
  const anel = primeiro(ANEL_LEG, d);
  const papel = primeiro(PAPEL_LEG, d);

  // Formato pipe ("INST-EXEMPLO|HPA5500-48G-EI|Te-1/1/1"): o 1o
  // campo e a sigla, como em tools/classificar.js. Sem isso o card saia com a
  // description inteira de titulo, pipes e modelo do switch incluidos.
  const pipe = d.split('|');
  const siglaPipe = pipe.length >= 2 && /^[A-Za-z][\w.-]{1,}$/.test(pipe[0].trim())
    ? pipe[0].trim().toUpperCase().replace(/[\s._]+/g, '-')
    : '';

  let sigla = siglaPipe || d
    .replace(/\s*[-–]\s*(Anel|via|Via|CPE|VPWS|Link|LINK).*/i, '')
    .replace(/\s+(Anel|anel|Ramal|ramal|via|Via|BB\b|CPE\b|VPWS\b).*/, '')
    .replace(/\s+F[Oo]?\s?\d.*$/, '').replace(/\s*\(.*$/, '')
    .trim()
    .replace(/[\s._]+/g, '-')
    // " - " vira "---" se nao colapsar; era o que fazia
    // "RR - INSTX - 1Gbps" aparecer como "RR---INSTX---1GBPS" no card
    .replace(/-{2,}/g, '-')
    .replace(/^-|-+$/g, '')
    .toUpperCase();

  if (CANONICO[sigla]) sigla = CANONICO[sigla];
  else for (const re of SUFIXO_LIXO) sigla = sigla.replace(re, '');
  if (CANONICO[sigla]) sigla = CANONICO[sigla];

  const { eqp, porta } = pontaRemotaLegado(d);

  return {
    ...vazio(),
    tipo: NAO_CLIENTE.test(d) ? 'SVC' : 'INST',
    sigla: sigla || d.slice(0, 20).toUpperCase(),
    anel: anel ? anel[1] : (via ? via[2] : ''),
    arco: arco ? arco[1] : '',
    via: via ? via[1] : '',
    papel: papel ? papel[1] : '',
    eqp,
    porta,
    obs: d,
    padronizado: false,
  };
}

/** Le a description, no formato que vier. */
export function lerAlias(texto: string): Alias {
  return parseAlias(texto) ?? parseLegado(texto);
}

/** Remonta a description a partir dos campos. Espelha formato.monta(). */
export function montarAlias(a: Partial<Alias> & { tipo: Tipo }): string {
  const campo = (v?: string) => (v || '').trim().split(SEP).join('_');
  const partes: string[] = [];
  const sigla = campo(a.sigla);
  partes.push(sigla ? a.tipo + TAG + sigla : a.tipo);
  for (const [chave, etiqueta] of Object.entries(TAGS)) {
    const v = campo((a as unknown as Record<string, string | undefined>)[chave]);
    if (v) partes.push(SEM_ETIQUETA.has(chave as ChaveTag) ? v : etiqueta + TAG + v);
  }
  const base = partes.join(SEP);
  const obs = (a.obs || '').trim();
  return obs ? base + SEP + obs : base;
}
