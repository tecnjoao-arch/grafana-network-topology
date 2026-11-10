// utils/filtroExato.ts — o filtro de host e de item que traz só as séries que
// o mapa usa.
//
// As consultas costumam ser largas (uma regex que pega todas as interfaces
// dos roteadores), porque é assim que se monta o mapa: tudo aparece na lista
// para escolher. Com o mapa pronto, a maior parte do que chega não é usada
// por nenhum binding — e é buscada no Zabbix, trafegada e indexada a cada
// atualização. Isto olha os bindings do mapa, acha a série que cada um usa e
// monta, por consulta, as duas regex para colar nos campos Host e Item.

import { DataFrame } from '@grafana/data';
import { NetworkTopology } from '../types';
import { MetricBinding, seriesDoBinding } from './dataBinding';

export interface FiltroDaConsulta {
  refId: string;
  /** Séries que a consulta traz hoje */
  total: number;
  /** Séries que algum binding usa */
  usadas: number;
  /** Séries que chegariam com o filtro colado — conferido aplicando as duas
   *  regex nas séries de agora. Pode passar um pouco de `usadas`: host e item
   *  são campos separados, então um item usado num host vem também de outro
   *  host da lista que tenha item com o mesmo nome. */
  chegam: number;
  /** Regex para o campo Host — vazio quando as séries não têm os rótulos
   *  host/item (consulta de outro datasource, não do Zabbix). */
  host: string;
  /** Regex para o campo Item */
  item: string;
}

export interface FiltroExato {
  consultas: FiltroDaConsulta[];
  /** Bindings que não casaram com nenhuma série: ficam de fora do filtro */
  semSerie: number;
}

/** Todo objeto com `match` de texto preenchido é um binding — pega os dos nós,
 *  dos links, dos limiares de óptica e das infos de módulo sem listar campo
 *  por campo (um binding novo entra sozinho). */
export function bindingsDoMapa(topo: NetworkTopology | undefined): MetricBinding[] {
  const achados: MetricBinding[] = [];
  const visita = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      o.forEach(visita);
      return;
    }
    const obj = o as Record<string, unknown>;
    if (typeof obj.match === 'string' && obj.match) achados.push(obj as unknown as MetricBinding);
    for (const k of Object.keys(obj)) visita(obj[k]);
  };
  for (const n of topo?.nodes ?? []) visita(n.data);
  for (const e of topo?.edges ?? []) visita(e.data);
  return achados;
}

/** Escapa um texto para valer literalmente dentro de /.../ — a barra também,
 *  porque é ela que delimita a regex no campo do Zabbix. */
function literal(texto: string): string {
  return texto.replace(/[\\^$.*+?()[\]{}|\/]/g, '\\$&');
}

const ou = (valores: Iterable<string>) => Array.from(new Set(valores)).sort().map(literal).join('|');

function regexDeHosts(hosts: Set<string>): string {
  return `/^(${ou(hosts)})$/`;
}

/** Os itens de interface são "Interface X(descrição): Bits received", "…: Bits
 *  sent", "…: Speed": o mesmo começo repetido com poucos finais. Escrever cada
 *  nome inteiro dá uma regex de mais de 10 mil caracteres; separando o começo
 *  do final — /^(começos): (finais)$/ — ela cai para um terço. O custo é
 *  trazer também as combinações começo+final que o mapa não usa (o Speed de
 *  uma interface que só tem tráfego ligado), e por isso `chegam` é medido. */
function regexDeItens(itens: Set<string>): string {
  const comecos: string[] = [];
  const finais: string[] = [];
  const inteiros: string[] = [];
  for (const item of itens) {
    const corte = item.lastIndexOf(': ');
    if (corte > 0) {
      comecos.push(item.slice(0, corte));
      finais.push(item.slice(corte + 2));
    } else {
      inteiros.push(item);
    }
  }
  const partes: string[] = [];
  if (comecos.length) partes.push(`(${ou(comecos)}): (${ou(finais)})`);
  if (inteiros.length) partes.push(ou(inteiros));
  return partes.length === 1 && !inteiros.length ? `/^${partes[0]}$/` : `/^(${partes.join('|')})$/`;
}

/** A regex como o campo do Zabbix a lê: o miolo entre as barras. */
function compila(regex: string): RegExp {
  return new RegExp(regex.slice(1, -1));
}

export function filtroExato(series: DataFrame[], topo: NetworkTopology | undefined): FiltroExato {
  const porConsulta = new Map<string, { total: number; usadas: Set<string>; hosts: Set<string>; itens: Set<string>; semRotulo: boolean }>();
  const consulta = (refId: string) => {
    let c = porConsulta.get(refId);
    if (!c) {
      c = { total: 0, usadas: new Set(), hosts: new Set(), itens: new Set(), semRotulo: false };
      porConsulta.set(refId, c);
    }
    return c;
  };
  const camposDeDado = (frame: DataFrame) => frame.fields.filter((f) => f.type === 'number' || f.type === 'string');
  for (const frame of series) consulta(frame.refId ?? '').total += camposDeDado(frame).length;

  let semSerie = 0;
  const vistos = new Set<string>();
  for (const b of bindingsDoMapa(topo)) {
    const chave = `${b.query ?? ''}|${b.match}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const usadas = seriesDoBinding(series, b);
    if (usadas.length === 0) semSerie++;
    for (const s of usadas) {
      const c = consulta(s.refId);
      c.usadas.add(s.id);
      if (s.host && s.item) {
        c.hosts.add(s.host);
        c.itens.add(s.item);
      } else {
        c.semRotulo = true;
      }
    }
  }

  const consultas: FiltroDaConsulta[] = [];
  for (const [refId, c] of porConsulta) {
    if (c.usadas.size === 0) continue;
    const comRotulo = !c.semRotulo && c.hosts.size > 0;
    const host = comRotulo ? regexDeHosts(c.hosts) : '';
    const item = comRotulo ? regexDeItens(c.itens) : '';
    let chegam = c.usadas.size;
    if (comRotulo) {
      const reHost = compila(host);
      const reItem = compila(item);
      chegam = 0;
      for (const frame of series) {
        if ((frame.refId ?? '') !== refId) continue;
        for (const f of camposDeDado(frame)) {
          if (reHost.test(f.labels?.host ?? '') && reItem.test(f.labels?.item ?? '')) chegam++;
        }
      }
    }
    consultas.push({ refId, total: c.total, usadas: c.usadas.size, chegam, host, item });
  }
  consultas.sort((a, b) => a.refId.localeCompare(b.refId));
  return { consultas, semSerie };
}
