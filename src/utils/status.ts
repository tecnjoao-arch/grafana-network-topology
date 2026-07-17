// utils/status.ts — Resolução de status ao vivo dos nós (equipamentos).
// Puro e sem estado: recebe dados + séries, devolve status/cor. Usado num único
// useMemo do painel e compartilhado entre nós e arestas (nó down → links apagados).

import { DataFrame } from '@grafana/data';
import { DeviceNodeData, LinkStatus, StatusOperator } from '../types';
import { resolveBinding } from './dataBinding';

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

export interface NodeLiveStatus {
  status?: LinkStatus;
  color?: string;
}

/** Resolve o status/cor ao vivo de um nó: binding + (mapeamentos OU operador).
 *  Sem binding (ou sem valor resolvido), mantém o que está salvo no nó. */
export function resolveNodeStatus(data: DeviceNodeData, series: DataFrame[]): NodeLiveStatus {
  let status = data.status;
  let color = data.color;

  const live = resolveBinding(series, data.statusBinding);
  if (data.statusBinding && live !== undefined) {
    if (data.colorMappings && data.colorMappings.length > 0) {
      const liveStr = String(live).trim().toLowerCase();
      const matched = data.colorMappings.find(
        (m) => String(m.value).trim().toLowerCase() === liveStr
      );
      if (matched) {
        color = matched.color;
        status = 'up'; // badge/cor ativados; o DeviceNode usa `color` pra pintar
      } else {
        status = 'unknown';
      }
    } else {
      status = evaluateStatus(live, data.statusOperator, data.statusValue);
    }
  }

  return { status, color };
}
