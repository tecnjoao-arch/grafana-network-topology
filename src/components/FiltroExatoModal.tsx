// components/FiltroExatoModal.tsx — mostra, por consulta, quantas séries o
// mapa usa e as regex de Host e Item para trazer só elas (ver utils/filtroExato).
//
// Dois jeitos de usar: os botões de cima trocam o filtro nas consultas sozinhos
// (e guardam o filtro largo para voltar com um clique); os de copiar ficam de
// reserva — os de cima dependem de um acesso interno do Grafana e somem quando
// ele não existe (ver utils/consultasDoPainel).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataFrame } from '@grafana/data';
import { NetworkTopology } from '../types';
import { filtroExato } from '../utils/filtroExato';
import { FiltroLargo, aplicarFiltroExato, podeTrocarConsultas, voltarFiltroLargo } from '../utils/consultasDoPainel';
import { useCopiado } from './useCopiado';

interface Props {
  panelId: number;
  series: DataFrame[];
  topology: NetworkTopology;
  /** O filtro de antes do exato, guardado nas opções do painel */
  filtroLargo?: FiltroLargo;
  /** Guarda (ou apaga, com undefined) o filtro largo nas opções do painel */
  onGuardarLargo: (largo: FiltroLargo | undefined) => void;
  onClose: () => void;
}

const caixa: React.CSSProperties = {
  flex: 1, minWidth: 0, background: '#020617', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4,
  padding: '5px 8px', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const botao: React.CSSProperties = {
  flex: 'none', width: 84, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 4,
  padding: '5px 0', cursor: 'pointer', fontSize: 12,
};
const botaoGrande = (ligado: boolean, destaque: boolean): React.CSSProperties => ({
  flex: 1, border: 'none', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontWeight: 700,
  cursor: ligado ? 'pointer' : 'not-allowed', opacity: ligado ? 1 : 0.45,
  background: destaque ? '#f59e0b' : '#1e293b', color: destaque ? '#0f172a' : '#e2e8f0',
});

export const FiltroExatoModal: React.FC<Props> = ({ panelId, series, topology, filtroLargo, onGuardarLargo, onClose }) => {
  const filtro = useMemo(() => filtroExato(series, topology), [series, topology]);
  const [copiado, copiar] = useCopiado<string>();
  // Conferido ao abrir: o dashboard não troca de forma com a janela aberta
  const [podeTrocar] = useState(() => podeTrocarConsultas(panelId));
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  const temFiltro = filtro.consultas.some((c) => c.host);
  const temLargo = !!filtroLargo && Object.keys(filtroLargo).length > 0;
  const falhou = () => setAviso({ texto: 'Não consegui trocar as consultas nesta versão do Grafana. Use os botões de copiar aqui embaixo.', erro: true });

  const aplicar = () => {
    const anteriores = aplicarFiltroExato(panelId, filtro.consultas);
    if (!anteriores) {
      falhou();
      return;
    }
    const trocadas = Object.keys(anteriores);
    if (trocadas.length === 0) {
      setAviso({ texto: 'As consultas já estão com o filtro exato.' });
      return;
    }
    // O largo guardado da primeira vez vale mais: reaplicar depois de ligar um
    // link não pode pôr um filtro exato antigo no lugar do largo de verdade
    onGuardarLargo({ ...anteriores, ...filtroLargo });
    setAviso({ texto: `Filtro exato aplicado (consulta ${trocadas.join(', ')}). O filtro largo ficou guardado. Salve o dashboard para valer.` });
  };

  const voltar = () => {
    if (!filtroLargo) return;
    if (!voltarFiltroLargo(panelId, filtroLargo)) {
      falhou();
      return;
    }
    onGuardarLargo(undefined);
    setAviso({ texto: 'Filtro largo de volta: a lista de séries mostra tudo de novo. Monte o que falta e aplique o filtro exato outra vez.' });
  };

  const campo = (rotulo: string, texto: string, marca: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ flex: 'none', width: 34, color: '#94a3b8' }}>{rotulo}</span>
      <span style={caixa} title={texto}>{texto}</span>
      <button style={botao} onClick={() => copiar(texto, marca)}>{copiado === marca ? 'Copiado!' : 'Copiar'}</button>
    </div>
  );

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
    >
      <div
        role="dialog"
        aria-label="Filtro exato das consultas"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '16px 18px',
          width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#e2e8f0', fontSize: 13,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>🎯 Filtro exato das consultas</div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ color: '#94a3b8', marginBottom: 12 }}>
          Faz a consulta trazer só as séries que este mapa usa. Para ligar um link ou equipamento novo, volte o filtro largo, monte, e aplique de novo.
        </div>

        {podeTrocar && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button style={botaoGrande(temFiltro, true)} disabled={!temFiltro} onClick={aplicar}>🎯 Aplicar filtro exato</button>
            <button
              style={botaoGrande(temLargo, false)}
              disabled={!temLargo}
              onClick={voltar}
              title={temLargo ? 'Devolve às consultas o filtro que estava antes do exato' : 'Não há filtro largo guardado: o exato ainda não foi aplicado por aqui'}
            >
              ↩ Voltar filtro largo
            </button>
          </div>
        )}
        {aviso && (
          <div role="status" style={{ color: aviso.erro ? '#fca5a5' : '#86efac', marginBottom: 10 }}>{aviso.texto}</div>
        )}

        {filtro.consultas.length === 0 && (
          <div style={{ color: '#fbbf24' }}>Nenhum binding do mapa casou com as séries que chegaram. Confira se as consultas estão trazendo dados.</div>
        )}

        {filtro.semSerie > 0 && (
          <div style={{ color: '#fbbf24', marginBottom: 10 }}>
            ⚠ {filtro.semSerie} {filtro.semSerie === 1 ? 'binding não achou série' : 'bindings não acharam série'} nos dados de agora e {filtro.semSerie === 1 ? 'fica' : 'ficam'} de fora do filtro. Se for item que deveria existir, corrija antes de aplicar.
          </div>
        )}

        {filtro.consultas.map((c) => (
          <div key={c.refId} style={{ borderTop: '1px solid #1e293b', padding: '10px 0' }}>
            <div>
              <b>Consulta {c.refId || '(sem nome)'}</b>
              <span style={{ color: '#94a3b8' }}> — hoje chegam {c.total} séries e o mapa usa {c.usadas}{c.host ? '; com o filtro chegam ' + c.chegam : ''}</span>
            </div>
            {c.host ? (
              <>
                {campo('Host', c.host, `${c.refId}|host`)}
                {campo('Item', c.item, `${c.refId}|item`)}
              </>
            ) : (
              <div style={{ color: '#94a3b8', marginTop: 4 }}>
                As séries desta consulta não trazem host e item (não é uma consulta de métricas do Zabbix): sem filtro para ela.
              </div>
            )}
          </div>
        ))}

        {!podeTrocar && filtro.consultas.length > 0 && (
          <div style={{ color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 2 }}>
            Copie e cole nos campos <b>Host</b> e <b>Item</b> da consulta, aqui embaixo no editor. Guarde o filtro atual antes de trocar: com o filtro exato, a lista de séries do editor só mostra o que já está no mapa.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
