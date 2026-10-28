// utils/panelEditor.ts — o painel está aberto no editor do Grafana?
//
// O "Modo edição" do mapa é uma opção salva no painel: ligada uma vez, valia
// no uso normal do dashboard — faixa amarela, nó arrastável, editor abrindo
// no clique — pra quem estivesse só olhando o NOC. Agora ela só vale dentro
// do editor do painel (menu do painel → Edit).
//
// Como saber que é o editor: a URL. Ela carrega `editPanel=<id do painel>`
// no Grafana 10/11 e no 12 (Scenes: PanelEditor.getUrlKey() devolve o id).
// O caminho "oficial" — PanelContext.app === CoreApp.PanelEditor — vem fixo
// como CoreApp.Unknown no VizPanel do Scenes, então não serve no 12.

/** `search`: a query da URL já lida (locationService.getSearchObject()). */
export function isPanelEditorOpen(search: Record<string, unknown>, panelId?: number): boolean {
  const v = search.editPanel;
  if (v === undefined || v === null || v === '' || v === false) return false;
  // Sem id conhecido, qualquer editPanel vale: melhor deixar editar do que
  // travar o mapa sem edição nenhuma.
  if (panelId === undefined || panelId === null) return true;
  // Comparado como texto: a URL pode vir "2" ou 2 dependendo do parser.
  return String(v) === String(panelId);
}
