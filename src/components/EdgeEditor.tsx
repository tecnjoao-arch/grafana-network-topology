// components/EdgeEditor.tsx — Painel de edição da aresta selecionada.
// Cor, traçado, animação, espessura e nomes de interface. Portal p/ document.body.

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LinkEdgeData, LineStyle, LineAnimation, LINE_STYLES, LINE_ANIMATIONS, PathType, PATH_TYPES, LabelFooter, LABEL_FOOTERS } from '../types';
import { MetricBinding, Aggregation } from '../utils/dataBinding';
import { discoverInterfaces, DiscoveredInterface } from '../utils/discovery';
import { SeriesCombo } from './SeriesCombo';

interface Props {
  edgeId: string;
  data: LinkEdgeData;
  sourceLabel: string;
  targetLabel: string;
  seriesKeys: string[];
  onChange: (patch: Partial<LinkEdgeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const AGGS: Aggregation[] = ['last', 'avg', 'max', 'min', 'first'];

const PRESET_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#94a3b8', '#ffffff'];

/** Converte "400G", "10g", "1.5T", "10000000000" em bps. undefined se vazio/inválido. */
function parseBps(txt: string): number | undefined {
  const m = txt.trim().match(/^([\d.,]+)\s*([kKmMgGtT])?/);
  if (!m) return undefined;
  const num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return undefined;
  const mult: Record<string, number> = { k: 1e3, m: 1e6, g: 1e9, t: 1e12 };
  return Math.round(num * (mult[(m[2] ?? '').toLowerCase()] ?? 1));
}

const STYLE_LABEL: Record<LineStyle, string> = {
  solid: 'Sólida',
  dashed: 'Tracejada',
  dotted: 'Pontilhada',
  double: 'Dupla',
};
const ANIM_LABEL: Record<LineAnimation, string> = {
  none: 'Nenhuma',
  flow: 'Fluxo →',
  reverse: 'Fluxo ←',
  pulse: 'Pulsar',
  glow: 'Brilho',
};
const PATH_LABEL: Record<PathType, string> = {
  straight: 'Reta',
  curved: 'Curva (Draw.io)',
  step: 'Ortogonal (Grau 90)',
};
const FOOTER_LABEL: Record<LabelFooter, string> = {
  speed: 'Velocidade',
  fiber: 'Fibra (Tx/Rx)',
  both: 'Ambos',
  none: 'Nenhum',
};

export const EdgeEditor: React.FC<Props> = ({ data, sourceLabel, targetLabel, seriesKeys, onChange, onDelete, onClose }) => {
  const color = data.color ?? '#22c55e';
  const [showSeries, setShowSeries] = useState(false);
  // Texto da capacidade fixa (só grava quando o usuário digita)
  const [speedText, setSpeedText] = useState('');
  // Thresholds ativos = cor/animação manuais viram só reserva (quando nenhuma regra casa)
  const thresholdsActive = !!(data.statusBinding?.match && (data.colorMappings?.length ?? 0) > 0);

  // Interfaces detectadas no datasource → auto-preenchimento de um lado inteiro
  const interfaces = useMemo(() => discoverInterfaces(seriesKeys), [seriesKeys]);

  /** Preenche todos os bindings de um lado (e os globais) a partir de uma interface detectada. */
  const autoFill = (intf: DiscoveredInterface, side: 'source' | 'target') => {
    const m = intf.metrics;
    const bind = (key?: string): MetricBinding | undefined => (key ? { match: key, aggregation: 'last' } : undefined);
    const patch: Partial<LinkEdgeData> = { showTrafficBox: true };
    if (side === 'source') {
      patch.sourceInterface = intf.iface;
      if (m.inbound) patch.sourceTrafficUpBinding = bind(m.inbound);
      if (m.outbound) patch.sourceTrafficDownBinding = bind(m.outbound);
      if (m.errors) patch.sourceErrorBinding = bind(m.errors);
      if (m.ip) patch.sourceIpBinding = bind(m.ip);
      if (m.domTx) patch.sourceDomTxPowerBinding = bind(m.domTx);
      if (m.domRx) patch.sourceDomRxPowerBinding = bind(m.domRx);
      if (m.domTemp) patch.sourceDomTempBinding = bind(m.domTemp);
      if (m.domVolt) patch.sourceDomVoltBinding = bind(m.domVolt);
      if (m.domBias) patch.sourceDomBiasBinding = bind(m.domBias);
    } else {
      patch.targetInterface = intf.iface;
      if (m.inbound) patch.targetTrafficUpBinding = bind(m.inbound);
      if (m.outbound) patch.targetTrafficDownBinding = bind(m.outbound);
      if (m.errors) patch.targetErrorBinding = bind(m.errors);
      if (m.ip) patch.targetIpBinding = bind(m.ip);
      if (m.domTx) patch.targetDomTxPowerBinding = bind(m.domTx);
      if (m.domRx) patch.targetDomRxPowerBinding = bind(m.domRx);
      if (m.domTemp) patch.targetDomTempBinding = bind(m.domTemp);
      if (m.domVolt) patch.targetDomVoltBinding = bind(m.domVolt);
      if (m.domBias) patch.targetDomBiasBinding = bind(m.domBias);
    }
    if (m.speed) patch.speedBinding = bind(m.speed);
    if (m.status) patch.statusBinding = bind(m.status);
    onChange(patch);
  };

  const patchBinding = (
    key:
      | 'trafficUpBinding'
      | 'trafficDownBinding'
      | 'sourceTrafficUpBinding'
      | 'sourceTrafficDownBinding'
      | 'targetTrafficUpBinding'
      | 'targetTrafficDownBinding'
      | 'speedBinding'
      | 'sourceIpBinding'
      | 'targetIpBinding'
      | 'sourceErrorBinding'
      | 'targetErrorBinding'
      | 'statusBinding'
      | 'sourceDomTempBinding'
      | 'sourceDomVoltBinding'
      | 'sourceDomBiasBinding'
      | 'sourceDomTxPowerBinding'
      | 'sourceDomRxPowerBinding'
      | 'targetDomTempBinding'
      | 'targetDomVoltBinding'
      | 'targetDomBiasBinding'
      | 'targetDomTxPowerBinding'
      | 'targetDomRxPowerBinding',
    patch: Partial<MetricBinding>
  ) => {
    const cur: MetricBinding = (data as any)[key] ?? { match: '', aggregation: 'last' };
    const next = { ...cur, ...patch };
    onChange({ [key]: next.match ? next : undefined } as any);
  };

  const sourceX = data.sourceAnchor ? Math.round(data.sourceAnchor.x * 100) : 50;
  const sourceY = data.sourceAnchor ? Math.round(data.sourceAnchor.y * 100) : 50;
  const targetX = data.targetAnchor ? Math.round(data.targetAnchor.x * 100) : 50;
  const targetY = data.targetAnchor ? Math.round(data.targetAnchor.y * 100) : 50;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 70,
        right: 20,
        width: 340,
        maxHeight: 'calc(100vh - 90px)',
        overflowY: 'auto',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 8,
        color: '#e2e8f0',
        zIndex: 10000,
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg,#1e293b,#0f172a)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Editar link</div>
          <div style={{ fontWeight: 600 }}>{sourceLabel} ↔ {targetLabel}</div>
        </div>
        <button onClick={onClose} style={btnClose}>✕</button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Aviso: thresholds mandam na cor/animação */}
        {thresholdsActive && (
          <div style={{
            background: 'rgba(59,130,246,0.08)', border: '1px solid #1d4ed8', borderRadius: 6,
            padding: '8px 10px', fontSize: 11, color: '#93c5fd', lineHeight: 1.5,
          }}>
            🎛️ Os <b>Thresholds</b> (regras abaixo) estão controlando a cor e a animação
            desta linha. "Cor da linha" e "Animação" valem só como <b>reserva</b>, quando
            nenhuma regra casar.
          </div>
        )}

        {/* Cor */}
        <div style={thresholdsActive ? { opacity: 0.5 } : undefined}>
        <Section title={thresholdsActive ? 'Cor da linha (reserva)' : 'Cor da linha'}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                style={{
                  width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                  background: c,
                  border: color === c ? '2px solid #fff' : '1px solid #334155',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#22c55e'}
              onChange={(e) => onChange({ color: e.target.value })}
              style={{ width: 38, height: 28, padding: 0, border: '1px solid #334155', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => onChange({ color: e.target.value })}
              style={inputText}
            />
            <button onClick={() => onChange({ color: undefined })} title="Voltar à cor automática (status)" style={btnReset}>auto</button>
          </div>
        </Section>
        </div>

        {/* Traçado */}
        <Section title="Traçado">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LINE_STYLES.map((s) => (
              <Chip key={s} active={(data.lineStyle ?? 'solid') === s} onClick={() => onChange({ lineStyle: s })}>
                {STYLE_LABEL[s]}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Formato / Roteamento */}
        <Section title="Formato (Roteamento)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {PATH_TYPES.map((pt) => (
              <Chip key={pt} active={(data.pathType ?? 'straight') === pt} onClick={() => onChange({ pathType: pt })}>
                {PATH_LABEL[pt]}
              </Chip>
            ))}
          </div>
          {(data.pathType === 'step') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              <input
                type="checkbox"
                checked={!!data.flipBends}
                onChange={(e) => onChange({ flipBends: e.target.checked })}
              />
              Inverter Curvas Ortogonais (90°)
            </label>
          )}
        </Section>

        {/* Animação */}
        <div style={thresholdsActive ? { opacity: 0.5 } : undefined}>
        <Section title={thresholdsActive ? 'Animação (reserva)' : 'Animação'}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LINE_ANIMATIONS.map((a) => (
              <Chip key={a} active={(data.animation ?? 'none') === a} onClick={() => onChange({ animation: a })}>
                {ANIM_LABEL[a]}
              </Chip>
            ))}
          </div>
        </Section>
        </div>

