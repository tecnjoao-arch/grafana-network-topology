# Instalação do Network Topology em um Grafana

Guia pra instalar o plugin em uma nova instância de Grafana (servidor Linux).
Para Docker, veja a seção no final.

## Pré-requisitos

- **Grafana 10 ou superior** (testado em produção no 12.3.3)
- Acesso SSH com sudo no servidor do Grafana
- **Datasource Zabbix** (alexanderzobnin-zabbix-datasource) configurado, se quiser
  os dados ao vivo — o plugin funciona sem, mas o mapa fica estático
- Node.js 18+ **apenas** na máquina que gera o build (o servidor não precisa)

## Passo 1 — Gerar o build (na máquina de desenvolvimento)

```powershell
cd C:\Users\joaomarcos\Desktop\teste_grafana\grafana-network-topology
npm install        # só na primeira vez
npm run build
```

Confira que a pasta `dist/` contém `plugin.json`, `module.js` e `img/`.

## Passo 2 — Enviar pro servidor

Sempre zere a pasta de staging antes (evita herdar arquivos de deploys antigos
e o clássico `dist/` aninhado do scp):

```powershell
ssh USUARIO@SERVIDOR "rm -rf /tmp/topo-plugin && mkdir -p /tmp/topo-plugin"
scp -r dist\* USUARIO@SERVIDOR:/tmp/topo-plugin/
```

## Passo 3 — Conferir o que chegou (2 segundos que evitam 1 hora)

```bash
# TEM que responder: "id": "grafana-network-topology"
grep '"id"' /tmp/topo-plugin/plugin.json

# TEM que listar plugin.json e module.js na raiz (NÃO uma pasta "dist")
ls /tmp/topo-plugin/
```

Se o id vier diferente, você rodou o `scp` da pasta de outro projeto — volte ao passo 1.

## Passo 4 — Instalar na pasta de plugins

> O caminho padrão é `/var/lib/grafana/plugins`. Se o Grafana da instância usa
> outro, confira `paths.plugins` no `grafana.ini` (ou a env `GF_PATHS_PLUGINS`).

```bash
sudo rm -rf /var/lib/grafana/plugins/grafana-network-topology
sudo mkdir -p /var/lib/grafana/plugins/grafana-network-topology
sudo cp -r /tmp/topo-plugin/* /var/lib/grafana/plugins/grafana-network-topology/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/grafana-network-topology
sudo chmod -R a+rX /var/lib/grafana/plugins/grafana-network-topology
```

## Passo 5 — Liberar o plugin não assinado

⚠️ **CUIDADO:** `allow_loading_unsigned_plugins` é uma lista separada por
vírgula. Se a instância já tem outros plugins não assinados, **acrescente** o
nosso — não substitua a linha, senão os outros quebram.

```bash
grep -n "allow_loading_unsigned_plugins" /etc/grafana/grafana.ini
```

- **Linha não existe ou está comentada (`;`)** → adicione na seção `[plugins]`:

  ```ini
  [plugins]
  allow_loading_unsigned_plugins = grafana-network-topology
  ```

- **Linha já existe com outros plugins** → acrescente no final, com vírgula:

  ```ini
  allow_loading_unsigned_plugins = outro-plugin-a,outro-plugin-b,grafana-network-topology
  ```

## Passo 6 (opcional) — Liberar os testes de rede (Globalping) no CSP

O modal "🌐 Testes de rede" chama a API `api.globalping.io` direto do navegador.
Se o Grafana da instância tem CSP ativo, precisa liberar esse destino:

```bash
grep -n "content_security_policy" /etc/grafana/grafana.ini | head -3
```

- **`content_security_policy = false`** (ou comentado) → nada a fazer, pule.
- **`content_security_policy = true`** → no `content_security_policy_template`,
  adicione `https://api.globalping.io` dentro do `connect-src`. Template completo:

  ```ini
  content_security_policy_template = """script-src 'self' 'unsafe-eval' 'unsafe-inline' 'strict-dynamic' $NONCE;object-src 'none';font-src 'self';style-src 'self' 'unsafe-inline' blob:;img-src * data:;base-uri 'self';connect-src 'self' grafana.com https://api.globalping.io ws://$ROOT_PATH wss://$ROOT_PATH;manifest-src 'self';media-src 'none';form-action 'self';"""
  ```

Sem esse passo o resto do plugin funciona normal — só os testes de rede dão
"Failed to fetch".

## Passo 7 — Reiniciar e validar

```bash
sudo systemctl restart grafana-server
sudo grep -iE "network-topology" /var/log/grafana/grafana.log | tail -n 5
```

Esperado no log:

```
msg="Permitting unsigned plugin. This is not recommended" pluginId=grafana-network-topology
msg="Plugin registered" pluginId=grafana-network-topology
```

## Passo 8 — No navegador

1. **Ctrl+Shift+R** (hard refresh — o cache segura a lista de plugins antiga).
2. Dashboard → **Add panel** → visualização **"Network Topology"**.
3. Nas opções do painel, ative o **Modo edição** e monte o mapa
   ("➕ Adicionar Equipamento", arraste conexões entre os nós).
4. Configure as queries do Zabbix e use o **⚡ Auto-preenchimento** no editor
   de cada link pra amarrar as métricas.

## Levando um mapa existente pra nova instância

A topologia inteira (nós, links, bindings) vive nas **options do painel**,
dentro do JSON do dashboard — não no plugin. Pra migrar um mapa:

1. Na instância de origem: dashboard → Export → **Save JSON to file**.
2. Na nova instância: Dashboards → **Import** → cole o JSON.
3. No import, o Grafana pede pra **mapear o datasource** — aponte pro Zabbix
   da nova instância.
4. Os bindings casam por **nome da série**: se os hosts/itens do Zabbix têm os
   mesmos nomes na nova instância, tudo volta a funcionar sem retrabalho. Se os
   nomes mudarem, reajuste os bindings (o ⚡ Auto-preenchimento acelera).

## Docker (alternativa)

Se a nova instância roda em container, não existe pasta no host nem
`grafana.ini` — monte o volume e use as envs:

```yaml
services:
  grafana:
    image: grafana/grafana:12.3.3
    ports: ["3000:3000"]
    volumes:
      - ./topo-plugin:/var/lib/grafana/plugins/grafana-network-topology
    environment:
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: grafana-network-topology
      # (opcional) testes de rede com CSP ativo:
      # GF_SECURITY_CONTENT_SECURITY_POLICY: "true"
      # GF_SECURITY_CONTENT_SECURITY_POLICY_TEMPLATE: "<template do passo 6>"
```

`./topo-plugin` é a pasta com o conteúdo do `dist/`. Depois: `docker compose
restart grafana`.

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| "Plugin grafana-network-topology not found" | Arquivos ausentes, pasta aninhada ou id errado | Refaça os passos 2–4; confira o `grep '"id"'` |
| Log: "Skipping loading plugin due to problem with signature" | Allowlist não aplicada | Passo 5 (lembre: lista com vírgula!) |
| Painel aparece mas sem dados ao vivo | Queries apontando pra datasource errado após import | Reaponte o datasource do dashboard |
| Testes de rede: "Failed to fetch" | CSP bloqueando api.globalping.io | Passo 6 |
| Atualizou o plugin e nada mudou | Cache do navegador | Ctrl+Shift+R (o build já injeta versão única no plugin.json) |
| Mapa sumiu após editar em outra viz | Painel salvo com outra visualização | Não salve o dashboard enquanto o plugin estiver "not found" |
