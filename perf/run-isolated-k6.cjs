/* Controlled local benchmarks. Only task-owned containers and database copies are modified. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const commit = 'b9514cbe00b7d310cc2972aff728a9d690bc2a3b';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
const relative = 'docs/performance/isolated-features-' + stamp;
const output = path.join(root, relative);
const work = path.join(root, 'secrets', '.k6-isolated-' + stamp);
const owner = 'k6iso-' + stamp.toLowerCase();
const db = owner + '-mysql', baseline = owner + '-before', queries = owner + '-queries';
const prepareContainer = owner + '-prepare';
const controlImage = 'k6-isolated-control:' + stamp.toLowerCase();
const queryImage = 'k6-isolated-queries:' + stamp.toLowerCase();
const k6 = 'C:\\Program Files\\k6\\k6.exe';
const owned = new Set();
const records = [];
let runId = 20;
let linuxRoot;
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(work, { recursive: true });
const normalize = v => String(v).replace(/\r\n/g, '\n').trim();
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(output, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
const progress = (status, detail) => { const entry = { status, detail, at: new Date().toISOString(), completedRuns: records.length }; save('progress.json', entry); console.log(JSON.stringify(entry)); };
function command(exe, args, opts = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 180000, input: opts.input, windowsHide: true });
  if (opts.log) save(opts.log, (result.stdout || '') + (result.stderr || ''));
  if (result.error || ![0, ...(opts.allow || [])].includes(result.status)) throw new Error(`${exe} ${args[0]} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
  return normalize(result.stdout || '');
}
const wsl = (args, opts) => command('wsl.exe', ['-d', 'Ubuntu', '--', ...args], opts);
const docker = (args, opts) => wsl(['docker', ...args], opts);
const linux = file => linuxRoot + '/' + path.relative(root, file).split(path.sep).join('/');
const git = args => command('git', ['-c', 'safe.directory=' + root.replaceAll('\\','/'), ...args]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(base) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/products?per_page=15', { headers: { Accept: 'application/json', 'X-Forwarded-For': '198.18.19.249', 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(3000) })).status === 200) return; } catch (_) {}
    await sleep(1000);
  }
  throw new Error('Backend did not become ready: ' + base);
}
function ownedName(name) { if (!name.startsWith(owner + '-')) throw new Error('Refusing to modify a foreign container'); return name; }
function rootSql(database, input) {
  return docker(['exec', '-i', ownedName(db), 'sh', '-c', 'export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"; exec mysql -uroot --batch --raw ' + database], { input });
}
function php(container, code) {
  return docker(['exec', '-i', container, 'php'], { input: `<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
${code}\n` });
}
function snapshot(container) {
  return JSON.parse(php(container, `
$result = ['database' => config('database.connections.mysql.database'), 'cache' => config('cache.default'), 'captured_at' => gmdate('c')];
foreach (['users','products','orders','order_items'] as $table) $result['counts'][$table] = Illuminate\\Support\\Facades\\DB::connection('mysql')->useWriteConnectionWhenReading()->table($table)->count();
$result['indexes'] = [];
foreach (['products','orders'] as $table) $result['indexes'][$table] = Illuminate\\Support\\Facades\\DB::connection('mysql')->select('SHOW INDEX FROM '.$table);
echo json_encode($result, JSON_PRETTY_PRINT);`));
}
async function preflight(base) {
  const h = { Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.18.248' };
  const login = await fetch(base + '/login', { method: 'POST', headers: h, body: JSON.stringify({ email: 'bulk-customer-1@example.test', password: 'password123' }) });
  if (login.status !== 200) throw new Error('Preflight login: ' + login.status);
  const token = (await login.json()).access_token;
  const proof = {};
  for (const [key, route] of Object.entries({ products: '/products?per_page=15', detail: '/products/1', orders: '/orders?per_page=15', dashboard: '/dashboard' })) {
    const response = await fetch(base + route, { headers: { ...h, Authorization: 'Bearer ' + token } });
    if (response.status !== 200) throw new Error('Preflight ' + key + ': ' + response.status);
    const payload = await response.json();
    const data = payload.data;
    const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
    proof[key] = { status: response.status, data_sha256: crypto.createHash('sha256').update(JSON.stringify(sorted(data))).digest('hex'), etag: response.headers.get('etag'), encoding: response.headers.get('content-encoding'), items: Array.isArray(data) ? data.length : null };
  }
  return proof;
}
function repairPatch(before, after, label) {
  const old = path.join(work, 'patch-old-' + label.replaceAll('/', '_'));
  fs.writeFileSync(old, before || '', 'utf8');
  const result = command('git', ['diff', '--no-index', '--', old, after], { allow: [1] });
  return result.replaceAll(old.replaceAll('\\','/'), 'a/' + label).replaceAll(after.replaceAll('\\','/'), 'b/' + label) + '\n';
}
function startApp(name, image, database, port, envFile) {
  docker(['run', '-d', '--name', ownedName(name), '--label', 'k6.isolated.run=' + stamp,
    '--network', 'internet-applications_ecommerce-network', '-p', `127.0.0.1:${port}:8000`,
    '--env-file', linux(envFile), '-e', 'DB_HOST=' + db, '-e', 'DB_DATABASE=' + database,
    '-e', 'DB_CONNECTION=mysql', '-e', 'DB_USERNAME=laravel', '-e', 'DB_PASSWORD_FILE=/run/secrets/mysql_password',
    '-e', 'DB_PORT=3306', '-e', 'DB_REPLICA_ENABLED=false', '-e', 'CACHE_STORE=database',
    '-e', 'APP_ENV=local', '-e', 'APP_DEBUG=false', '-e', 'SKIP_MIGRATIONS=true',
    '-e', 'INVENTORY_GRPC_HOST=ecommerce-inventory:50051', '-e', 'INVENTORY_GRPC_TIMEOUT=5',
    '--mount', `type=bind,source=${linuxRoot}/secrets/mysql_password.txt,target=/run/secrets/mysql_password,readonly`,
    '--entrypoint', '/usr/local/bin/docker-entrypoint.sh', image,
    'php', 'artisan', 'serve', '--host=0.0.0.0', '--port=8000']);
  owned.add(name);
}
function measured(mode, side, trial, base) {
  const folder = path.join(output, mode, side);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `k6-${mode}-${trial}.json`);
  progress('running', `${mode}/${side}/${trial}`);
  const result = spawnSync(k6, ['run', '--quiet', '--no-thresholds', '--summary-export', file,
    '-e', 'MODE=' + mode, '-e', 'SIDE=' + side, '-e', 'BASE_URL=' + base, '-e', 'RUN_ID=' + (++runId),
    path.join(root, 'perf/k6/isolated-features.js')], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 100000, windowsHide: true });
  fs.writeFileSync(file.replace(/\.json$/, '.log'), (result.stdout || '') + (result.stderr || ''), 'utf8');
  if (!fs.existsSync(file)) throw new Error('No k6 summary: ' + mode + '/' + side + ': ' + result.stderr);
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  delete data.setup_data;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const m = data.metrics;
  if (result.status !== 0 || m.endpoint_errors?.value !== 0 || m.http_req_failed?.value !== 0 || m.checks?.fails !== 0 || m.http_429?.count !== 0) {
    save('failure.json', { mode, side, trial, exit: result.status, errorRate: m.endpoint_errors?.value, httpErrorRate: m.http_req_failed?.value, failedChecks: m.checks?.fails, http429: m.http_429?.count });
    throw new Error('Invalid benchmark: ' + mode + '/' + side + '/' + trial + '. See failure.json.');
  }
  const record = { mode, side, trial, runId, source: path.relative(root,file).replaceAll('\\','/'), sha256: sha(file), http_requests: m.http_reqs.count, checks_pass: m.checks.passes, checks_fail: m.checks.fails, http_429: m.http_429.count, endpoint_errors: m.endpoint_errors.value };
  records.push(record);
  save('runs.json', records);
  progress('verified', `${mode}/${side}/${trial}: HTTP=${record.http_requests}, errors=0, 429=0`);
}
async function main() {
  linuxRoot = wsl(['wslpath', '-u', root]);
  const headBefore = git(['rev-parse', 'HEAD']);
  const image = docker(['inspect', 'ecommerce-backend', '--format', '{{.Image}}']);
  const initial = snapshot('ecommerce-backend');
  save('main-dataset-before.json', initial);
  save('k6-version.txt', command(k6, ['version']));
  save('workload.js', fs.readFileSync(path.join(root,'perf/k6/isolated-features.js'),'utf8'));
  save('settings.json', { sourceCommit: commit, mainCommit: headBefore, runtimeImage: image, startedAt: new Date().toISOString(), workloadSha256: sha(path.join(root,'perf/k6/isolated-features.js')), vus: 5, stages: '5s ramp / 20s hold / 5s down', thinkTimeSeconds: 1, trialsPerSide: 3,
    baseline: 'Old source plus documented gRPC runtime repair, same PHP/framework runtime; no performance indexes, Redis, ETag, compression or replica.',
    queryOnly: 'Same repaired old source and dataset, with five performance indexes and the uncached dashboard aggregate query only.',
    compression: 'Current deployment; full product page, identical requests except identity versus gzip; no If-None-Match.',
    etag: 'Current deployment; identity encoding on both sides; unconditional full page versus a matching If-None-Match validator.',
    overall: 'Old repaired source/database copy versus current deployed backend through its trusted proxy; four endpoint types per iteration, conditional GET where supported.',
    warmup: 'One setup read per measured endpoint, excluded from custom endpoint trends; setup HTTP and login remain in HTTP totals.',
    order: 'Three repetitions with alternating before/after ordering; overall starts with the enhanced deployment.',
    writes: 'No business writes to main databases. Only task-owned database copies and their cache/rate-limit records are modified.' });
  progress('preparing', 'Exporting old source and checking shared dependencies');
  const archive = path.join(work, 'original.tar'), source = path.join(work, 'source');
  fs.mkdirSync(source, { recursive: true });
  git(['archive', '--format=tar', '--output=' + archive, commit, 'backend/my-project']);
  wsl(['tar','-xf',linux(archive),'-C',linux(source)]);
  const backend = path.join(source,'backend/my-project');
  const lockBefore = JSON.parse(fs.readFileSync(path.join(backend,'composer.lock'),'utf8'));
  const installedRaw = JSON.parse(docker(['exec','ecommerce-backend','cat','/var/www/html/vendor/composer/installed.json']));
  const installed = new Map((installedRaw.packages || installedRaw).map(p=>[p.name,p.version]));
  for (const p of lockBefore.packages) if (installed.get(p.name) !== p.version) throw new Error('Shared runtime dependency mismatch: ' + p.name);
  const repaired = path.join(work,'historical-repair');
  fs.mkdirSync(repaired, { recursive: true });
  command('tar.exe',['-xf',path.join(root,'docs/performance/baseline/baseline-source.zip'),'-C',repaired]);
  const repairs = ['composer.json','composer.lock',...['InventoryGrpcClient','InventoryGrpcStub','InventoryProtoResponse','InventoryStockResponse','InventoryReservationResponse','InventoryReleaseResponse'].map(n=>'app/Services/'+n+'.php')];
  const provenance = { originalCommit: commit, originalArchiveSha256: sha(archive), originalCorePackagesMatched: lockBefore.packages.length, additionalRuntimeDependency: { name: 'grpc/grpc', version: installed.get('grpc/grpc') }, repairs: [] };
  let patch = '';
  for (const file of repairs) {
    const target = path.join(backend,file), repairedFile = path.join(repaired,file);
    if (!fs.existsSync(repairedFile)) throw new Error('Missing documented repair file: ' + file);
    const before = fs.existsSync(target) ? fs.readFileSync(target,'utf8') : '';
    fs.copyFileSync(repairedFile,target);
    provenance.repairs.push({ file, beforeSha256: before ? crypto.createHash('sha256').update(before).digest('hex') : null, afterSha256: sha(target) });
    patch += repairPatch(before,target,file);
  }
  save('baseline-runtime-repairs.patch',patch);
  const dashboard = path.join(backend,'app/Http/Controllers/DashboardController.php');
  const oldDashboard = fs.readFileSync(dashboard,'utf8');
  const latestDashboard = fs.readFileSync(path.join(root,'backend/my-project/app/Http/Controllers/DashboardController.php'),'utf8');
  const method = latestDashboard.indexOf('    private function buildStats');
  if (method < 0) throw new Error('Dashboard aggregate source missing');
  const querySource = `<?php\nnamespace App\\Http\\Controllers;\nuse App\\Models\\Product;\nuse App\\Models\\User;\nuse Illuminate\\Http\\JsonResponse;\nuse Illuminate\\Support\\Facades\\Auth;\nuse Illuminate\\Support\\Facades\\DB;\nclass DashboardController extends Controller\n{\n    public function __invoke(): JsonResponse\n    {\n        $user = Auth::guard('api')->user();\n        return response()->json(['data' => $this->buildStats($user->id, $user->role === 'admin')]);\n    }\n\n` + latestDashboard.slice(method);
  const queryFile = path.join(work,'DashboardController.query-only.php');
  fs.writeFileSync(queryFile,querySource,'utf8');
  save('query-only.patch',repairPatch(oldDashboard,queryFile,'app/Http/Controllers/DashboardController.php'));
  provenance.queryOnlyControllerSha256 = sha(queryFile);
  provenance.controlPhpSources = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const file=path.join(dir,entry.name); if(entry.isDirectory())walk(file);else if(file.endsWith('.php'))provenance.controlPhpSources.push({file:path.relative(backend,file).replaceAll('\\','/'),sha256:sha(file)}); } };
  walk(backend);
  save('source-provenance.json',provenance);
  const env = path.join(work,'runtime.env');
  const appKey = docker(['exec','ecommerce-backend','printenv','APP_KEY']);
  const jwt = docker(['exec','ecommerce-backend','printenv','JWT_SECRET']);
  if (!appKey || !jwt || /[\r\n]/.test(appKey+jwt)) throw new Error('Invalid local runtime keys');
  fs.writeFileSync(env,`APP_KEY=${appKey}\nJWT_SECRET=${jwt}\n`,'utf8');
  docker(['create','--name',ownedName(prepareContainer),'--entrypoint','sleep',image,'infinity']); owned.add(prepareContainer);
  docker(['start',prepareContainer]);
  docker(['exec',prepareContainer,'sh','-c','cd /var/www/html && rm -rf app routes config bootstrap database resources public storage']);
  docker(['cp',linux(backend)+'/.',prepareContainer+':/var/www/html/']);
  docker(['exec',prepareContainer,'sh','-c','cd /var/www/html && mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs storage/app/public && composer dump-autoload --no-dev --optimize --no-scripts'],{log:'control-autoload.log'});
  docker(['exec',prepareContainer,'php','artisan','package:discover'],{log:'control-package-discovery.log'});
  docker(['commit','--change','ENTRYPOINT ["docker-entrypoint.sh"]','--change','CMD ["php","artisan","serve","--host=0.0.0.0","--port=8000"]',prepareContainer,controlImage]);
  docker(['cp',linux(queryFile),prepareContainer+':/var/www/html/app/Http/Controllers/DashboardController.php']);
  docker(['exec',prepareContainer,'php','-l','app/Http/Controllers/DashboardController.php'],{log:'query-controller-syntax.log'});
  docker(['commit',prepareContainer,queryImage]);
  docker(['rm','-f',prepareContainer]); owned.delete(prepareContainer);
  save('images.json',{ runtime: image, control: docker(['image','inspect',controlImage,'--format','{{.Id}}']), queries: docker(['image','inspect',queryImage,'--format','{{.Id}}']) });
  progress('preparing','Creating isolated database copies from one consistent primary snapshot');
  docker(['run','-d','--name',ownedName(db),'--label','k6.isolated.run='+stamp,'--network','internet-applications_ecommerce-network',
    '-e','MYSQL_ROOT_PASSWORD_FILE=/run/secrets/root_password','-e','MYSQL_DATABASE=ecommerce_before','-e','MYSQL_USER=laravel','-e','MYSQL_PASSWORD_FILE=/run/secrets/mysql_password',
    '--mount',`type=bind,source=${linuxRoot}/secrets/mysql_root_password.txt,target=/run/secrets/root_password,readonly`,
    '--mount',`type=bind,source=${linuxRoot}/secrets/mysql_password.txt,target=/run/secrets/mysql_password,readonly`,'mysql:8.0']); owned.add(db);
  for(let i=0;;i++){try{docker(['exec',db,'sh','-c','export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"; mysql -h127.0.0.1 -uroot -Nse "SELECT 1" ecommerce_before']);break;}catch(e){if(i>=60)throw e;await sleep(1000);}}
  const dump=path.join(work,'snapshot.sql');
  wsl(['bash','-s','--',linux(dump)],{input:String.raw`set -euo pipefail
docker exec ecommerce-mysql sh -c 'export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"; exec mysqldump -uroot --single-transaction --no-tablespaces --set-gtid-purged=OFF ecommerce' > "$1"
`,timeout:240000,log:'snapshot-export.log'});
  rootSql('',"CREATE DATABASE ecommerce_queries; GRANT ALL PRIVILEGES ON ecommerce_queries.* TO 'laravel'@'%';\n");
  for(const database of ['ecommerce_before','ecommerce_queries']) {
    wsl(['bash','-s','--',linux(dump),db,database],{input:String.raw`set -euo pipefail
docker exec -i "$2" sh -c 'export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"; exec mysql -uroot "$1"' sh "$3" < "$1"
`,timeout:300000,log:'import-'+database+'.log'});
  }
  rootSql('ecommerce_before',`ALTER TABLE products DROP INDEX products_active_created_idx, DROP INDEX products_active_category_created_idx;
ALTER TABLE orders DROP INDEX orders_user_created_idx, DROP INDEX orders_status_created_idx, DROP INDEX orders_created_idx;
DELETE FROM migrations WHERE migration='2026_11_05_000001_add_performance_indexes';\n`);
  save('database-copy.json',{ dumpSha256: sha(dump), source: 'ecommerce-mysql/ecommerce', targetContainer: db, before: 'ecommerce_before', afterQueries: 'ecommerce_queries', singleTransaction: true, removedOnlyFromBefore: ['products_active_created_idx','products_active_category_created_idx','orders_user_created_idx','orders_status_created_idx','orders_created_idx'] });
  startApp(baseline,controlImage,'ecommerce_before',8087,env);
  startApp(queries,queryImage,'ecommerce_queries',8088,env);
  await ready('http://localhost:8087/api'); await ready('http://localhost:8088/api');
  const controlData=snapshot(baseline), queryData=snapshot(queries);
  save('control-dataset-before.json',controlData);save('queries-dataset-before.json',queryData);
  if(JSON.stringify(controlData.counts)!==JSON.stringify(initial.counts)||JSON.stringify(queryData.counts)!==JSON.stringify(initial.counts))throw new Error('Dataset counts differ');
  const controlProof=await preflight('http://localhost:8087/api'),queryProof=await preflight('http://localhost:8088/api');
  for(const key of Object.keys(controlProof))if(controlProof[key].data_sha256!==queryProof[key].data_sha256)throw new Error('Query rewrite changed response data: '+key);
  save('preflight.json',{ control: controlProof, queryOnly:queryProof, matchingData:true });
  for(const [name,container] of [['before',baseline],['after',queries]]) {
    save('dashboard-queries-'+name+'.json',JSON.parse(php(container,`$user=App\\Models\\User::where('email','bulk-customer-1@example.test')->firstOrFail(); Illuminate\\Support\\Facades\\Auth::guard('api')->setUser($user); Illuminate\\Support\\Facades\\DB::enableQueryLog(); $response=(new App\\Http\\Controllers\\DashboardController())->__invoke(); $queries=Illuminate\\Support\\Facades\\DB::getQueryLog(); echo json_encode(['controller_query_count'=>count($queries),'queries'=>array_column($queries,'query'),'response_data_sha256'=>hash('sha256',$response->getContent())],JSON_PRETTY_PRINT);`)));
  }
  for(const mode of ['overall','compression','etag','queries']) {
    for(let trial=1;trial<=3;trial++) {
      const order=mode==='overall'?(trial%2?['after','before']:['before','after']):(trial%2?['before','after']:['after','before']);
      for(const side of order) {
        const base=(mode==='overall'&&side==='before')||(mode==='queries'&&side==='before')?'http://localhost:8087/api':mode==='queries'?'http://localhost:8088/api':'http://localhost:8086/api';
        measured(mode,side,trial,base);
      }
    }
  }
  const final=snapshot('ecommerce-backend'); save('main-dataset-after.json',final);
  const controlFinal=snapshot(baseline),queryFinal=snapshot(queries);
  save('control-dataset-after.json',controlFinal);save('queries-dataset-after.json',queryFinal);
  for(const data of [final,controlFinal,queryFinal])if(JSON.stringify(data.counts)!==JSON.stringify(initial.counts))throw new Error('Business row counts changed');
  if(git(['rev-parse','HEAD'])!==headBefore)throw new Error('Main commit changed during benchmark');
  summarize();
  progress('complete','24 verified runs; no HTTP failures, schema/check failures, or rate-limit responses; main business counts and Git commit unchanged');
}
function summarize() {
  const median=a=>[...a].sort((a,b)=>a-b)[1];
  const cases=[];
  for(const mode of ['overall','compression','etag','queries']) {
    const entry={mode,before:{},after:{}};
    for(const side of ['before','after']) {
      const runs=records.filter(r=>r.mode===mode&&r.side===side);
      const metrics=runs.map(r=>JSON.parse(fs.readFileSync(path.join(root,r.source),'utf8')).metrics);
      const stats=prefix=>Object.fromEntries(['p(50)','p(95)','p(99)'].map(p=>[p,median(metrics.map(m=>m[prefix][p]))]));
      entry[side]={ endpoint:stats('endpoint_duration'),http_rps:median(metrics.map(m=>m.http_reqs.rate)),bytes_per_http_request:median(metrics.map(m=>m.data_received.count/m.http_reqs.count)),http_requests:runs.reduce((s,r)=>s+r.http_requests,0),http_429:0,failed_checks:0,
        measured_http_200:metrics.reduce((s,m)=>s+m.http_200.count,0),measured_http_304:metrics.reduce((s,m)=>s+m.http_304.count,0),measured_gzip_responses:metrics.reduce((s,m)=>s+m.gzip_responses.count,0),
        sources:runs.map(r=>r.source),by_endpoint:{} };
      for(const endpoint of ['products','detail','orders','dashboard'])if(metrics.every(m=>m[endpoint+'_duration']))entry[side].by_endpoint[endpoint]=stats(endpoint+'_duration');
    }
    cases.push(entry);
  }
  save('summary.json',{aggregation:'Median of three run-level percentiles; HTTP totals include setup; custom endpoint trends exclude setup; received bytes/request includes headers and setup.',cases,runs:records,datasetCountsUnchanged:true,mainCommitUnchanged:true,completedAt:new Date().toISOString()});
}
main().catch(error=>{save('error.txt',error.stack||String(error));progress('failed',error.message);process.exitCode=1;}).finally(()=>{
  const cleanup=[];
  for(const name of [...owned].reverse()) {try{docker(['rm','-f','-v',ownedName(name)]);cleanup.push({name,removed:true});}catch(e){cleanup.push({name,removed:false,error:e.message});}}
  for(const name of ['runtime.env','snapshot.sql']) {const file=path.join(work,name);if(fs.existsSync(file))fs.unlinkSync(file);}
  save('cleanup.json',{containers:cleanup,mainServicesNotStopped:true,privateCredentialFileRemoved:true,privateDatabaseDumpRemoved:true,imagesRetained:[controlImage,queryImage]});
  console.log('Evidence: '+output);
});
