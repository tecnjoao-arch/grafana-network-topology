// utils/status.ts — Resolução de status ao vivo de nós e links.
// Puro e sem estado: recebe dados + séries, devolve status/cor/causa. Usado em
// useMemos do painel e compartilhado entre nós e arestas.
//
// PRINCÍPIO: ausência de dado nunca vira verde. Um incidente real (2026-08)
// mostrou o mapa mentindo de três formas ao mesmo tempo — nó mantinha o status
// salvo quando a série sumia, link ficava 'up' só porque existia número de
// tráfego, e o tráfego exibido era espelhado do lado vizinho (vivo). Todas as
// regras abaixo existem para que "não sei" e "está bom" nunca se pareçam.

import { DataFrame } from '@grafana/data';
import { DeviceNodeData, LinkStatus, StatusCause, StatusOperator } from '../types';
import { BindingResult, resolveBindingDetailed } from './dataBinding';

/** Avalia a regra "valor <op> alvo" → up/down. Sem valor → unknown. */
export function evaluateStatus(
  value: number | undefined,
  op?: StatusOperator,
  target?: number
): LinkStatus {
  if (value === undefined) return 'unknown';
  const tgt = target ?? 0;
  let isUp: boolean;
  switch (op ?? '>') {
    case '==': isUp = value === tgt; break;
    case '!=': isUp = value !== tgt; break;
    case '>': isUp = value > tgt; break;
    case '>=': isUp = value >= tgt; break;
    case '<': isUp = value < tgt; break;
    case '<=': isUp = value <= tgt; break;
    default: isUp = value > tgt;
  }
  return isUp ? 'up' : 'down';
}

/** Status que uma cor de regra representa. As regras de cor são a única
 *  configuração de status do editor de nó, e o seletor de cor sempre entrega
 *  #rrggbb. Vermelho = down; laranja/âmbar/amarelo = alerta; cinza, preto e
 *  branco = indeterminado; qualquer outra cor (verde, azul…) = normal.
 *  Rosa e magenta ficam fora do vermelho de propósito: são escolha estética
 *  mais comum que sinal de queda. */
export function statusFromColor(hex: string): LinkStatus {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'up';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.18 || l < 0.08 || l > 0.95) return 'unknown';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h >= 340) return 'down';
  if (h < 70) return 'warning';
  return 'up';
}

/** "há 12 min" / "há 45 s" — idade legível da última amostra. */
function fmtAge(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const min = Math.round(ms / 60000);
  if (min >= 1) return ` há ${min} min`;
  return ` há ${Math.round(ms / 1000)} s`;
}

export interface StatusOutcome {
  status: LinkStatus;
  cause?: StatusCause;
  /** Frase pronta pra tela ("Equipamento sem resposta") */
  detail?: string;
}

/** Nó sem binding mantém o status salvo, que pode ser ausente — por isso
 *  `status` aqui é opcional, ao contrário do resultado de um link. */
export interface NodeLiveStatus extends Omit<StatusOutcome, 'status'> {
  status?: LinkStatus;
  color?: string;
}

/** Resolve o status/cor ao vivo de um nó.
 *  Sem binding: mantém o que está salvo (elemento estático, escolha do usuário).
 *  COM binding e sem valor: cai para down — antes mantinha o status salvo, que
 *  é como um equipamento morto continuava verde depois do Zabbix parar. */
export function resolveNodeStatus(
  data: DeviceNodeData,
  series: DataFrame[],
  noData = false
): NodeLiveStatus {
  if (!data.statusBinding) return { status: data.status, color: data.color };

  if (noData) {
    return { status: 'unknown', cause: 'nodata', detail: 'Sem dados do datasource' };
  }

  const r = resolveBindingDetailed(series, data.statusBinding);
  if (r.state !== 'ok') {
    return r.state === 'stale'
      ? { status: 'down', cause: 'sem-coleta', detail: `Sem coleta${fmtAge(r.ageMs)}` }
      : { status: 'down', cause: 'sem-serie', detail: 'Sem coleta — interface desabilitada ou binding incorreto' };
  }

  if (data.colorMappings && data.colorMappings.length > 0) {
    const liveStr = String(r.value).trim().toLowerCase();
    const matched = data.colorMappings.find(
      (m) => String(m.value).trim().toLowerCase() === liveStr
    );
    if (!matched) {
      return { status: 'unknown', color: data.color, cause: 'nao-configurado', detail: 'Valor sem regra correspondente' };
    }
    // A cor da regra DEFINE o status. Antes, qualquer regra que casasse
    // marcava o nó como 'up', inclusive "0 → vermelho": o ícone só parecia
    // caído porque herdava a cor, e o status seguia 'up' — sem derrubar os
    // links, sem causa, sem amortecimento. Com o ícone colorido pelo status,
    // isso viraria um roteador caído pintado de azul.
    const status = statusFromColor(matched.color);
    return {
      status,
      color: data.color,
      cause: status === 'down' ? 'ping' : undefined,
      detail: status === 'down' ? 'Equipamento sem resposta'
        : status === 'warning' ? `Alerta (valor ${liveStr})` : undefined,
    };
  }

  const status = evaluateStatus(r.value, data.statusOperator, data.statusValue);
  return {
    status,
    color: data.color,
    cause: status === 'down' ? 'ping' : undefined,
    detail: status === 'down' ? 'Equipamento sem resposta' : undefined,
  };
}

