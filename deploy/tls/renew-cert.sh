#!/bin/sh
# Продление wildcard-сертификата и передача его прокси.
#
# В lego 5 отдельной команды продления нет: `run` сам решает, пора ли, и в
# обычный день не делает ничего.
#
# Сравниваем не «до и после» внутри прогона, а то, что лежит на диске, с тем,
# что уже отдано прокси. Иначе сбой на шаге установки остался бы навсегда:
# следующий прогон не увидел бы изменений и не повторил бы попытку.
set -eu

CERT_DIR=/etc/zerotomvp/tls/certificates
CERT="$CERT_DIR/_.zerotomvp.xyz.crt"
KEY="$CERT_DIR/_.zerotomvp.xyz.key"
PROXY_TLS=/var/lib/docker/volumes/kamal-proxy-config/_data/tls-zerotomvp
PROXY_TLS_IN_CONTAINER=/home/kamal-proxy/.config/kamal-proxy/tls-zerotomvp

fingerprint() { if [ -f "$1" ]; then sha256sum "$1" | cut -d' ' -f1; else echo none; fi; }

docker run --rm \
  -v /etc/zerotomvp/tls:/data \
  --env-file /etc/zerotomvp/cloudflare.env \
  -e LEGO_PATH=/data \
  goacme/lego:latest run \
  --accept-tos --email admin@zerotomvp.xyz \
  --dns cloudflare \
  --dns.resolvers 1.1.1.1:53,1.0.0.1:53 \
  --dns.timeout 30 \
  --domains "*.zerotomvp.xyz"

if [ "$(fingerprint "$CERT")" = "$(fingerprint "$PROXY_TLS/cert.pem")" ]; then
  echo "прокси уже отдаёт актуальный сертификат"
  exit 0
fi

echo "сертификат на диске отличается от того, что у прокси, — передаю"
mkdir -p "$PROXY_TLS"
install -m 644 "$CERT" "$PROXY_TLS/cert.pem"
install -m 600 "$KEY" "$PROXY_TLS/key.pem"
# Владелец задаётся числом: пользователя kamal-proxy на хосте нет, он
# существует только внутри контейнера.
chown 1001:1001 "$PROXY_TLS/cert.pem" "$PROXY_TLS/key.pem"

# Прокси читает файлы сертификата в момент настройки маршрута, поэтому
# маршрут надо переобъявить — сам он их не перечитывает.
docker exec kamal-proxy kamal-proxy deploy zerotomvp-placeholder \
  --target zerotomvp-app:3000 --tls \
  --tls-certificate-path "$PROXY_TLS_IN_CONTAINER/cert.pem" \
  --tls-private-key-path "$PROXY_TLS_IN_CONTAINER/key.pem" \
  --health-check-path /healthz

echo "готово"
