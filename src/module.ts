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
      .addBooleanSwitch({
        path: 'dimLinksOnNodeDown',
        name: 'Nó down derruba os links',
        description:
          'Equipamento down (pelo binding de status/ping) derruba os links ligados ' +
          'a ele, com a causa "equipamento sem resposta". Desligue se preferir que ' +
          'cada link dependa só do próprio operStatus.',
        defaultValue: DEFAULT_OPTIONS.dimLinksOnNodeDown,
        category: ['Visual'],
      })
      .addBooleanSwitch({
        path: 'shortenIpv6',
        name: 'Abreviar IPv6 nos cards',
        description:
          'Mostra "2804:1f18…:14" em vez do endereço inteiro — os cards ficam bem ' +
          'mais estreitos e param de se sobrepor. O endereço completo continua no ' +
          'modal, no título ao passar o mouse e ao copiar. Desligue se você tiver ' +
          'interfaces que só se distinguem pelo miolo do endereço.',
        defaultValue: DEFAULT_OPTIONS.shortenIpv6,
        category: ['Visual'],
      })
      .addColorPicker({
        path: 'downColor',
        name: 'Cor do link DOWN',
        description: 'Vale para o mapa inteiro; cada link pode sobrescrever no editor.',
        defaultValue: DEFAULT_OPTIONS.downColor,
        category: ['Visual'],
      })
      .addSelect({
        path: 'downLineStyle',
        name: 'Traçado do link DOWN',
        defaultValue: DEFAULT_OPTIONS.downLineStyle,
        settings: {
          options: [
            { value: 'solid', label: 'Sólido' },
            { value: 'dashed', label: 'Tracejado' },
            { value: 'dotted', label: 'Pontilhado' },
            { value: 'double', label: 'Duplo' },
          ],
        },
        category: ['Visual'],
      })
      .addSelect({
        path: 'downAnimation',
        name: 'Animação do link DOWN',
        description:
          'Pulsar/brilhar chamam atenção sem simular movimento. Fluxo e fluxo reverso ' +
          'imitam bits andando — num link caído passam a impressão de tráfego passando.',
        defaultValue: DEFAULT_OPTIONS.downAnimation,
        settings: {
          options: [
            { value: 'pulse', label: 'Pulsar (recomendado)' },
            { value: 'glow', label: 'Brilhar' },
            { value: 'none', label: 'Nenhuma' },
            { value: 'flow', label: 'Fluxo (simula tráfego)' },
            { value: 'reverse', label: 'Fluxo reverso (simula tráfego)' },
          ],
        },
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
      });
    return builder;
  });
