// components/NodeEditor.tsx — Painel de edição do nó selecionado.
// Label, IP, tipo de equipamento, cor, statusBinding.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { DeviceNodeData, DeviceType } from '../types';
import { MetricBinding, Aggregation } from '../utils/dataBinding';
import { useEditor } from './EditorContext';
import { SeriesCombo } from './SeriesCombo';

interface Props {
  nodeId: string;
  data: DeviceNodeData;
  seriesKeys: string[];
  customImages?: Array<{ url: string; name: string }>;
  onAddCustomImage?: (img: { url: string; name: string }) => void;
  onChange: (patch: Partial<DeviceNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const AGGS: Aggregation[] = ['last', 'avg', 'max', 'min', 'first'];

const DEVICE_TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: 'router', label: 'Roteador (Padrão)' },
  { value: 'router_modern', label: 'Roteador (Moderno)' },
  { value: 'router_3d', label: 'Roteador (3D Cisco)' },
  { value: 'router_cloud', label: 'Roteador (Abstrato)' },
  { value: 'switch', label: 'Switch' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'server', label: 'Servidor' },
  { value: 'cloud', label: 'Nuvem' },
  { value: 'internet', label: 'Internet' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'database', label: 'Banco de Dados' },
  { value: 'desktop', label: 'Computador' },
  { value: 'laptop', label: 'Notebook' },
  { value: 'generic', label: 'Genérico' },
  { value: 'custom', label: '🖼️ Upload de Imagem' },
];

