#!/bin/sh
# Освобождение места в реестре.
#
# Удаление манифеста слои не убирает — их вычищает сборка мусора. Она не
# терпит одновременных публикаций, поэтому реестр на это время
# останавливается. Окно — секунды, ночью; попавшая в него сборка упадёт и
# чинится повторным запуском.
set -eu

before=$(docker exec zerotomvp-registry du -sm /var/lib/registry 2>/dev/null | cut -f1 || echo 0)

docker stop zerotomvp-registry >/dev/null

docker run --rm \
  -v zerotomvp-registry-data:/var/lib/registry \
  -v /etc/zerotomvp/registry/config.yml:/etc/distribution/config.yml:ro \
  -v /etc/zerotomvp/registry/jwks.json:/etc/distribution/jwks.json:ro \
  registry:3 garbage-collect --delete-untagged /etc/distribution/config.yml 2>&1 | tail -3

docker start zerotomvp-registry >/dev/null

# Реестру нужно мгновение, чтобы снова принимать запросы.
i=0
while [ "$i" -lt 30 ]; do
  if docker exec zerotomvp-registry wget -qO- http://127.0.0.1:5001/debug/health >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
done

after=$(docker exec zerotomvp-registry du -sm /var/lib/registry 2>/dev/null | cut -f1 || echo 0)
echo "реестр: было ${before} МБ, стало ${after} МБ"
