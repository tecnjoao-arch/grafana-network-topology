# Probe interna do Globalping (testes "de dentro" da rede)

Guia pra subir uma probe self-hosted do Globalping na sua rede e usá-la como
origem dos testes no plugin (preset **🏠 Interna** no modal de testes).

## O que ela dá — e o que NÃO dá (leia antes)

✅ Testes (ping/traceroute/MTR/DNS) **partindo de dentro da sua rede** em
direção a alvos **públicos** — inclusive os seus próprios equipamentos
(200.20.x.x são IPs públicos, funcionam como alvo).

✅ Segurança: a probe **só faz conexão de SAÍDA** pra API do Globalping —
não abre nenhuma porta nem aceita conexão de entrada. E a API **bloqueia IPs
privados como alvo**, então ninguém consegue usar a sua probe pra escanear a
sua LAN.

⚠️ A probe participa **obrigatoriamente da rede pública** do Globalping — não
existe modo "privado". Outras pessoas podem rodar testes a partir dela (seu IP
aparece como origem; consome um pouco de banda). Em troca, a conta adotante
ganha créditos diários.

❌ **Alvos com IP privado (10.x, 192.168.x, 172.16.x) são recusados pela
API** — mesmo com a probe interna. Se um dia precisar testar IP privado, é
outro projeto (agente próprio + backend), não Globalping.

## Onde rodar

- **Não** no servidor do Grafana. Use uma VM/LXC pequena e isolada
  (idealmente numa VLAN própria com acesso só de saída à internet).
- Requisitos mínimos: qualquer Linux x86/ARM (até Raspberry Pi). A probe é
  leve (~100 MB de RAM). Docker instalado.
- **1 probe por IP público** (limite deles). Sem VPN/proxy no caminho.

## Passo a passo

1. **Crie a conta** (grátis) em https://dash.globalping.io — a mesma conta do
   token, se você já criou.

2. **No dashboard, vá em "Probes" → "Adopt a probe"** — ele gera um comando
   com o token de adoção. Será algo assim:

   ```bash
   docker run -d --log-driver local --network host --restart=always \
     --name globalping-probe \
     -e GP_ADOPTION_TOKEN=SEU_TOKEN_AQUI \
     globalping/globalping-probe
   ```

   > O token de adoção é sensível — não compartilhe nem versione.

3. **Confirme que subiu:**

   ```bash
   docker logs globalping-probe --tail 20
   # esperado: "connected" / probe registrada
   ```

   No dashboard, a probe aparece como "online" em ~1 minuto.

4. **Dê uma tag à probe** no dashboard (Probes → sua probe → Tags), ex:
   `noc`. A tag utilizável nas medições fica no formato `u-SEUUSUARIO-noc`
   (o dashboard mostra o formato exato).

5. **No Grafana**: opções do painel → categoria **Dados** → campo
   **"Tag da probe interna"** → cole a tag (ex: `u-joao-noc`) → salve.

6. **Pronto**: o modal de testes (🌐) ganha o preset **"🏠 Interna"** ao lado
   de Brasil/São Paulo/etc. Selecionou, o teste parte da sua probe.

## Teste de validação

Abra o modal → Ping → alvo `200.20.96.101` (CBPF) → origem **🏠 Interna** →
Executar. A latência deve ser ~0–2 ms (você está do lado de dentro). Compare
com origem "Brasil" ou "EUA" pra ver a diferença de rota.

## Manutenção

- A imagem se atualiza sozinha a cada restart do container
  (`--restart=always` + host reboots cobrem isso na prática). Pra forçar:
  `docker pull globalping/globalping-probe && docker restart globalping-probe`.
- Pra remover: `docker rm -f globalping-probe` e delete a probe no dashboard.
