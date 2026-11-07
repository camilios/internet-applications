#!/usr/bin/env bash
# Read-only HTTP load against the current optimized app; never resets the database.
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
scenario="${1:-dashboard}"
case "$scenario" in
  dashboard|products-list|product-detail|customer-orders) ;;
  *) printf 'Use: bash perf/interview_run.sh [dashboard|products-list|product-detail|customer-orders]\n' >&2; exit 1 ;;
esac
command -v python3 >/dev/null
docker compose --profile performance up -d --no-build --wait loadtest-proxy
docker image inspect grafana/k6:latest >/dev/null
docker network inspect internet-applications_ecommerce-network >/dev/null
stamp="$(date +%Y%m%d-%H%M%S)-$$"
folder="docs/performance/interview/$stamp/$scenario"
mkdir -p -- "$folder"
docker run --rm grafana/k6:latest version | tee "$folder/k6-version.txt"
docker exec -i ecommerce-backend php > "$folder/dataset-counts.json" <<'PHP'
<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$counts = [];
foreach (['users', 'products', 'orders', 'order_items'] as $table) {
    $counts[$table] = Illuminate\Support\Facades\DB::table($table)->count();
}
echo json_encode($counts, JSON_PRETTY_PRINT), PHP_EOL;
PHP
run_base=$(( $(date +%s) % 200 ))
for run in 1 2 3; do
  printf '\n=== LIVE CURRENT (AFTER): %s | run %s/3 ===\n' "$scenario" "$run"
  docker run --rm --network internet-applications_ecommerce-network --user 0 \
    --volume "$PWD/perf/k6:/scripts:ro" \
    --volume "$PWD/$folder:/evidence" \
    --env "RUN_ID=$(( run_base + run ))" \
    grafana/k6:latest run --no-thresholds \
    --summary-export "/evidence/k6-$scenario-$run.json" \
    "/scripts/$scenario.js" 2>&1 | tee "$folder/k6-$scenario-$run.log"
done
python3 perf/interview_compare.py --scenario "$scenario" --live-dir "$folder" | tee "$folder/comparison.txt"
printf '\nSaved fresh evidence to: %s\n' "$folder"
