// components/ProtecaoModal.tsx — Error boundary em volta dos modais.
// Um erro de render dentro do modal (dado inesperado de uma API, por exemplo
// o null do Globalping) subia até o painel: o Grafana trocava o MAPA INTEIRO
// pela mensagem de erro até alguém recarregar a página. Com isto, só o modal
// cai — no lugar dele fica um aviso com o botão de fechar, e o mapa segue.

import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** O que o aviso diz que falhou ("os detalhes do link", "o teste de rede") */
  oQue: string;
  onClose: () => void;
  children: React.ReactNode;
}

interface State {
  erro?: Error;
}

export class ProtecaoModal extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    // No console fica o que precisa pra corrigir: o erro e onde ele aconteceu
    console.error(`[topologia] erro ao mostrar ${this.props.oQue}:`, erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return createPortal(
      <div
        onClick={this.props.onClose}
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
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Não foi possível mostrar {this.props.oQue}</div>
          <div style={{ color: '#94a3b8', marginBottom: 14 }}>
            O mapa continua funcionando. Feche e tente de novo; se repetir, o detalhe do erro está no console do navegador (F12).
          </div>
          <button
            onClick={this.props.onClose}
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
  }
}
