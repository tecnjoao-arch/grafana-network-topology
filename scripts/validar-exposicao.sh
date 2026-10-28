#!/usr/bin/env bash
# validar-exposicao.sh — confere o Grafana exposto na internet atrás do nginx.
#
#   sudo bash validar-exposicao.sh grafana.seudominio.br
#
# Só LÊ: não altera nada no servidor. Cada item sai como OK / ATENÇÃO / FALHA.
# Os testes pelo endereço público batem no nginx DESTE servidor (curl --resolve
# no IP em que o nginx escuta), então funcionam mesmo sem o servidor alcançar o
# próprio nome. Porta 3000 fechada pra internet só dá pra provar de FORA.

if [ -z "$1" ]; then
  echo "Faltou o domínio. Rode assim:  sudo bash $0 grafana.seudominio.br" >&2
  exit 1
fi
DOM="$1"
INI="${GRAFANA_INI:-/etc/grafana/grafana.ini}"
nok=0; nav=0; nfa=0
OK() { echo "  [OK]      $*"; nok=$((nok + 1)); }
AV() { echo "  [ATENÇÃO] $*"; nav=$((nav + 1)); }
FA() { echo "  [FALHA]   $*"; nfa=$((nfa + 1)); }
IN() { echo "  [INFO]    $*"; }

# Valor de uma chave do grafana.ini, na seção certa, ignorando comentários.
# Vazio = não definido (vale o padrão do Grafana).
ini() {
  awk -v s="[$1]" -v k="$2" '
    /^[[:space:]]*\[/ { t = $0; gsub(/[[:space:]]/, "", t); sec = t; next }
    sec == s && $0 ~ "^[[:space:]]*" k "[[:space:]]*=" {
      v = $0; sub(/^[^=]*=[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
    }
    END { print v }' "$INI"
}

# chk SEÇÃO CHAVE ESPERADO PADRÃO_DO_GRAFANA "por quê"
chk() {
  local v; v=$(ini "$1" "$2"); v=${v:-$4}; v=${v,,}
  if [ "$v" = "${3,,}" ]; then OK "[$1] $2 = $v"
  else FA "[$1] $2 = ${v:-(vazio)} → deveria ser $3  ($5)"; fi
}

# Blocos server{} do nginx (saída do nginx -T), um por vez, separados por \x1e.
# Chave depois de # é comentário e não conta na profundidade.
blocos() {
  awk '
    !dentro && /^[[:space:]]*server[[:space:]]*\{/ { dentro = 1; prof = 0; buf = "" }
    dentro {
      buf = buf $0 "\n"; l = $0; sub(/#.*/, "", l)
      prof += gsub(/\{/, "{", l) - gsub(/\}/, "}", l)
      if (prof <= 0) { printf "%s\036", buf; dentro = 0 }
    }'
}
# Classifica cada bloco: g = 1 se é do Grafana — o domínio no server_name, ou
# proxy_pass pro Grafana local (endereço direto ou upstream). Os default_server
# também citam o domínio, mas no return: não contam.
EH_G='{ n = ""; if (match($0, /server_name[^;]*/)) n = tolower(substr($0, RSTART, RLENGTH))
        g = index(n, tolower(ENVIRON["DOM"])) || $0 ~ ENVIRON["RX_G"] }'
# Tamanho do nginx (10m, 50000M, 1g) em MB, pra comparar.
mb() { local v=${1,,}; case "$v" in *g) echo $(( ${v%g} * 1024 )) ;; *m) echo "${v%m}" ;;
  *k) echo $(( ${v%k} / 1024 )) ;; *) echo $(( v / 1048576 )) ;; esac; }

echo
echo "== 1. Versão e serviço"
systemctl is-active -q grafana-server && OK "grafana-server ativo" || FA "grafana-server não está ativo"
ver=$(grafana-server -v 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
[ -z "$ver" ] && ver=$(grafana server -v 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
menor() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ] && [ "$1" != "$2" ]; }
if [ -z "$ver" ]; then AV "não consegui ler a versão do Grafana"
elif menor "$ver" 12.4.11; then FA "Grafana $ver — a faixa 12.3.0–12.4.10 tem falhas conhecidas; vá pra 12.4.12"
elif menor "$ver" 12.4.12; then AV "Grafana $ver — corrigido, mas já existe a 12.4.12"
elif menor "$ver" 13.0.0; then OK "Grafana $ver"
else AV "Grafana $ver (série 13: o plugin de topologia ainda não foi testado nela)"; fi
ini feature_toggles enable | grep -qi sqlExpressions \
  && AV "feature toggle sqlExpressions ligado (CVE-2026-27876) — desligue se não usa" \
  || OK "sqlExpressions desligado"
