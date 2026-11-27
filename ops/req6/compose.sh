#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Use the prepared Req5 runtime when present. Fresh checkouts can build its standard images first.
for pair in 'APP_IMAGE api' 'NGINX_IMAGE gateway' 'RABBIT_IMAGE rabbitmq' 'INVENTORY_IMAGE inventory-service'; do
  read -r suffix service <<< "$pair"
  variable="REQ5_$suffix"
  if [[ -z "${!variable:-}" ]]; then
    if runtime=$(docker inspect -f '{{.Config.Image}}' "ecommerce-req5-${service}-1" 2>/dev/null); then
      export "$variable=$runtime"
    fi
  fi
done
files=(-f docker-compose.req5.yml -f docker-compose.req5-interview.yml -f docker-compose.req6.yml)
if [[ ${1:-} == --local-sources ]]; then
  shift
  if [[ ! -s inventory-service/dist/grpc/handlers.js || inventory-service/src/grpc/handlers.ts -nt inventory-service/dist/grpc/handlers.js ]]; then
    echo 'Compile inventory-service first (npm run build inside inventory-service).' >&2
    exit 1
  fi
  files+=(-f ops/req6/local-sources.yml)
fi
exec docker compose -p ecommerce-req6 "${files[@]}" "$@"
