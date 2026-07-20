# Instalação do Network Topology em um Grafana

Guia completo de instalação num servidor Linux. Para Docker, veja a seção
[Docker](#docker-alternativa). Para gerar o pacote a partir do código-fonte,
veja [Instalação a partir do código](#instalação-a-partir-do-código-fonte).

## Pré-requisitos

- **Grafana 10 ou superior** (testado em produção no 12.3.3)
- Acesso SSH com sudo no servidor do Grafana
- **Datasource Zabbix** (alexanderzobnin-zabbix-datasource) configurado, se quiser
  os dados ao vivo — o plugin funciona sem, mas o mapa fica estático

## Passo 1 — Baixar e descompactar (direto no servidor)

Na página de **Releases** do repositório, copie o link do arquivo
`grafana-network-topology-X.Y.Z.zip` e, no servidor:

```bash
cd /tmp
wget https://github.com/tecnjoao-arch/grafana-network-topology/releases/download/vX.Y.Z/grafana-network-topology-X.Y.Z.zip
# (sem wget? use: curl -L -O <link do zip>)

# O zip já traz a pasta grafana-network-topology/ dentro:
sudo unzip -o grafana-network-topology-*.zip -d /var/lib/grafana/plugins/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/grafana-network-topology
```

> O caminho padrão de plugins é `/var/lib/grafana/plugins`. Se a sua instância
> usa outro, confira `paths.plugins` no `grafana.ini` (ou a env `GF_PATHS_PLUGINS`).

Confira que chegou certo (2 segundos que evitam 1 hora):

```bash
# TEM que responder: "id": "grafana-network-topology"
grep '"id"' /var/lib/grafana/plugins/grafana-network-topology/plugin.json
```

## Passo 2 — Liberar o plugin não assinado

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

## Passo 3 (opcional) — Liberar os testes de rede (Globalping) no CSP

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

## Passo 4 — Reiniciar e validar

```bash
sudo systemctl restart grafana-server
sudo grep -iE "network-topology" /var/log/grafana/grafana.log | tail -n 5
```

Esperado no log:

```
msg="Permitting unsigned plugin. This is not recommended" pluginId=grafana-network-topology
msg="Plugin registered" pluginId=grafana-network-topology
```

## Passo 5 — No navegador

1. **Ctrl+Shift+R** (hard refresh — o cache segura a lista de plugins antiga).
2. Dashboard → **Add panel** → visualização **"Network Topology"**.
3. Nas opções do painel, ative o **Modo edição** e monte o mapa
   ("➕ Adicionar Equipamento", arraste conexões entre os nós).
4. Configure as queries do Zabbix e use o **⚡ Auto-preenchimento** no editor
   de cada link pra amarrar as métricas.

## Atualizando para uma nova versão

```bash
cd /tmp && wget <link do zip novo>
sudo rm -rf /var/lib/grafana/plugins/grafana-network-topology
sudo unzip grafana-network-topology-*.zip -d /var/lib/grafana/plugins/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/grafana-network-topology
sudo systemctl restart grafana-server
```

E **Ctrl+Shift+R** no navegador. Os mapas não se perdem: a topologia vive no
JSON dos dashboards, não no plugin.

## Levando um mapa existente pra outra instância

1. Na instância de origem: dashboard → Export → **Save JSON to file**.
2. Na nova instância: Dashboards → **Import** → cole o JSON.
3. No import, o Grafana pede pra **mapear o datasource** — aponte pro Zabbix
   da nova instância.
4. Os bindings casam por **nome da série**: se os hosts/itens do Zabbix têm os
   mesmos nomes na nova instância, tudo volta a funcionar sem retrabalho. Se os
   nomes mudarem, reajuste os bindings (o ⚡ Auto-preenchimento acelera).

## Docker (alternativa)

Se a instância roda em container, não existe pasta no host nem `grafana.ini` —
descompacte o zip numa pasta local, monte o volume e use as envs:

```yaml
services:
  grafana:
    image: grafana/grafana:12.3.3
    ports: ["3000:3000"]
    volumes:
      - ./grafana-network-topology:/var/lib/grafana/plugins/grafana-network-topology
    environment:
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: grafana-network-topology
      # (opcional) testes de rede com CSP ativo:
      # GF_SECURITY_CONTENT_SECURITY_POLICY: "true"
      # GF_SECURITY_CONTENT_SECURITY_POLICY_TEMPLATE: "<template do passo 3>"
```

`./grafana-network-topology` é a pasta extraída do zip. Depois:
`docker compose restart grafana`.

## Instalação a partir do código-fonte

Para quem quer buildar em vez de usar a release (requer Node.js 18+ na máquina
de build — o servidor não precisa):

```bash
git clone https://github.com/tecnjoao-arch/grafana-network-topology.git
cd grafana-network-topology
npm install
npm run package   # gera dist-zip/grafana-network-topology-<versão>.zip
```

Envie o **zip** pro servidor e siga a partir do [Passo 1](#passo-1--baixar-e-descompactar-direto-no-servidor):

```bash
scp dist-zip/grafana-network-topology-*.zip USUARIO@SERVIDOR:/tmp/
```

> Enviar o zip (um arquivo) evita o clássico erro do `scp -r` de pasta que
> cria diretórios aninhados no destino.

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| "Plugin grafana-network-topology not found" | Arquivos ausentes ou id errado | Refaça o Passo 1; confira o `grep '"id"'` |
| Log: "Skipping loading plugin due to problem with signature" | Allowlist não aplicada | Passo 2 (lembre: lista com vírgula!) |
| Painel aparece mas sem dados ao vivo | Queries apontando pra datasource errado após import | Reaponte o datasource do dashboard |
| Testes de rede: "Failed to fetch" | CSP bloqueando api.globalping.io | Passo 3 |
| Atualizou o plugin e nada mudou | Cache do navegador | Ctrl+Shift+R (o build injeta versão única no plugin.json) |
| Mapa sumiu após editar em outra viz | Painel salvo com outra visualização | Não salve o dashboard enquanto o plugin estiver "not found" |
