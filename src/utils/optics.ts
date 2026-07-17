// utils/optics.ts — Avaliação de potência óptica contra os limiares reais da
// interface (coletados do Zabbix: Alarm/Warning × High/Low). Funções puras.

import { OpticKey } from '../types';

export type OpticalLevel = 'ok' | 'warn' | 'alarm';

export interface OpticalRange {
  alarmLow?: number;
  warnLow?: number;
  warnHigh?: number;
  alarmHigh?: number;
}

/** Fatia os limiares de Rx de um conjunto resolvido. */
export function rxThresholds(t?: Partial<Record<OpticKey, number>>): OpticalRange | undefined {
  if (!t) return undefined;
  return { alarmLow: t.rxAlarmLow, warnLow: t.rxWarnLow, warnHigh: t.rxWarnHigh, alarmHigh: t.rxAlarmHigh };
}

/** Fatia os limiares de Tx de um conjunto resolvido. */
export function txThresholds(t?: Partial<Record<OpticKey, number>>): OpticalRange | undefined {
  if (!t) return undefined;
  return { alarmLow: t.txAlarmLow, warnLow: t.txWarnLow, warnHigh: t.txWarnHigh, alarmHigh: t.txAlarmHigh };
}

/** Avalia um valor (dBm) contra a faixa: alarm ⊃ warn ⊃ ok.
 *  undefined quando não há valor ou nenhum limiar pra comparar. */
export function evalOptical(value: number | undefined, range?: OpticalRange): OpticalLevel | undefined {
  if (value === undefined || !range) return undefined;
  const { alarmLow, warnLow, warnHigh, alarmHigh } = range;
  const hasAny = alarmLow !== undefined || warnLow !== undefined || warnHigh !== undefined || alarmHigh !== undefined;
  if (!hasAny) return undefined;
  if ((alarmLow !== undefined && value <= alarmLow) || (alarmHigh !== undefined && value >= alarmHigh)) return 'alarm';
  if ((warnLow !== undefined && value <= warnLow) || (warnHigh !== undefined && value >= warnHigh)) return 'warn';
  return 'ok';
}

/** Cor pro nível óptico; `fallback` quando não há avaliação. */
export function opticalColor(level: OpticalLevel | undefined, fallback: string): string {
  switch (level) {
    case 'alarm': return '#ef4444';
    case 'warn': return '#facc15';
    case 'ok': return '#22c55e';
    default: return fallback;
  }
}

/** Texto compacto da faixa de operação (prioriza warning; cai pra alarm). */
export function formatRange(range?: OpticalRange): string | undefined {
  if (!range) return undefined;
  const lo = range.warnLow ?? range.alarmLow;
  const hi = range.warnHigh ?? range.alarmHigh;
  if (lo === undefined && hi === undefined) return undefined;
  const f = (n?: number) => (n === undefined ? '—' : n.toFixed(1));
  return `${f(lo)} … ${f(hi)} dBm`;
}