        {/* Espessura */}
        <Section title={`Espessura: ${data.lineWidth ?? 'auto'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={1}
              max={14}
              step={1}
              value={data.lineWidth ?? 4}
              onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <button onClick={() => onChange({ lineWidth: undefined })} title="Espessura automática (por uso)" style={btnReset}>auto</button>
          </div>
        </Section>

        {/* Posicionamento dos Cabos (Âncoras) */}
        <Section title="Âncoras dos Cabos (Manual)">
          <div style={{ background: '#0b1220', padding: 8, borderRadius: 6, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Origem ({sourceLabel})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 12 }}>X:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sourceX}
                  onChange={(e) => {
                    const x = Number(e.target.value) / 100;
                    onChange({ sourceAnchor: { x, y: sourceY / 100 } });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, width: 26, textAlign: 'right' }}>{sourceX}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 12 }}>Y:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sourceY}
                  onChange={(e) => {
                    const y = Number(e.target.value) / 100;
                    onChange({ sourceAnchor: { x: sourceX / 100, y } });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, width: 26, textAlign: 'right' }}>{sourceY}%</span>
              </div>
              {data.sourceAnchor && (
                <button
                  onClick={() => onChange({ sourceAnchor: undefined })}
                  style={{ ...btnReset, marginTop: 6, padding: '2px 6px', fontSize: 10 }}
                >
                  Resetar Origem p/ Auto
                </button>
              )}
            </div>

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6, marginTop: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Destino ({targetLabel})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 12 }}>X:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={targetX}
                  onChange={(e) => {
                    const x = Number(e.target.value) / 100;
                    onChange({ targetAnchor: { x, y: targetY / 100 } });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, width: 26, textAlign: 'right' }}>{targetX}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 12 }}>Y:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={targetY}
                  onChange={(e) => {
                    const y = Number(e.target.value) / 100;
                    onChange({ targetAnchor: { x: targetX / 100, y } });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, width: 26, textAlign: 'right' }}>{targetY}%</span>
              </div>
              {data.targetAnchor && (
                <button
                  onClick={() => onChange({ targetAnchor: undefined })}
                  style={{ ...btnReset, marginTop: 6, padding: '2px 6px', fontSize: 10 }}
                >
                  Resetar Destino p/ Auto
                </button>
              )}
            </div>
          </div>
        </Section>

        {/* Interfaces */}
        <Section title="Interfaces">
          <input
            type="text"
            placeholder="Interface origem (ex: Te0/0/0/1)"
            value={data.sourceInterface ?? ''}
            onChange={(e) => onChange({ sourceInterface: e.target.value })}
            style={{ ...inputText, width: '100%', marginBottom: 6 }}
          />
          <input
            type="text"
            placeholder="Interface destino"
            value={data.targetInterface ?? ''}
            onChange={(e) => onChange({ targetInterface: e.target.value })}
            style={{ ...inputText, width: '100%' }}
          />
          {(data.sourceLabelOffset || data.targetLabelOffset) && (
            <button
              onClick={() => onChange({ sourceLabelOffset: undefined, targetLabelOffset: undefined })}
              title="Volta os cards para a posição automática na linha"
              style={{ ...btnReset, width: '100%', marginTop: 6 }}
            >
              ↩ Resetar posição dos cards
            </button>
          )}
        </Section>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!data.showTrafficBox}
            onChange={(e) => onChange({ showTrafficBox: e.target.checked })}
          />
          Mostrar caixa de tráfego
        </label>

        {/* Rodapé do card: velocidade, potência da fibra, ambos ou nada */}
        <Section title="Rodapé do card (abaixo do ↑/↓)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LABEL_FOOTERS.map((f) => (
              <Chip key={f} active={(data.labelFooter ?? 'speed') === f} onClick={() => onChange({ labelFooter: f })}>
                {FOOTER_LABEL[f]}
              </Chip>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
            "Fibra" usa os bindings de Potência Tx/Rx DOM de cada lado (seção 🧬 abaixo).
          </div>
        </Section>

        {/* Thresholds (Flowcharting style) */}
        <Section title="Thresholds da Linha (Flowcharting)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0b1220', padding: 8, borderRadius: 6, border: '1px solid #1e293b' }}>
            <BindRow
              label="Métrica de Status"
              binding={data.statusBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('statusBinding', { match: m })}
              onAgg={(a) => patchBinding('statusBinding', { aggregation: a })}
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.colorMappings ?? []).map((mapping, idx) => {
                const patch = (p: Partial<typeof mapping>) => {
                  const list = [...(data.colorMappings ?? [])];
                  list[idx] = { ...list[idx], ...p };
                  onChange({ colorMappings: list });
                };
                return (
                  <div key={idx} style={{ background: '#1e293b', padding: 6, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Linha 1: nível · valor · cor · remover */}
                    <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 26px 22px', gap: 6, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11, color: '#3b82f6' }} title="Nível (ordem)">{idx}</div>
                      <input
                        type="text"
                        placeholder="Valor (ex: 1, 2, DOWN)"
                        value={mapping.value}
                        onChange={(e) => patch({ value: e.target.value })}
                        style={{ ...inputText, width: '100%', padding: '3px 4px', fontSize: 11 }}
                      />
                      <input
                        type="color"
                        value={mapping.color}
                        onChange={(e) => patch({ color: e.target.value })}
                        title="Cor da linha quando esta regra casa"
                        style={{ width: 24, height: 22, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0 }}
                      />
                      <button
                        onClick={() => onChange({ colorMappings: (data.colorMappings ?? []).filter((_, i) => i !== idx) })}
                        style={{ ...btnReset, borderColor: '#ef4444', color: '#ef4444', padding: '2px', textAlign: 'center', width: '100%', fontSize: 10 }}
                        title="Remover regra"
                      >
                        ✕
                      </button>
                    </div>
                    {/* Linha 2: traçado · animação */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, color: '#64748b', width: 36 }}>Traçado</span>
                        <select
                          value={mapping.lineStyle ?? ''}
                          onChange={(e) => patch({ lineStyle: (e.target.value || undefined) as any })}
                          style={{ ...inputText, width: '100%', cursor: 'pointer', padding: '2px 4px', fontSize: 11 }}
                        >
                          <option value="">— manter —</option>
                          {LINE_STYLES.map((s) => (
                            <option key={s} value={s}>{STYLE_LABEL[s]}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, color: '#64748b', width: 30 }}>Anim.</span>
                        <select
                          value={mapping.animation ?? 'none'}
                          onChange={(e) => patch({ animation: e.target.value as any })}
                          style={{ ...inputText, width: '100%', cursor: 'pointer', padding: '2px 4px', fontSize: 11 }}
                        >
                          {LINE_ANIMATIONS.map((anim) => (
                            <option key={anim} value={anim}>{ANIM_LABEL[anim]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  const list = [...(data.colorMappings ?? []), { value: '', color: '#ef4444', animation: 'flow' as const }];
                  onChange({ colorMappings: list });
                }}
                style={{ ...btnReset, width: '100%', borderStyle: 'dashed', background: 'transparent', color: '#3b82f6', borderColor: '#3b82f6', marginTop: 4 }}
              >
                ➕ Adicionar Regra
              </button>
            </div>
          </div>
        </Section>

        {/* ── Binding de dados (Zabbix etc) ── */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 2 }}>
          <Section title="Dados ao vivo (binding)">
            {/* ⚡ Auto-preenchimento: escolhe uma interface detectada e preenche o lado inteiro */}
            <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid #6b21a8', borderRadius: 6, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#c084fc', marginBottom: 2 }}>
                ⚡ Auto-preenchimento ({interfaces.length} interfaces detectadas)
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
                Escolha a interface de cada lado — preenche tráfego, erros, IP, DOM e capacidade de uma vez.
              </div>
              <AutoFillPicker label={`Lado A → ${sourceLabel}`} interfaces={interfaces} onPick={(i) => autoFill(i, 'source')} />
              <div style={{ height: 6 }} />
              <AutoFillPicker label={`Lado B → ${targetLabel}`} interfaces={interfaces} onPick={(i) => autoFill(i, 'target')} />
            </div>

            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              Ou ajuste manualmente — cole parte do nome da série. Aceita regex.
            </div>

            <div style={{ marginTop: 8, marginBottom: 4, fontSize: 11, color: '#3b82f6', fontWeight: 'bold' }}>
              Lado A (Origem - {sourceLabel})
            </div>
            <BindRow
              label="🟢 Inbound (bps) — bits received"
              binding={data.sourceTrafficUpBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceTrafficUpBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceTrafficUpBinding', { aggregation: a })}
            />
            <BindRow
              label="🔵 Outbound (bps) — bits sent"
              binding={data.sourceTrafficDownBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceTrafficDownBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceTrafficDownBinding', { aggregation: a })}
            />

            <div style={{ marginTop: 12, marginBottom: 4, fontSize: 11, color: '#10b981', fontWeight: 'bold' }}>
              Lado B (Destino - {targetLabel})
            </div>
            <BindRow
              label="🟢 Inbound (bps) — bits received"
              binding={data.targetTrafficUpBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetTrafficUpBinding', { match: m })}
              onAgg={(a) => patchBinding('targetTrafficUpBinding', { aggregation: a })}
            />
            <BindRow
              label="🔵 Outbound (bps) — bits sent"
              binding={data.targetTrafficDownBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetTrafficDownBinding', { match: m })}
              onAgg={(a) => patchBinding('targetTrafficDownBinding', { aggregation: a })}
            />

            <div style={{ borderTop: '1px solid #1e293b', marginTop: 12, paddingTop: 12 }}>
              <BindRow
                label="Capacidade Global (bps)"
                binding={data.speedBinding}
                seriesKeys={seriesKeys}
                onMatch={(m) => patchBinding('speedBinding', { match: m })}
                onAgg={(a) => patchBinding('speedBinding', { aggregation: a })}
              />
              {/* Capacidade fixa: fallback quando o item Speed não resolve (coleta lenta) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>ou fixa:</span>
                <input
                  type="text"
                  placeholder={data.linkSpeed !== undefined ? `atual: ${data.linkSpeed} bps` : 'ex: 400G, 10G, 1.5T'}
                  value={speedText}
                  onChange={(e) => {
                    setSpeedText(e.target.value);
                    onChange({ linkSpeed: parseBps(e.target.value) });
                  }}
                  style={{ ...inputText, flex: 1 }}
                />
              </div>
            </div>
            
            <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, color: '#64748b', fontWeight: 'bold' }}>
              Endereços IP (Zabbix)
            </div>
            <BindRow
              label={`IP Origem (${sourceLabel})`}
              binding={data.sourceIpBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceIpBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceIpBinding', { aggregation: a })}
            />
            <BindRow
              label={`IP Destino (${targetLabel})`}
              binding={data.targetIpBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetIpBinding', { match: m })}
              onAgg={(a) => patchBinding('targetIpBinding', { aggregation: a })}
            />
            
            <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, color: '#ef4444', fontWeight: 'bold' }}>
              Métricas de Erros / Drops
            </div>
            <BindRow
              label={`Erros Origem (${sourceLabel})`}
              binding={data.sourceErrorBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceErrorBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceErrorBinding', { aggregation: a })}
            />
            <BindRow
              label={`Erros Destino (${targetLabel})`}
              binding={data.targetErrorBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetErrorBinding', { match: m })}
              onAgg={(a) => patchBinding('targetErrorBinding', { aggregation: a })}
            />

            <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, color: '#a855f7', fontWeight: 'bold', borderTop: '1px solid #1e293b', paddingTop: 12 }}>
              🧬 Parâmetros de Fibra (DOM) - Origem ({sourceLabel})
            </div>
            <BindRow
              label="Temperatura DOM (°C)"
              binding={data.sourceDomTempBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceDomTempBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceDomTempBinding', { aggregation: a })}
            />
            <BindRow
              label="Voltagem DOM (V)"
              binding={data.sourceDomVoltBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceDomVoltBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceDomVoltBinding', { aggregation: a })}
            />
            <BindRow
              label="Corrente de Polarização Bias (mA)"
              binding={data.sourceDomBiasBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceDomBiasBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceDomBiasBinding', { aggregation: a })}
            />
            <BindRow
              label="Potência Tx DOM (dBm ou mW)"
              binding={data.sourceDomTxPowerBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceDomTxPowerBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceDomTxPowerBinding', { aggregation: a })}
            />
            <BindRow
              label="Potência Rx DOM (dBm ou mW)"
              binding={data.sourceDomRxPowerBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('sourceDomRxPowerBinding', { match: m })}
              onAgg={(a) => patchBinding('sourceDomRxPowerBinding', { aggregation: a })}
            />

            <div style={{ marginTop: 16, marginBottom: 8, fontSize: 11, color: '#a855f7', fontWeight: 'bold', borderTop: '1px solid #1e293b', paddingTop: 12 }}>
              🧬 Parâmetros de Fibra (DOM) - Destino ({targetLabel})
            </div>
            <BindRow
              label="Temperatura DOM (°C)"
              binding={data.targetDomTempBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetDomTempBinding', { match: m })}
              onAgg={(a) => patchBinding('targetDomTempBinding', { aggregation: a })}
            />
            <BindRow
              label="Voltagem DOM (V)"
              binding={data.targetDomVoltBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetDomVoltBinding', { match: m })}
              onAgg={(a) => patchBinding('targetDomVoltBinding', { aggregation: a })}
            />
            <BindRow
              label="Corrente de Polarização Bias (mA)"
              binding={data.targetDomBiasBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetDomBiasBinding', { match: m })}
              onAgg={(a) => patchBinding('targetDomBiasBinding', { aggregation: a })}
            />
            <BindRow
              label="Potência Tx DOM (dBm ou mW)"
              binding={data.targetDomTxPowerBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetDomTxPowerBinding', { match: m })}
              onAgg={(a) => patchBinding('targetDomTxPowerBinding', { aggregation: a })}
            />
            <BindRow
              label="Potência Rx DOM (dBm ou mW)"
              binding={data.targetDomRxPowerBinding}
              seriesKeys={seriesKeys}
              onMatch={(m) => patchBinding('targetDomRxPowerBinding', { match: m })}
              onAgg={(a) => patchBinding('targetDomRxPowerBinding', { aggregation: a })}
            />

            <button onClick={() => setShowSeries((s) => !s)} style={{ ...btnReset, width: '100%', marginTop: 8 }}>
              {showSeries ? '▾ ocultar' : '▸ ver'} séries detectadas ({seriesKeys.length})
            </button>
            {showSeries && (
              <div style={{ marginTop: 6, maxHeight: 100, overflowY: 'auto', background: '#0b1220', border: '1px solid #334155', borderRadius: 4, padding: 6 }}>
                {seriesKeys.length === 0 && (
                  <div style={{ fontSize: 11, color: '#64748b' }}>Nenhuma série. Configure uma query no painel.</div>
                )}
                {seriesKeys.map((k, i) => (
                  <div key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#94a3b8', padding: '2px 0', borderBottom: '1px solid #1e293b', wordBreak: 'break-all' }}>
                    {k}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── Excluir ── */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 2 }}>
          <button
            onClick={() => {
              if (window.confirm('Tem certeza que deseja excluir esta conexão?')) {
                onDelete();
                onClose();
              }
            }}
            style={{ ...btnReset, width: '100%', borderColor: '#ef4444', color: '#ef4444' }}
          >
            🗑 Excluir Conexão
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Seletor filtrável de interface detectada; ao escolher uma exata, dispara onPick. */
const AutoFillPicker: React.FC<{
  label: string;
  interfaces: DiscoveredInterface[];
  onPick: (i: DiscoveredInterface) => void;
}> = ({ label, interfaces, onPick }) => {
  const [val, setVal] = useState('');
  const labels = useMemo(() => interfaces.map((i) => i.label), [interfaces]);
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex' }}>
        <SeriesCombo
          value={val}
          seriesKeys={labels}
          placeholder="digite o host / interface…"
          onChange={(v) => {
            setVal(v);
            const found = interfaces.find((i) => i.label === v);
            if (found) onPick(found);
          }}
        />
      </div>
    </div>
  );
};

const BindRow: React.FC<{
  label: string;
  binding?: MetricBinding;
  seriesKeys: string[];
  onMatch: (m: string) => void;
  onAgg: (a: Aggregation) => void;
}> = ({ label, binding, seriesKeys, onMatch, onAgg }) => {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <SeriesCombo
          value={binding?.match ?? ''}
          seriesKeys={seriesKeys}
          onChange={onMatch}
        />
        <select
          value={binding?.aggregation ?? 'last'}
          onChange={(e) => onAgg(e.target.value as Aggregation)}
          style={{ ...inputText, flex: 'none', width: 64, cursor: 'pointer' }}
        >
          {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
    {children}
  </div>
);

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '4px 10px',
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer',
      background: active ? '#3b82f6' : '#1e293b',
      color: active ? '#fff' : '#cbd5e1',
      border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
    }}
  >
    {children}
  </button>
);

const inputText: React.CSSProperties = {
  flex: 1,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: 'monospace',
};
const btnClose: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 4, padding: '3px 9px', cursor: 'pointer', fontSize: 13,
};
const btnReset: React.CSSProperties = {
  background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11,
};