// ── Amortecimento de piscada (flap damping) ─────────────────────────────────

export interface FlapState {
  /** Ciclos seguidos reportando down */
  streak: number;
  /** Último estado efetivamente mostrado na tela */
  shown: NodeLiveStatus;
}

/** Só confirma 'down' depois de `cycles` ciclos seguidos falhando.
 *
 *  Existe porque ping perdido, coleta atrasada e resposta parcial do datasource
 *  são transitórios — somem no ciclo seguinte —, mas cada um pinta o mapa de
 *  vermelho no meio tempo, e um nó piscando arrasta todos os links dele junto.
 *
 *  Regras que NÃO podem ser afrouxadas, sob risco de esconder queda de verdade:
 *   • recuperação é IMEDIATA (voltou a responder → mostra na hora);
 *   • quem já estava down continua down (não reabre contagem a cada ciclo);
 *   • sem estado anterior para segurar, mostra o que veio (carga inicial).
 *
 *  `advance` deve ser true só uma vez por chegada de dados: re-render por
 *  edição ou hover não pode contar como ciclo. Pura — estado entra e sai. */
export function dampStatus<T extends NodeLiveStatus>(
  prev: FlapState | undefined,
  cur: T,
  cycles: number,
  advance: boolean
): { shown: T; next: FlapState } {
  if (cycles <= 1 || cur.status !== 'down') {
    return { shown: cur, next: { streak: 0, shown: cur } };
  }

  const streak = (prev?.streak ?? 0) + (advance ? 1 : 0);
  const confirmado = streak >= cycles || !prev?.shown || prev.shown.status === 'down';
  const shown = confirmado ? cur : (prev!.shown as T);
  return { shown, next: { streak, shown } };
}

/** Um lado do link COM binding de status configurado. */
export interface SideStatus {
  /** Como chamar esse lado na mensagem (nome do equipamento ou da interface) */
  label: string;
  result: BindingResult;
}

export interface LinkStatusInput {
  /** Datasource não respondeu: nada no mapa é confiável */
  noData: boolean;
  /** Nome do equipamento adjacente que está down (undefined = ambos de pé) */
  endpointDown?: string;
  /** Somente os lados que TÊM binding de status configurado */
  sides: SideStatus[];
  operator?: StatusOperator;
  value?: number;
  /** Maior tráfego FRESCO do link (undefined/0 = sem prova de vida) */
  freshTraffic?: number;
}

/** Status de um link, com a causa. Precedência (a primeira que casa vence):
 *   1. datasource sem resposta      → unknown (cinza; nada é confiável)
 *   2. equipamento da ponta down    → down    (causa raiz ganha das demais)
 *   3. operStatus medido como down  → down    (mais específico que "sem coleta")
 *   4. operStatus sem valor         → down    (parou de coletar / série sumiu)
 *   5. sem operStatus + tráfego     → up      (inferido; bits frescos são prova)
 *   6. nada configurado             → unknown (nunca verde por omissão)
 *  Tráfego NÃO promove status quando há operStatus: durante um incidente o
 *  número pode estar velho ou vir do lado vizinho, e foi assim que link caído
 *  apareceu verde "com tráfego passando". */
export function resolveLinkStatus(i: LinkStatusInput): StatusOutcome {
  if (i.noData) {
    return { status: 'unknown', cause: 'nodata', detail: 'Sem dados do datasource' };
  }

  if (i.endpointDown) {
    return { status: 'down', cause: 'ping', detail: `${i.endpointDown} sem resposta` };
  }

  if (i.sides.length > 0) {
    // Medido como down primeiro: é informação mais precisa que ausência
    for (const s of i.sides) {
      if (s.result.state === 'ok' && evaluateStatus(s.result.value, i.operator, i.value) === 'down') {
        return { status: 'down', cause: 'iface', detail: `Interface down (${s.label})` };
      }
    }
    for (const s of i.sides) {
      if (s.result.state === 'stale') {
        return {
          status: 'down',
          cause: 'sem-coleta',
          detail: `Sem coleta${fmtAge(s.result.ageMs)} (${s.label})`,
        };
      }
      if (s.result.state === 'missing') {
        return {
          status: 'down',
          cause: 'sem-serie',
          detail: `Sem coleta (${s.label}) — interface desabilitada ou binding incorreto`,
        };
      }
    }
    return { status: 'up' };
  }

  // Sem operStatus em lado nenhum: bits frescos passando provam que o link vive.
  // Tráfego zero NÃO vira down — link de backup legitimamente fica em zero.
  if (i.freshTraffic !== undefined && i.freshTraffic > 0) {
    return { status: 'up', cause: 'inferido', detail: 'Status inferido por tráfego' };
  }

  return {
    status: 'unknown',
    cause: 'nao-configurado',
    detail: 'Sem status operacional configurado',
  };
}
