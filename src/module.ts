// module.ts — Entry point do plugin.

import { PanelPlugin } from '@grafana/data';
import { TopologyPanel } from './components/TopologyPanel';
import { PanelOptions, DEFAULT_OPTIONS } from './types';

export const plugin = new PanelPlugin<PanelOptions>(TopologyPanel)
  .setNoPadding()
  .setPanelOptions((builder) => {
    builder
      .addBooleanSwitch({
        path: 'editMode',
        name: 'Modo edição',
        description: 'Ativa arrastar nós com o mouse. Posições são salvas automaticamente.',
        defaultValue: DEFAULT_OPTIONS.editMode,
        category: ['Edição'],
      })
      .addRadio({
        path: 'theme',
        name: 'Tema',
        description: 'Dark recomendado para NOC TVs.',
        defaultValue: DEFAULT_OPTIONS.theme,
        settings: {
          options: [
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ],
        },
        category: ['Visual'],
      })
      .addSliderInput({
        path: 'fontScale',
        name: 'Escala da fonte',
        description: 'Aumenta tudo proporcionalmente — útil para TVs grandes.',
        defaultValue: DEFAULT_OPTIONS.fontScale,
        settings: { min: 0.6, max: 2.5, step: 0.1 },
        category: ['Visual'],
      })
      .addBooleanSwitch({
        path: 'fitView',
        name: 'Ajustar ao painel',
        description: 'Auto-zoom para caber tudo. Desativado automaticamente em modo edição.',
        defaultValue: DEFAULT_OPTIONS.fitView,
        category: ['Visual'],
      })
      .addBooleanSwitch({
        path: 'animateLinks',
        name: 'Animar links',
        description: 'Luz correndo nas arestas ativas.',
        defaultValue: DEFAULT_OPTIONS.animateLinks,
        category: ['Visual'],
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Mostrar legenda',
        defaultValue: DEFAULT_OPTIONS.showLegend,
        category: ['Visual'],
      })
      .addBooleanSwitch({
        path: 'showMinimap',
        name: 'Mostrar minimap',
        defaultValue: DEFAULT_OPTIONS.showMinimap,
        category: ['Visual'],
      })
      .addNumberInput({
        path: 'staleThresholdSec',
        name: 'Limite de obsolescência (s)',
        description:
          'Segundos sem atualização para uma métrica ser considerada obsoleta (o status cai). ' +
          'A tolerância real respeita o intervalo de cada série. 0 desativa a checagem.',
        defaultValue: DEFAULT_OPTIONS.staleThresholdSec,
        settings: { min: 0, step: 10 },
        category: ['Dados'],
      })
      .addTextInput({
        path: 'globalpingToken',
        name: 'Token do Globalping (opcional)',
        description:
          'Aumenta a cota dos testes de rede (500/h + créditos; sem token: 250/h por IP). ' +
          'Crie grátis em dash.globalping.io. Atenção: fica visível no JSON do dashboard.',
        defaultValue: DEFAULT_OPTIONS.globalpingToken,
        category: ['Dados'],
      })
      .addTextInput({
        path: 'globalpingInternalTag',
        name: 'Tag da probe interna (opcional)',
        description:
          'Tag da sua probe self-hosted adotada no dash.globalping.io (ex: u-usuario-noc). ' +
          'Cria o preset "Interna" no modal de testes — testes partindo de dentro da sua rede.',
        defaultValue: DEFAULT_OPTIONS.globalpingInternalTag,
        category: ['Dados'],
      });
    return builder;
  });