export const NodeEditor: React.FC<Props> = ({
  nodeId,
  data,
  seriesKeys,
  customImages = [],
  onAddCustomImage,
  onChange,
  onDelete,
  onClose,
}) => {
  const [showSeries, setShowSeries] = useState(false);
  const { duplicateNode } = useEditor();

  const patchBinding = (patch: Partial<MetricBinding>) => {
    const cur: MetricBinding = data.statusBinding ?? { match: '', aggregation: 'last' };
    const next = { ...cur, ...patch };
    onChange({ statusBinding: next.match ? next : undefined });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      onChange({ customIcon: base64 });
      if (onAddCustomImage) {
        onAddCustomImage({ url: base64, name: file.name });
      }
    };
    reader.readAsDataURL(file);
  };

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
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Editar Equipamento</div>
          <div style={{ fontWeight: 600 }}>{data.label || nodeId}</div>
        </div>
        <button onClick={onClose} style={btnClose}>✕</button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="Propriedades Básicas">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="Nome (Label)"
              value={data.label}
              onChange={(e) => onChange({ label: e.target.value })}
              style={inputText}
            />
            <input
              type="text"
              placeholder="Endereço IP (opcional)"
              value={data.ip ?? ''}
              onChange={(e) => onChange({ ip: e.target.value })}
              style={inputText}
            />
            <input
              type="text"
              placeholder="URL do Dashboard (opcional)"
              value={data.linkUrl ?? ''}
              onChange={(e) => onChange({ linkUrl: e.target.value })}
              style={inputText}
            />
            <select
              value={data.deviceType}
              onChange={(e) => onChange({ deviceType: e.target.value as DeviceType })}
              style={{ ...inputText, cursor: 'pointer' }}
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {data.deviceType === 'custom' && (
              <div style={{ background: '#0b1220', padding: 8, borderRadius: 6, border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Ícone Customizado</div>
                
                {/* Upload Trigger */}
                <label style={{
                  display: 'block',
                  background: '#3b82f6',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 600,
                  textAlign: 'center',
                  transition: 'background 0.2s',
                }}>
                  📁 Escolher Nova Imagem
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>

                {/* Galeria de miniaturas salvas */}
                {customImages.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Imagens já enviadas:</div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 6,
                      maxHeight: 100,
                      overflowY: 'auto',
                      background: '#151f32',
                      padding: 6,
                      borderRadius: 4,
                      border: '1px solid #1e293b'
                    }}>
                      {customImages.map((img, idx) => (
                        <div
                          key={idx}
                          onClick={() => onChange({ customIcon: img.url })}
                          title={img.name}
                          style={{
                            width: '100%',
                            paddingTop: '100%',
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: 4,
                            background: '#0f172a',
                            border: data.customIcon === img.url ? '2px solid #3b82f6' : '1px solid #334155',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            style={{
                              position: 'absolute',
                              top: 2, left: 2, right: 2, bottom: 2,
                              width: 'calc(100% - 4px)',
                              height: 'calc(100% - 4px)',
                              objectFit: 'contain',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.customIcon && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#151f32', padding: 6, borderRadius: 4, border: '1px solid #1e293b' }}>
                    <span style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Visualização:</span>
                    <img src={data.customIcon} alt="preview" style={{ maxHeight: 40, objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Tamanho:</span>
              <input 
                type="range" 
                min="30" max="150" 
                value={data.iconSize ?? 56} 
                onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: '#e2e8f0', width: 24, textAlign: 'right' }}>{data.iconSize ?? 56}</span>
            </div>
          </div>
        </Section>

        <Section title="Thresholds (Flowcharting)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0b1220', padding: 8, borderRadius: 6, border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <SeriesCombo
                value={data.statusBinding?.match ?? ''}
                seriesKeys={seriesKeys}
                placeholder="Métrica de status"
                onChange={(m) => patchBinding({ match: m })}
              />
              <select
                value={data.statusBinding?.aggregation ?? 'last'}
                onChange={(e) => patchBinding({ aggregation: e.target.value as Aggregation })}
                style={{ ...inputText, flex: 'none', width: 64, cursor: 'pointer' }}
              >
                {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Cabeçalho da tabela de Thresholds */}
              <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 34px 24px', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', fontWeight: 'bold', padding: '0 4px' }}>
                <div>Rem</div>
                <div>Valor Limite</div>
                <div style={{ textAlign: 'center' }}>Cor</div>
                <div style={{ textAlign: 'center' }}>Lvl</div>
              </div>

              {(data.colorMappings ?? []).map((mapping, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 34px 24px', gap: 4, alignItems: 'center', background: '#1e293b', padding: 4, borderRadius: 4 }}>
                  <button
                    onClick={() => {
                      const list = (data.colorMappings ?? []).filter((_, i) => i !== idx);
                      onChange({ colorMappings: list });
                    }}
                    style={{ ...btnReset, borderColor: '#ef4444', color: '#ef4444', padding: '2px', textAlign: 'center', width: '100%', fontSize: 10 }}
                  >
                    ✕
                  </button>
                  <input
                    type="text"
                    placeholder="Valor"
                    value={mapping.value}
                    onChange={(e) => {
                      const list = [...(data.colorMappings ?? [])];
                      list[idx] = { ...list[idx], value: e.target.value };
                      onChange({ colorMappings: list });
                    }}
                    style={{ ...inputText, width: '100%', padding: '3px 4px', fontSize: 11 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input
                      type="color"
                      value={mapping.color}
                      onChange={(e) => {
                        const list = [...(data.colorMappings ?? [])];
                        list[idx] = { ...list[idx], color: e.target.value };
                        onChange({ colorMappings: list });
                      }}
                      style={{ width: 20, height: 20, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0 }}
                    />
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11, color: '#3b82f6' }}>
                    {idx}
                  </div>
                </div>
              ))}
              
              <button
                onClick={() => {
                  const list = [...(data.colorMappings ?? []), { value: '', color: '#ef4444' }];
                  onChange({ colorMappings: list });
                }}
                style={{ ...btnReset, width: '100%', borderStyle: 'dashed', background: 'transparent', color: '#3b82f6', borderColor: '#3b82f6', marginTop: 4 }}
              >
                ➕ Adicionar Regra
              </button>
            </div>
          </div>

          <button onClick={() => setShowSeries((s) => !s)} style={{ ...btnReset, width: '100%', marginTop: 8 }}>
            {showSeries ? '▾ ocultar' : '▸ ver'} séries detectadas ({seriesKeys.length})
          </button>
          {showSeries && (
            <div style={{ marginTop: 6, maxHeight: 100, overflowY: 'auto', background: '#0b1220', border: '1px solid #334155', borderRadius: 4, padding: 6 }}>
              {seriesKeys.length === 0 && (
                <div style={{ fontSize: 11, color: '#64748b' }}>Nenhuma série encontrada.</div>
              )}
              {seriesKeys.map((k, i) => (
                <div key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#94a3b8', padding: '2px 0', borderBottom: '1px solid #1e293b', wordBreak: 'break-all' }}>
                  {k}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Estilo do Container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Largura (px)</div>
              <input type="number" placeholder="Auto" value={data.nodeWidth ?? ''} onChange={(e) => onChange({ nodeWidth: e.target.value ? Number(e.target.value) : undefined })} style={inputText} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Altura (px)</div>
              <input type="number" placeholder="Auto" value={data.nodeHeight ?? ''} onChange={(e) => onChange({ nodeHeight: e.target.value ? Number(e.target.value) : undefined })} style={inputText} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Arredondamento:</span>
            <input type="range" min="0" max="50" value={data.borderRadius ?? 8} onChange={(e) => onChange({ borderRadius: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: '#e2e8f0', width: 24, textAlign: 'right' }}>{data.borderRadius ?? 8}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Cor de Fundo:</span>
            <input type="color" value={data.bgColor ?? '#0f172a'} onChange={(e) => onChange({ bgColor: e.target.value })} style={{ background: 'transparent', border: 'none', width: 32, height: 24, cursor: 'pointer', padding: 0 }} />
          </div>
        </Section>

        {/* ── Ações ── */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {duplicateNode && (
            <button
              onClick={() => {
                duplicateNode(nodeId);
                onClose();
              }}
              style={{ ...btnReset, width: '100%', borderColor: '#3b82f6', color: '#3b82f6' }}
            >
              👥 Duplicar Equipamento
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('Tem certeza que deseja excluir este equipamento?')) {
                onDelete();
                onClose();
              }
            }}
            style={{ ...btnReset, width: '100%', borderColor: '#ef4444', color: '#ef4444' }}
          >
            🗑 Excluir Equipamento
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
    {children}
  </div>
);

const inputText: React.CSSProperties = {
  width: '100%',
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
