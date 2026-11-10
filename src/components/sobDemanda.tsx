// components/sobDemanda.tsx — editores e janelas que só são baixados quando
// alguém abre.
//
// Quem só olha o mapa (a TV do NOC, o visitante do link público) nunca abre o
// editor de link, o de equipamento, o teste de rede nem o filtro exato — e no
// link público nem os detalhes do link. Tudo isso ia dentro do module.js e era
// baixado e interpretado em toda abertura do dashboard. Aqui cada grupo vira
// um arquivo à parte, pedido na primeira vez que a janela abre.
//
// Se o arquivo não vier (rede caiu, plugin atualizado com a página aberta), a
// janela vira um aviso com botão de fechar; o mapa segue funcionando.

import React, { ComponentType, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';

const NaoCarregou: React.FC<{ onClose?: () => void }> = ({ onClose }) =>
  createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}
    >
      <div
        role="alertdialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderTop: '3px solid #f59e0b',
          borderRadius: 10, padding: '16px 18px', maxWidth: 420, color: '#e2e8f0', fontSize: 13,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Não foi possível abrir esta janela</div>
        <div style={{ color: '#94a3b8', marginBottom: 14 }}>
          Uma parte do plugin não carregou. O mapa continua funcionando; recarregue a página (F5) e tente de novo.
        </div>
        <button
          onClick={onClose}
          style={{
            background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6,
            padding: '6px 14px', cursor: 'pointer', fontSize: 13,
          }}
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );

/** Componente que baixa o próprio código na primeira vez que aparece. Enquanto
 *  baixa não mostra nada (é um instante, e fica em cache depois). */
function sobDemanda<P extends { onClose?: () => void }>(carrega: () => Promise<ComponentType<P>>): React.FC<P> {
  const Preguicoso = lazy(() =>
    carrega().then(
      (c) => ({ default: c as ComponentType<any> }),
      (erro) => {
        console.error('[topologia] parte do plugin não carregou:', erro);
        return { default: NaoCarregou as ComponentType<any> };
      }
    )
  );
  return (props: P) => (
    <Suspense fallback={null}>
      <Preguicoso {...props} />
    </Suspense>
  );
}

// Os dois editores e o filtro exato vão no MESMO arquivo: dividem o seletor de
// séries, a descoberta e o seletor de cor, e quem abre um costuma abrir o outro.
export const EdgeEditor = sobDemanda(() => import(/* webpackChunkName: "editor" */ './EdgeEditor').then((m) => m.EdgeEditor));
export const NodeEditor = sobDemanda(() => import(/* webpackChunkName: "editor" */ './NodeEditor').then((m) => m.NodeEditor));
export const FiltroExatoModal = sobDemanda(() => import(/* webpackChunkName: "editor" */ './FiltroExatoModal').then((m) => m.FiltroExatoModal));
export const LinkDetailsModal = sobDemanda(() => import(/* webpackChunkName: "detalhes" */ './LinkDetailsModal').then((m) => m.LinkDetailsModal));
export const NetworkTestModal = sobDemanda(() => import(/* webpackChunkName: "teste" */ './NetworkTestModal').then((m) => m.NetworkTestModal));