lista=$(ini plugins allow_loading_unsigned_plugins)
for p in gabrielnsw-nswtopology-panel grafana-flowcharting-react grafana-network-topology; do
  echo "$lista" | grep -q "$p" && OK "plugin não assinado liberado: $p" \
    || AV "plugin não assinado FORA da lista: $p (o upgrade pode ter mexido no grafana.ini)"
done

echo
echo "== 2. Rede: Grafana só local, nginx na frente"
esc=$(ss -ltnH 'sport = :3000' 2>/dev/null | awk '{print $4}' | sort -u | tr '\n' ' ')
if [ -z "$esc" ]; then FA "nada escutando na 3000 (Grafana parado ou em outra porta?)"
elif echo "$esc" | tr ' ' '\n' | grep -v '^$' | grep -qvE '^(127\.0\.0\.1|\[::1\]):3000$'; then
  FA "a 3000 escuta em: $esc— deve ser só 127.0.0.1 ([server] http_addr)"
else OK "Grafana escuta só em: $esc"; fi

if nginx -t >/dev/null 2>&1; then OK "nginx -t sem erro"
else FA "nginx -t com erro: $(nginx -t 2>&1 | tail -1)"; fi
N=$(nginx -T 2>/dev/null)
TODOS=$(echo "$N" | blocos)
# upstream que aponta pro Grafana local (o exemplo da documentação usa "upstream grafana")
UPS=$(echo "$N" | awk '
  /^[[:space:]]*upstream[[:space:]]/ { nome = $2; sub(/\{.*/, "", nome); dentro = 1 }
  dentro && /server[[:space:]]+(127\.0\.0\.1|localhost|\[::1\]):3000/ { print nome }
  dentro && /\}/ { dentro = 0 }' | sort -u | paste -sd'|' -)
RX_G='proxy_pass[[:space:]]+https?://((127\.0\.0\.1|localhost|\[::1\]):3000'"${UPS:+|$UPS}"')([/;[:space:]]|$)'
export DOM RX_G
G=$(printf '%s' "$TODOS" | awk -v RS='\036' "$EH_G"' g { printf "%s", $0 }')
if [ -z "$G" ]; then
  FA "não achei o Grafana no nginx (server_name $DOM ou proxy_pass pra 127.0.0.1:3000)"
else
  echo "$G" | grep -qE "$RX_G" \
    && OK "nginx repassa $DOM pro Grafana local (3000)" || FA "o server de $DOM não repassa pra 127.0.0.1:3000"
  echo "$G" | grep -qE 'proxy_set_header[[:space:]]+Host[[:space:]]+\$(host|http_host)' \
    && OK "nginx manda o nome original (Host \$host)" \
    || FA "sem proxy_set_header Host \$host — o Grafana recusa ações com \"origin not allowed\""
  echo "$G" | grep -qE 'proxy_set_header[[:space:]]+Upgrade' \
    && OK "websocket repassado (Grafana Live)" || AV "sem proxy_set_header Upgrade — atualizações ao vivo (websocket) podem falhar"
  echo "$G" | grep -qE 'location[[:space:]]+(=|\^~)?[[:space:]]*/metrics' \
    && OK "/metrics tratado no server do Grafana" || AV "/metrics do Grafana passa pelo nginx — bloqueie (location ^~ /metrics { return 404; })"
  echo "$G" | grep -qE 'limit_req[[:space:]]+zone' \
    && OK "limite de tentativas por IP no login (limit_req)" || AV "sem limit_req no /login (o Grafana já trava após 5 erros por usuário; o nginx limitaria por IP)"
fi
cms=$(echo "$G" | grep -oE 'client_max_body_size[[:space:]]+[0-9]+[kKmMgG]?' | awk '{print $2}' | tail -1)
[ -z "$cms" ] && cms=$(echo "$N" | grep -oE 'client_max_body_size[[:space:]]+[0-9]+[kKmMgG]?' | awk '{print $2}' | head -1)
if [ -z "$cms" ]; then AV "sem client_max_body_size: o padrão do nginx é 1 MB — salvar dashboard grande dá erro 413; use 20m"
elif [ "$cms" = 0 ]; then AV "client_max_body_size 0 = sem limite nenhum; use 20m no server do Grafana"
elif [ "$(mb "$cms")" -gt 1024 ]; then AV "client_max_body_size $cms vale pro Grafana — praticamente sem limite; use 20m no server dele"
else OK "client_max_body_size $cms"; fi
echo "$N" | grep -qE 'ssl_protocols[^;]*TLSv1(\.1)?([[:space:]]|;)' \
  && FA "TLS 1.0/1.1 habilitado no nginx" || OK "sem TLS 1.0/1.1 na config"
# default_server da 443 que NÃO é o Grafana: nome desconhecido ou IP direto
# para nele. (Sem isso, quem segura é o enforce_domain — conferido na parte 3.)
CATCHALL=$(printf '%s' "$TODOS" | awk -v RS='\036' "$EH_G"'
  !g && /listen[^;]*[[:space:]:]443[[:space:]][^;]*default_server/ { print 1; exit }')
[ -n "$CATCHALL" ] && OK "nome desconhecido ou IP direto cai no default_server do nginx (não chega no Grafana)"
# Outros sites do mesmo nginx repassando pra serviço local sem login nem lista
# de IPs: se a 443 abrir pra internet, eles vão junto.
outros=$(printf '%s' "$TODOS" | awk -v RS='\036' "$EH_G"'
  !g && /proxy_pass/ && !/auth_basic_user_file/ && !/deny[[:space:]]+all/ && !/auth_request/ {
    sub(/^server_name[[:space:]]*/, "", n); if (n == "") n = "(sem server_name)"
    p = ""; if (match($0, /proxy_pass[[:space:]]+[^;]+/)) p = substr($0, RSTART + 11, RLENGTH - 11)
    gsub(/^[[:space:]]+/, "", p); print n " → " p
  }' | sort -u)
if [ -n "$outros" ]; then
  while IFS= read -r s; do AV "outro site no mesmo nginx SEM login nem lista de IPs: $s"; done <<< "$outros"
else OK "nenhum outro site do nginx exposto sem proteção"; fi

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
  getsebool httpd_can_network_connect 2>/dev/null | grep -q 'on$' \
    && OK "SELinux: httpd_can_network_connect = on" \
    || FA "SELinux bloqueia nginx → 3000: setsebool -P httpd_can_network_connect 1"
else OK "SELinux desativado (nada a liberar)"; fi

if systemctl is-active -q firewalld; then
  F=$(firewall-cmd --list-all 2>/dev/null)
  echo "$F" | grep -qE '(^|[[:space:]])3000/tcp|port="3000"' && FA "firewall libera a porta 3000" || OK "firewall não libera a 3000"
  if echo "$F" | grep -qE '^[[:space:]]*services:.*(^|[[:space:]])https([[:space:]]|$)|^[[:space:]]*ports:.*(^|[[:space:]])443/tcp'; then
    IN "443 aberta pra QUALQUER origem (internet inteira)"
  else
    origens=$(echo "$F" | grep -E 'service name="https"|port port="443" protocol="tcp"' \
      | grep -oE 'source address="[^"]+"' | cut -d'"' -f2 | sort -u | tr '\n' ' ')
    if [ -n "$origens" ]; then IN "443 liberada SÓ para: $origens— quem estiver fora dessas redes não chega"
    else AV "não achei regra liberando a 443 no firewall"; fi
  fi
  if echo "$F" | grep -qE '^[[:space:]]*services:.*(^|[[:space:]])ssh([[:space:]]|$)'; then
    AV "ssh liberado pra qualquer origem — restrinja à rede interna (rich rule com source)"
  else OK "ssh não está aberto pra qualquer origem"; fi
else AV "firewalld inativo — confirme que o firewall da borda só deixa passar 80/443"; fi

echo
echo "== 3. grafana.ini"
chk server http_addr 127.0.0.1 "" "Grafana só local"
ru=$(ini server root_url)
case "$ru" in https://"$DOM"*) OK "[server] root_url = $ru" ;;
  *) FA "[server] root_url = ${ru:-(padrão)} → deveria ser https://$DOM/" ;; esac
ed=$(ini server enforce_domain); ed=${ed,,}; dm=$(ini server domain)
if [ "$ed" = true ]; then
  [ "${dm,,}" = "${DOM,,}" ] && OK "[server] enforce_domain = true e domain = $dm" \
    || FA "[server] enforce_domain = true mas domain = ${dm:-localhost (padrão)} → loop de redirecionamento; ponha domain = $DOM"
elif [ -n "$CATCHALL" ]; then OK "[server] enforce_domain desligado — o default_server do nginx já faz esse papel"
else FA "[server] enforce_domain = ${ed:-false} e o nginx não tem default_server na 443 → qualquer nome que aponte pro IP chega no Grafana; ligue com domain = $DOM (ou crie o default_server)"; fi
chk security cookie_secure true false "cookie de sessão só via HTTPS"
if echo "$N" | grep -qi 'add_header[[:space:]]\+Strict-Transport-Security'; then
  OK "HSTS enviado pelo nginx (deixe o do Grafana desligado pra não duplicar o cabeçalho)"
else chk security strict_transport_security true false "HSTS: navegador nunca volta pro http"; fi
chk security disable_gravatar true false "não manda e-mail dos usuários pro Gravatar"
chk security allow_embedding false false "sem iframe (clickjacking)"
chk security disable_brute_force_login_protection false false "trava após tentativas erradas"
chk users allow_sign_up false false "ninguém se cadastra sozinho"
chk users allow_org_create false false "usuário não cria organização"
chk users auto_assign_org_role viewer viewer "conta nova entra como Viewer"
chk auth.anonymous enabled false false "sem acesso anônimo"
chk auth.basic enabled false true "sem usuário:senha direto na API"
chk snapshots external_enabled false true "snapshot não vai pros servidores da Grafana Labs"
sess=$(ini auth login_maximum_inactive_lifetime_duration)
IN "sessão inativa expira em: ${sess:-7d (padrão)} — sugerido: 8h"
gf=$( { cat /etc/sysconfig/grafana-server 2>/dev/null; systemctl show grafana-server -p Environment 2>/dev/null; } \
  | grep -oE 'GF_[A-Z0-9_]+=[^ ]*' | grep -v '^GF_PATHS_' | tr '\n' ' ')
[ -n "$gf" ] && AV "variáveis de ambiente sobrescrevem o grafana.ini: $gf"

echo
echo "== 4. Pelo endereço público (no nginx deste servidor)"
# IP em que o nginx escuta a 443 (IPv4); 0.0.0.0/* = qualquer um, usa o local
LIP=$(ss -ltnH 'sport = :443' 2>/dev/null | awk '{print $4}' | grep -E '^([0-9.]+|\*):443$' | head -1 | sed 's/:443$//')
case "$LIP" in ''|0.0.0.0|'*') LIP=127.0.0.1 ;; esac
IN "testando no nginx em $LIP"
cod() { curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
  --resolve "$DOM:443:$LIP" --resolve "$DOM:80:$LIP" "$@"; }
cab() { curl -skI --max-time 10 --resolve "$DOM:443:$LIP" "$@"; }
B="https://$DOM"
c=$(cod "$B/api/health")
if [ "$c" = 000 ]; then
  FA "não conectou no nginx em $LIP:443 — os testes desta parte ficaram sem resposta"
else
  [ "$c" = 200 ] && OK "$B/api/health → 200" || FA "$B/api/health → $c"
  c=$(cod "http://$DOM/"); case "$c" in 301|302|307|308) OK "http redireciona pro https ($c)" ;; *) AV "http://$DOM/ → $c (sem redirecionamento?)" ;; esac
  c=$(cod "$B/metrics"); case "$c" in 403|404) OK "/metrics fechado ($c)" ;; *) FA "/metrics aberto ($c) — métricas internas do Grafana expostas" ;; esac
  c=$(cod "$B/api/search"); [ "$c" = 401 ] && OK "API exige login (401)" || FA "/api/search sem login → $c (acesso anônimo?)"
  H=$(cab "$B/login")
  echo "$H" | grep -qi '^strict-transport-security:' && OK "cabeçalho HSTS presente" || FA "sem cabeçalho Strict-Transport-Security"
  echo "$H" | grep -qiE "^x-frame-options:[[:space:]]*(deny|sameorigin)|^content-security-policy:.*frame-ancestors" \
    && OK "proteção contra iframe (X-Frame-Options / frame-ancestors)" || AV "sem X-Frame-Options nem frame-ancestors"
  echo "$H" | grep -qi '^x-content-type-options:[[:space:]]*nosniff' && OK "X-Content-Type-Options: nosniff" || AV "sem X-Content-Type-Options"
  # Sem login, o Grafana 12.4 não manda cookie nenhum (o redirect_to das versões
  # antigas saía aqui); aí quem garante o Secure é o cookie_secure da parte 3.
  C=$(curl -sk -o /dev/null -D - --max-time 10 --resolve "$DOM:443:$LIP" "$B/dashboards" | grep -i '^set-cookie:')
  if [ -z "$C" ]; then IN "sem login o Grafana não manda cookie pra conferir o Secure — vale o cookie_secure da parte 3"
  elif echo "$C" | grep -qi 'secure'; then OK "cookie marcado Secure"
  else FA "cookie sem Secure ([security] cookie_secure = true)"; fi
fi

echo
echo "== Resultado: $nok OK · $nav atenção · $nfa falha"
echo
echo "Falta UM teste que só dá pra fazer de fora da rede (ex.: celular no 4G roteando o notebook):"
echo "  curl --max-time 5 http://IP_PUBLICO_DO_SERVIDOR:3000/api/health"
echo "  → tem que FALHAR (timeout ou conexão recusada). Se responder, a 3000 está exposta."
