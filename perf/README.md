# Requirement 3 evidence and runners

Use PowerShell from `E:\projects\internet-applications`, with Ubuntu WSL and native Docker running. Python invokes `wsl.exe -d Ubuntu -- docker`; paths, network and container names are specific to this project. Frontend dependencies must already be installed. No frontend Docker container is needed.

The main database already has 300,004 orders. Do not repeat `seed`, `apply-*` or `stage-*` on this deployment. Apply commands are historical, one-time source transformations. Do not use `migrate:fresh` against the main database.

## Check the current deployment

The final image contains the approved source changes. Start backend services from an Ubuntu terminal:

```bash
cd /mnt/e/projects/internet-applications
docker compose up -d --no-build --wait backend inventory-service scheduler redis
docker compose ps
```

Dedicated verification containers were stopped at completion to save resources. To restart existing test containers from PowerShell:

```powershell
wsl.exe -d Ubuntu -- docker start ecommerce-laravel-test-mysql ecommerce-inventory-test-mysql
wsl.exe -d Ubuntu -- docker start ecommerce-inventory-test requirement3-tests
python perf/requirement3.py tests after-notifications
python perf/requirement3.py verify-pagination
python perf/requirement3.py verify-etag
python perf/requirement3.py frontend-checks
python perf/final_checks.py
```

Wait until the two test MySQL services and test inventory are healthy before running suites. The default suite explicitly uses SQLite and array cache. The integration suite uses the dedicated `ecommerce_test` database and `laravel_test` account. Its bootstrap and real-commit notification test guard database identity before any reset. Never point the test runner at the application database.

The following live check briefly stops the real inventory service and writes tagged fixtures. Run while no other customer is placing orders. A finally block restores the service and removes only owned data:

```powershell
python perf/api_write_verify.py
```

The isolated UI harness uses the actual ProductDetails component and query/mutation hooks, with controlled API fixtures and lightweight router/UI mocks. It does not control a browser. Dependencies are isolated from the frontend package/lock; React and React Query resolve to the frontend copies.

```powershell
Set-Location perf/ui-tests
npm.cmd install --ignore-scripts --no-audit --no-fund
$env:RAYON_NUM_THREADS='1'
$env:UV_THREADPOOL_SIZE='1'
$env:NODE_OPTIONS='--max-old-space-size=768'
npm.cmd exec -- vitest run --reporter=json --outputFile=E:/projects/internet-applications/docs/performance/results/frontend-component-tests.json
Set-Location ../..
```

Build/lint runner uses the same bounded worker/heap settings to avoid the observed laptop allocation failure. Frontend production files were not changed after its successful build and lint.

Stop only the dedicated test resources when finished:

```powershell
wsl.exe -d Ubuntu -- docker stop requirement3-tests ecommerce-inventory-test ecommerce-laravel-test-mysql ecommerce-inventory-test-mysql
```

## Historical measurement ladder

These are the executed runner commands in dependency order, not instructions to mutate the finished deployment. Repeating the baseline requires an isolated copy of the original source and databases: original HEAD is in REPORT.md and `docs/performance/baseline/baseline-source.zip` contains the corrected pre-optimization backend. It excludes secrets and the performance index migration. Retain the current perf scripts separately. Do not share database volumes with the finished deployment. A fresh independent seed is not guaranteed to produce identical random rows; compare steps against the same one seeded dataset.

The baseline first repaired missing `grpc/grpc` and its pre-existing SDK response contract; discarded broken-runtime load files are separate. Existing healthy images were reused instead of rebuilding the full original stack or starting a frontend container. Test-image setup details and failed attempts are retained in the raw results. `setup-tests` creates its named container only if absent; use `docker start` for an existing stopped one.

```powershell
python perf/requirement3.py init
python perf/requirement3.py seed
python perf/requirement3.py explain baseline/explain-before.txt
python perf/requirement3.py snapshot baseline/dashboard-response-before.json
python perf/requirement3.py tests dependency-repaired
python perf/requirement3.py load baseline
python perf/requirement3.py stage-indexes
python perf/requirement3.py apply-dashboard
python perf/requirement3.py sync
python perf/requirement3.py stage-dashboard
python perf/requirement3.py apply-redis
python perf/requirement3.py build-redis
python perf/requirement3.py deploy-redis
python perf/requirement3.py stage-pagination
python perf/requirement3.py stage-product-cache
python perf/requirement3.py stage-etag
python perf/requirement3.py stage-refactor
python perf/requirement3.py stage-notifications
python perf/requirement3.py persist-runtime
python perf/requirement3.py summary
```

T9 and frontend A–D require the user decisions recorded in REPORT.md. The frontend source edits were applied directly, then checked with `frontend-checks` and the harness above; they are not generated by the historical apply commands.

`load <stage> [scenario ...]` runs three summaries for each selected scenario, using the same dataset, five VUs, 5/20/5-second ramp/hold/down and one-second think time. Login is setup; endpoint trend excludes login. Deterministic client IPs keep each VU below the existing limit. `--no-thresholds` makes thresholds reporting-only. k6's existing local image was unchanged across measurements.

`notification-benchmark before|after` resets only its guarded dedicated test database and uses fake inventory reservation confirmation plus a synthetic 50 ms notification delay. It is not a real HTTP performance test. The after-commit integration separately checks actual transaction completion and failure behavior.

Raw results are under `docs/performance/`; repeated commands overwrite files with the same name. Copy existing evidence before repeating. `summary` regenerates measured tables; `final_checks.py` records health, CORS, counts, plans and git manifests. `finalize_report.py` assembles the report from these captured files. The source archive and old migration down() were not used to test rollback.

Native Docker under WSL needs an active WSL session. Closing the final Linux session caused a verified idle shutdown/connection refusal. One hidden `wsl.exe -d Ubuntu -- sleep infinity` process is left running to keep Docker available now; it adds no scheduled task or startup setting. For future manual starts, keep your Ubuntu terminal open after running compose. `wsl --shutdown` stops this session and the Linux containers. See the lifecycle evidence in `docs/performance/results/wsl-session-lifecycle.txt`.
