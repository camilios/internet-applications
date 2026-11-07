"""Reproducible Requirement 3 tooling; executes Docker in Ubuntu WSL."""
from pathlib import Path
import json
import subprocess
import sys
import time
import urllib.request
import statistics

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[1]
LINUX_ROOT = '/mnt/e/projects/internet-applications'
OUT = ROOT / 'docs/performance'

def docker(*args, input=None, check=True):
    raw = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--', 'docker', *args],
                         input=input.encode('utf-8') if input is not None else None, capture_output=True)
    result = subprocess.CompletedProcess(raw.args, raw.returncode,
        raw.stdout.decode('utf-8', errors='replace'), raw.stderr.decode('utf-8', errors='replace'))
    if check and result.returncode:
        raise RuntimeError(f'Docker {args[0]} exited {result.returncode}: '+result.stdout + result.stderr)
    return result

def compose(*args, **kwargs):
    return docker('compose', '--project-directory', LINUX_ROOT, *args, **kwargs)

def redact(text):
    for secret in (ROOT/'secrets').glob('*password*.txt'):
        value=secret.read_text(encoding='utf-8').strip()
        if len(value)>4: text=text.replace(value, '[REDACTED TEST SECRET]')
    return text

def save(path, text):
    path = OUT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(redact(text), encoding='utf-8')

def php(code):
    return docker('exec', '-i', 'ecommerce-backend', 'php', input=r'''<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
// Maintenance/evidence helpers always read the primary; API routing is tested separately.
if (config('database.default') === 'mysql') Illuminate\Support\Facades\DB::connection('mysql')->useWriteConnectionWhenReading();
''' + code).stdout

def counts():
    return php("foreach (['users','products','orders','order_items'] as $table) echo $table.': '.Illuminate\\Support\\Facades\\DB::table($table)->count().PHP_EOL;")

def api(path, email=None, token=None, method='GET', body=None, headers=None):
    if email:
        password='admin123456' if email=='admin@example.com' else 'password123'
        token=api('/login',method='POST',body={'email':email,'password':password})['access_token']
    hdr={'Accept':'application/json','Content-Type':'application/json', **(headers or {})}
    if token: hdr['Authorization']='Bearer '+token
    request=urllib.request.Request('http://localhost:8000/api'+path,
        data=json.dumps(body).encode() if body is not None else None,headers=hdr,method=method)
    with urllib.request.urlopen(request,timeout=30) as response:
        return json.load(response)

if __name__ == '__main__':
    command = sys.argv[1]
    if command == 'init':
        (OUT/'baseline').mkdir(parents=True, exist_ok=True)
        (OUT/'results').mkdir(parents=True, exist_ok=True)
        for name,args in [('git-status-start.txt',['git','status','--short']),('git-diff-start.txt',['git','diff','--stat'])]:
            r=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
            save('baseline/'+name,r.stdout+r.stderr)
        save('baseline/environment.txt',compose('version').stdout+compose('images').stdout+docker('info','--format','{{.OperatingSystem}} CPUs={{.NCPU}} RAM={{.MemTotal}}').stdout)
        save('baseline/initial-counts.txt',counts())
        instructions=(ROOT/'AGENT_INSTRUCTIONS_REQUIREMENT_3.md').read_text(encoding='utf-8')
        seeder=instructions.split('## Appendix C')[1].split('```php\n',1)[1].split('```',1)[0]
        (ROOT/'backend/my-project/database/seeders/BulkOrderSeeder.php').write_text(seeder,encoding='utf-8')
        docker('cp',LINUX_ROOT+'/backend/my-project/database/seeders/BulkOrderSeeder.php','ecommerce-backend:/var/www/html/database/seeders/BulkOrderSeeder.php')
        print(counts())
    elif command == 'seed':
        started=time.monotonic()
        result=compose('exec','-T','-e','BULK_ORDER_COUNT=300000','backend','php','artisan','db:seed','--class=BulkOrderSeeder',check=False)
        text=result.stdout+result.stderr+f'\nElapsed seconds: {time.monotonic()-started:.6f}\nExit code: {result.returncode}\n'+counts()
        save('baseline/dataset.txt',text)
        print(text)
        sys.exit(result.returncode)
    elif command == 'explain':
        queries=[
            'SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT 15',
            'SELECT * FROM products WHERE is_active = 1 AND category_id = 1 ORDER BY created_at DESC LIMIT 15',
            'SELECT * FROM orders WHERE user_id = USER_ID ORDER BY created_at DESC LIMIT 15',
            "SELECT * FROM orders WHERE status = 'shipped' ORDER BY created_at DESC LIMIT 15",
            'SELECT * FROM orders ORDER BY created_at DESC LIMIT 15',
            "SELECT COUNT(*) FROM orders WHERE status <> 'cancelled'",
        ]
        code='$userId = Illuminate\\Support\\Facades\\DB::table("orders")->selectRaw("user_id, COUNT(*) AS n")->groupBy("user_id")->orderByDesc("n")->value("user_id");\n'
        for q in queries:
            code+='$sql = str_replace("USER_ID", (string)$userId, '+json.dumps(q)+'); echo $sql.PHP_EOL; foreach (["EXPLAIN ","EXPLAIN ANALYZE "] as $prefix) { echo json_encode(Illuminate\\Support\\Facades\\DB::select($prefix.$sql), JSON_PRETTY_PRINT).PHP_EOL; }\n'
        code+='foreach (["products","orders"] as $table) echo "INDEXES ".$table.PHP_EOL.json_encode(Illuminate\\Support\\Facades\\DB::select("SHOW INDEX FROM ".$table),JSON_PRETTY_PRINT).PHP_EOL;'
        result=php(code)
        save(sys.argv[2],result)
        print(result[:2500])
    elif command == 'setup-tests':
        args=['-f',LINUX_ROOT+'/docker-compose.yml','-f',LINUX_ROOT+'/perf/tests.compose.yml','--profile','mysql-integration']
        result=compose(*args,'up','-d','--no-build','mysql-integration','inventory-mysql-integration','inventory-service-integration',check=False)
        save('baseline/test-stack.txt',result.stdout+result.stderr)
        print(result.stdout+result.stderr)
        if result.returncode: sys.exit(result.returncode)
        result=compose(*args,'run','-d','--no-deps','--name','requirement3-tests','--entrypoint','sleep','backend-test','infinity')
        print(result.stdout)
    elif command == 'snapshot':
        bodies={email:api('/dashboard',email=email) for email in ['admin@example.com','bulk-customer-1@example.test','bulk-customer-2@example.test']}
        save(sys.argv[2],json.dumps(bodies,indent=2))
        print(json.dumps(bodies,indent=2))
    elif command == 'repair-runtime':
        for source,target in [('app/.','app'),('routes/.','routes'),('config/.','config'),('bootstrap/app.php','bootstrap/app.php'),('database/.','database'),('composer.json','composer.json'),('composer.lock','composer.lock')]:
            docker('cp',LINUX_ROOT+'/backend/my-project/'+source,'ecommerce-backend:/var/www/html/'+target)
        r=compose('exec','-T','backend','composer','install','--no-dev','--no-interaction','--no-scripts',check=False)
        save('baseline/dependency-repair.txt',r.stdout+r.stderr)
        print(redact(r.stdout+r.stderr))
        sys.exit(r.returncode)
    elif command == 'archive-failed-baseline':
        archive=OUT/'baseline/discarded-before-dependency-repair'
        archive.mkdir(exist_ok=True)
        for path in (OUT/'baseline').glob('k6-*'):
            assert path.resolve().is_relative_to(OUT.resolve())
            destination=archive/path.name
            assert destination.resolve().is_relative_to(OUT.resolve())
            path.rename(destination)
        print('Archived failed-runtime k6 evidence')
    elif command == 'apply-indexes':
        instructions=(ROOT/'AGENT_INSTRUCTIONS_REQUIREMENT_3.md').read_text(encoding='utf-8')
        migration=instructions.split('## Appendix A')[1].split('```php\n',1)[1].split('```',1)[0]
        name='2026_11_05_000001_add_performance_indexes.php'
        target=ROOT/'backend/my-project/database/migrations'/name
        if target.exists(): raise RuntimeError('Refusing to replace an existing migration')
        target.write_text(migration,encoding='utf-8')
        docker('cp',LINUX_ROOT+'/backend/my-project/database/migrations/'+name,
            'ecommerce-backend:/var/www/html/database/migrations/'+name)
        result=compose('exec','-T','backend','php','artisan','migrate','--force')
        save('results/after-indexes/migration.txt',result.stdout+result.stderr)
        print(result.stdout)
    elif command == 'sync':
        for source,target in [('app/.','app'),('routes/.','routes'),('bootstrap/app.php','bootstrap/app.php')]:
            for container in ['ecommerce-backend','ecommerce-scheduler']:
                docker('cp',LINUX_ROOT+'/backend/my-project/'+source,container+':/var/www/html/'+target)
        for service in ['backend','scheduler']:
            print(compose('exec','-T',service,'php','artisan','route:cache').stdout)
    elif command == 'apply-dashboard':
        instructions=(ROOT/'AGENT_INSTRUCTIONS_REQUIREMENT_3.md').read_text(encoding='utf-8')
        controller=instructions.split('## Appendix B')[1].split('```php\n',1)[1].split('```',1)[0]
        (ROOT/'backend/my-project/app/Http/Controllers/DashboardController.php').write_text(controller,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Services/OrderService.php'
        source=path.read_text(encoding='utf-8').replace('use App\\Models\\FailedCompensation;',
            'use App\\Http\\Controllers\\DashboardController;\nuse App\\Models\\FailedCompensation;')
        source=source.replace("        return $order->load('items.product');", "        DashboardController::forgetCache($user->id);\n\n        return $order->load('items.product');")
        source=source.replace("        $order->update(['status' => $status]);", "        $order->update(['status' => $status]);\n        DashboardController::forgetCache($order->user_id);")
        path.write_text(source,encoding='utf-8')
    elif command == 'tests':
        stage=sys.argv[2]
        for label,args in [('artisan',['php','artisan','test','--no-ansi']),('mysql',['php','vendor/bin/phpunit','--configuration','phpunit.mysql.xml','--colors=never'])]:
            if label=='artisan':
                r=docker('exec','-e','DB_CONNECTION=sqlite','-e','DB_DATABASE=:memory:',
                    '-e','CACHE_STORE=array','-e','RUN_MYSQL_INTEGRATION_TESTS=false','requirement3-tests',*args,check=False)
            else:
                r=docker('exec','-i','requirement3-tests','bash',input='export DB_PASSWORD="$(tr -d \'\\r\\n\' < "$DB_PASSWORD_FILE")"\nphp vendor/bin/phpunit --configuration phpunit.mysql.xml --colors=never\n',check=False)
            save('results/'+stage+'/tests-'+label+'.txt',r.stdout+r.stderr+f'\nExit code: {r.returncode}\n')
            print(label,r.returncode,redact(r.stdout+r.stderr)[-2200:])
            if r.returncode: sys.exit(r.returncode)
    elif command == 'load':
        stage=sys.argv[2]
        stages=['baseline','after-indexes','after-dashboard','after-redis','after-pagination','after-product-cache','after-etag','after-refactor']
        scenarios=sys.argv[3:] or ['products-list','product-detail','customer-orders','dashboard']
        folder='baseline' if stage=='baseline' else 'results/'+stage
        (OUT/folder).mkdir(parents=True,exist_ok=True)
        save(folder+'/dataset-counts.txt',counts())
        for scenario in scenarios:
            index=['products-list','product-detail','customer-orders','dashboard'].index(scenario)
            for run in range(1,4):
                run_id=stages.index(stage)*12+index*3+run
                output=f'/evidence/{folder}/k6-{scenario}-{run}.json'
                r=docker('run','--rm','--network','internet-applications_ecommerce-network','--user','0',
                    '-v',LINUX_ROOT+'/perf/k6:/scripts:ro','-v',LINUX_ROOT+'/docs/performance:/evidence',
                    '-e',f'RUN_ID={run_id}','grafana/k6:latest','run','--no-thresholds','--summary-export',output,
                    '/scripts/'+scenario+'.js',check=False)
                save(folder+f'/k6-{scenario}-{run}.log',r.stdout+r.stderr+f'\nExit code: {r.returncode}\n')
                print(stage,scenario,run,'exit',r.returncode,flush=True)
                if r.returncode:
                    print((r.stdout+r.stderr)[-2500:]);sys.exit(r.returncode)
        print('Load stage complete',stage,flush=True)
        subprocess.run([sys.executable,__file__,'summary'],check=True)
    elif command == 'stage-indexes':
        for scenario in ['products-list','product-detail','customer-orders','dashboard']:
            for run in range(1,4):
                evidence=json.loads((OUT/f'baseline/k6-{scenario}-{run}.json').read_text(encoding='utf-8'))
                if evidence['metrics']['endpoint_errors']['value']:
                    raise RuntimeError('Baseline contains endpoint errors: '+scenario)
        for args in [['apply-indexes'],['explain','results/after-indexes/explain-after.txt'],['tests','after-indexes'],['load','after-indexes']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'stage-dashboard':
        subprocess.run([sys.executable,__file__,'tests','after-dashboard'],check=True)
        before=json.loads((OUT/'baseline/dashboard-response-before.json').read_text(encoding='utf-8'))
        after={email:api('/dashboard',email=email) for email in before}
        save('results/dashboard-response-check.txt',json.dumps({'unchanged_response_bodies':before==after,'before':before,'after':after},indent=2)
            +'\nReal order-creation invalidation and stock checks: after-dashboard/tests-mysql.txt\n')
        if before!=after: raise RuntimeError('Dashboard response bodies changed')
        subprocess.run([sys.executable,__file__,'load','after-dashboard','dashboard'],check=True)
    elif command == 'apply-redis':
        import re
        dockerfile=ROOT/'backend/my-project/Dockerfile'
        source=dockerfile.read_text(encoding='utf-8')
        anchor='    && docker-php-ext-enable grpc protobuf'
        if 'pecl install redis' in source: raise RuntimeError('Redis is already in the Dockerfile')
        dockerfile.write_text(source.replace(anchor,anchor+'\n\n# Shared application cache. Stock is always fetched live.\nRUN pecl install redis && docker-php-ext-enable redis'),encoding='utf-8')
        composefile=ROOT/'docker-compose.yml'
        source=composefile.read_text(encoding='utf-8')
        for service in ['backend','scheduler']:
            start=source.index('\n  '+service+':\n')+1
            following=re.search(r'^  [a-z0-9-]+:\s*$',source[start+1:],re.M)
            end=start+1+following.start() if following else source.index('\nnetworks:',start)
            block=source[start:end]
            block=block.replace('    environment:\n','    environment:\n      CACHE_STORE: redis\n      REDIS_CLIENT: phpredis\n      REDIS_HOST: redis\n      REDIS_PORT: 6379\n',1)
            block=block.replace('    depends_on:\n','    depends_on:\n      redis:\n        condition: service_healthy\n',1)
            source=source[:start]+block+source[end:]
        redis='''  # Shared application cache; intentionally not published to the host.
  redis:
    image: redis:7-alpine
    container_name: ecommerce-redis
    restart: unless-stopped
    command: ["redis-server", "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lru"]
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

'''
        marker=source.index('# ─── Networks')
        source=source[:marker]+redis+source[marker:]
        composefile.write_text(source,encoding='utf-8')
        example=ROOT/'backend/my-project/.env.example'
        example.write_text(example.read_text(encoding='utf-8').replace('CACHE_STORE=database','CACHE_STORE=redis'),encoding='utf-8')
        print('Redis configuration updated')
    elif command == 'build-redis':
        docker('tag','internet-applications-backend:latest','requirement3-runtime:before-redis')
        docker('commit','--no-pause','requirement3-tests','requirement3-tests:prepared')
        for label,args in [('redis-runtime',['build','-f',LINUX_ROOT+'/perf/Dockerfile.redis-runtime','-t','internet-applications-backend:latest',LINUX_ROOT+'/backend/my-project']),
                           ('redis-tests',['build','-f',LINUX_ROOT+'/perf/Dockerfile.redis-tests','-t','requirement3-tests:redis',LINUX_ROOT])]:
            r=docker(*args,check=False)
            save('results/after-redis/build-'+label+'.txt',r.stdout+r.stderr)
            print(label,r.returncode,redact(r.stdout+r.stderr)[-900:],flush=True)
            if r.returncode:sys.exit(r.returncode)
        docker('tag','internet-applications-backend:latest','internet-applications-scheduler:latest')
        print('Redis images ready',flush=True)
    elif command == 'deploy-redis':
        r=compose('up','-d','--no-build','--wait','--wait-timeout','180','backend','scheduler','inventory-service','redis')
        save('results/after-redis/startup.txt',r.stdout+r.stderr)
        print(r.stdout+r.stderr,flush=True)
        subprocess.run([sys.executable,__file__,'wait-health'],check=True)
        docker('stop','requirement3-tests',check=False)
        docker('rm','requirement3-tests',check=False)
        docker('tag','requirement3-tests:redis','requirement3-tests:latest')
        subprocess.run([sys.executable,__file__,'setup-tests'],check=True)
        result=php("echo 'store='.config('cache.default').PHP_EOL; Illuminate\\Support\\Facades\\Cache::put('requirement3:probe', 1, 60); echo 'cache_probe='.Illuminate\\Support\\Facades\\Cache::get('requirement3:probe').PHP_EOL; echo 'redis_cache_db='.config('database.redis.cache.database').PHP_EOL; echo 'phpredis='.(extension_loaded('redis')?'loaded':'missing').PHP_EOL; echo 'opcache_cli='.ini_get('opcache.enable_cli').PHP_EOL;")
        save('results/after-redis/cache-verification.txt',result)
        print(result,flush=True)
        if 'store=redis' not in result or 'cache_probe=1' not in result:raise RuntimeError('Redis cache verification failed')
        api('/dashboard',email='bulk-customer-1@example.test')
        save('results/after-redis/redis-dashboard-keys.txt',compose('exec','-T','redis','redis-cli','-n','1','KEYS','*dashboard*').stdout)
        subprocess.run([sys.executable,__file__,'tests','after-redis'],check=True)
        subprocess.run([sys.executable,__file__,'load','after-redis'],check=True)
    elif command == 'wait-health':
        events=[]
        for attempt in range(30):
            healthy=True
            for url in ['http://localhost:8000/up','http://localhost:5173']:
                try:
                    with urllib.request.urlopen(url,timeout=3) as response:
                        events.append(f'{attempt} {url}: {response.status}')
                        healthy=healthy and response.status==200
                except Exception as error:
                    events.append(f'{attempt} {url}: {type(error).__name__}')
                    healthy=False
            if healthy:
                save('results/health-recovery.txt','\n'.join(events)+'\n'+counts())
                print('Both health endpoints returned 200',flush=True)
                break
            time.sleep(2)
        else:
            save('results/health-recovery.txt','\n'.join(events))
            raise RuntimeError('Health checks failed; measurement ladder stopped')
    elif command == 'frontend-checks':
        import os
        environment=os.environ.copy()
        environment.update({'RAYON_NUM_THREADS':'1','UV_THREADPOOL_SIZE':'1','NODE_OPTIONS':'--max-old-space-size=768'})
        for label in ['build','lint']:
            r=subprocess.run(['npm.cmd','run',label],cwd=ROOT/'frontend',env=environment,capture_output=True,
                text=True,encoding='utf-8',errors='replace',shell=True)
            save('results/frontend/'+label+'.txt',r.stdout+r.stderr+f'\nExit code: {r.returncode}\n')
            print(label,r.returncode,(r.stdout+r.stderr)[-2000:],flush=True)
            if r.returncode:sys.exit(r.returncode)
    elif command == 'apply-pagination':
        for name in ['app/Services/OrderService.php','app/Services/ProductService.php','app/Http/Controllers/ProductController.php','app/Services/NotificationService.php']:
            path=ROOT/'backend/my-project'/name
            path.write_text(path.read_text(encoding='utf-8').replace("->latest()", "->orderByDesc('created_at')->orderByDesc('id')"),encoding='utf-8')
        path=ROOT/'backend/my-project/tests/Feature/PerformanceCachingTest.php'
        source=path.read_text(encoding='utf-8')
        method='''
    public function test_order_pagination_is_complete_when_timestamps_are_equal(): void
    {
        $user = User::factory()->create();
        $ids = [];
        $timestamp = now()->startOfSecond();
        for ($i = 0; $i < 43; $i++) {
            $ids[] = Order::create(['user_id' => $user->id, 'total' => '1.00',
                'status' => 'pending', 'created_at' => $timestamp])->id;
        }
        $received = [];
        for ($page = 1; $page <= 3; $page++) {
            $response = $this->actingAs($user, 'api')->getJson('/api/orders?page='.$page)
                ->assertOk()->assertJsonPath('meta.total', 43);
            $received = array_merge($received, array_column($response->json('data'), 'id'));
        }
        $this->assertCount(43, array_unique($received));
        $this->assertSame(array_reverse($ids), $received);
    }
'''
        head,tail=source.rsplit('\n}',1)
        path.write_text(head+'\n'+method+'\n}'+tail,encoding='utf-8')
    elif command == 'verify-pagination':
        token=api('/login',method='POST',body={'email':'bulk-customer-1@example.test','password':'password123'})['access_token']
        first=api('/orders?page=1',token=token)
        received=[x['id'] for x in first['data']]
        for page in range(2,first['meta']['last_page']+1):
            received.extend(x['id'] for x in api('/orders?page='+str(page),token=token)['data'])
        expected=json.loads(php("$user=App\\Models\\User::where('email','bulk-customer-1@example.test')->firstOrFail(); echo json_encode($user->orders()->orderByDesc('created_at')->orderByDesc('id')->pluck('id'));") )
        result={'reported_total':first['meta']['total'],'last_page':first['meta']['last_page'],'received':len(received),
                'unique':len(set(received)),'matches_database_order':received==expected,'ids':received}
        save('results/pagination-completeness.json',json.dumps(result,indent=2))
        print(json.dumps(result,indent=2))
        if received!=expected or len(set(received))!=len(expected):raise RuntimeError('Incomplete pagination')
    elif command == 'stage-pagination':
        for args in [['apply-pagination'],['sync'],['tests','after-pagination'],['verify-pagination'],['load','after-pagination','products-list','customer-orders']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'apply-product-cache':
        source=r'''<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Facades\Cache;

class ProductCache
{
    public function get(int $id): ?array
    {
        $value = Cache::get("product:{$id}:details");

        return is_array($value) ? $value : null;
    }

    public function put(Product $product): void
    {
        $product->loadMissing('category');
        $attributes = $product->toArray();
        // Stock must never enter this cache, even if a caller already loaded it.
        unset($attributes['stock']);
        Cache::put("product:{$product->id}:details", $attributes, 300);
    }

    public function forget(int $id): void
    {
        Cache::forget("product:{$id}:details");
    }
}
'''
        (ROOT/'backend/my-project/app/Services/ProductCache.php').write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Http/Controllers/ProductController.php'
        source=path.read_text(encoding='utf-8').replace('use App\\Services\\ProductService;','use App\\Services\\ProductService;\nuse App\\Services\\ProductCache;')
        source=source.replace('private readonly ProductService $products\n','private readonly ProductService $products,\n        private readonly ProductCache $productCache\n')
        block=r'''        // Route binding remains authoritative for price, visibility and other product fields.
        // Only the category relation is reused from the non-stock cache snapshot.
        $cached = $this->productCache->get($product->id);
        if ($cached === null) {
            $product->load('category');
            $this->productCache->put($product);
        } else {
            $category = $cached['category'] ?? null;
            $product->setRelation('category', $category === null ? null :
                $product->category()->getRelated()->newFromBuilder($category, $product->getConnectionName()));
        }

'''
        source=source.replace("        try {\n            $stock =",block+"        try {\n            $stock =",1)
        source=source.replace("return new ProductResource($product->load('category'));","return new ProductResource($product);")
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Services/ProductService.php'
        source=path.read_text(encoding='utf-8').replace('class ProductService\n{','class ProductService\n{\n    public function __construct(private readonly ProductCache $cache) {}\n')
        source=source.replace('$product->update($data);','$product->update($data);\n        $this->cache->forget($id);')
        source=source.replace('$product->delete();','$product->delete();\n        $this->cache->forget($id);')
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/tests/Feature/PerformanceCachingTest.php'
        source=path.read_text(encoding='utf-8')
        method=r'''
    public function test_product_cache_excludes_stock_and_invalidates_after_writes(): void
    {
        $category = \App\Models\Category::create(['name' => 'Cache category']);
        $product = \App\Models\Product::create(['name' => 'Cache product', 'price' => '10.00',
            'category_id' => $category->id, 'is_active' => true]);
        $cache = app(\App\Services\ProductCache::class);
        $product->load('category')->setAttribute('stock', 99);
        $cache->put($product);
        $this->assertArrayNotHasKey('stock', $cache->get($product->id));
        app(\App\Services\ProductService::class)->update($product->id, ['price' => '12.34']);
        $this->assertNull($cache->get($product->id));

        $inventory = \Mockery::mock(\App\Services\InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->twice()->with($product->id)->andReturn(6, 4);
        $this->app->instance(\App\Services\InventoryGrpcClient::class, $inventory);
        $this->getJson('/api/products/'.$product->id)->assertOk()
            ->assertJsonPath('data.price', '12.34')->assertJsonPath('data.stock', 6);
        $this->getJson('/api/products/'.$product->id)->assertOk()->assertJsonPath('data.stock', 4);
        $this->assertArrayNotHasKey('stock', $cache->get($product->id));
        app(\App\Services\ProductService::class)->delete($product->id);
        $this->assertNull($cache->get($product->id));
        $this->getJson('/api/products/'.$product->id)->assertNotFound();
    }
'''
        head,tail=source.rsplit('\n}',1)
        path.write_text(head+'\n'+method+'\n}'+tail,encoding='utf-8')
    elif command == 'stage-product-cache':
        for args in [['apply-product-cache'],['sync'],['tests','after-product-cache'],['load','after-product-cache','product-detail']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'apply-etag':
        source=r'''<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConditionalGet
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($request->isMethod('GET') && $response instanceof JsonResponse && $response->getStatusCode() === 200) {
            // Compute after rendering: the representation still includes live stock.
            $response->setEtag('"'.sha1($response->getContent()).'"');
            $response->headers->set('Cache-Control', 'private, no-cache');
            $response->isNotModified($request);
        }

        return $response;
    }
}
'''
        (ROOT/'backend/my-project/app/Http/Middleware/ConditionalGet.php').write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/bootstrap/app.php'
        path.write_text(path.read_text(encoding='utf-8').replace("            'admin' => EnsureAdmin::class,", "            'admin' => EnsureAdmin::class,\n            'conditional.get' => \\App\\Http\\Middleware\\ConditionalGet::class,"),encoding='utf-8')
        path=ROOT/'backend/my-project/routes/api.php'
        source=path.read_text(encoding='utf-8')
        for action in ['index','show']:
            source=source.replace("[ProductController::class, '"+action+"']);","[ProductController::class, '"+action+"'])->middleware('conditional.get');")
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/tests/Feature/PerformanceCachingTest.php'
        source=path.read_text(encoding='utf-8')
        method=r'''
    public function test_etag_revalidates_live_stock_and_keeps_an_empty_304_body(): void
    {
        $category = \App\Models\Category::create(['name' => 'Conditional category']);
        $product = \App\Models\Product::create(['name' => 'Conditional product', 'price' => '1.00',
            'category_id' => $category->id, 'is_active' => true]);
        $inventory = \Mockery::mock(\App\Services\InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->times(3)->andReturn(9, 9, 8);
        $this->app->instance(\App\Services\InventoryGrpcClient::class, $inventory);
        $first = $this->getJson('/api/products/'.$product->id)->assertOk();
        $etag = $first->headers->get('ETag');
        $this->assertNotEmpty($etag);
        $this->assertStringContainsString('private', $first->headers->get('Cache-Control'));
        $this->assertStringContainsString('no-cache', $first->headers->get('Cache-Control'));
        $this->withHeader('If-None-Match', $etag)->getJson('/api/products/'.$product->id)
            ->assertStatus(304)->assertContent('');
        $last = $this->withHeader('If-None-Match', $etag)->getJson('/api/products/'.$product->id)
            ->assertOk()->assertJsonPath('data.stock', 8);
        $this->assertNotSame($etag, $last->headers->get('ETag'));
    }
'''
        head,tail=source.rsplit('\n}',1)
        path.write_text(head+'\n'+method+'\n}'+tail,encoding='utf-8')
    elif command == 'verify-etag':
        import urllib.error
        request=urllib.request.Request('http://localhost:8000/api/products/1',headers={'Accept':'application/json'})
        with urllib.request.urlopen(request) as response:
            first={'status':response.status,'etag':response.headers['ETag'],'cache_control':response.headers['Cache-Control'],'body_bytes':len(response.read())}
        request.add_header('If-None-Match',first['etag'])
        try:
            response=urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response=error
        second={'status':response.code,'body_bytes':len(response.read())}
        save('results/etag-check.json',json.dumps({'first':first,'second':second},indent=2))
        print(first,second)
        if second!={'status':304,'body_bytes':0}:raise RuntimeError('Conditional GET check failed')
    elif command == 'stage-etag':
        for args in [['apply-etag'],['sync'],['tests','after-etag'],['verify-etag'],['load','after-etag','products-list','product-detail']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'stage-caches':
        for stage in ['stage-pagination','stage-product-cache','stage-etag']:
            subprocess.run([sys.executable,__file__,stage],check=True)
    elif command == 'apply-refactor':
        source=r'''<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class DashboardCache
{
    public static function cacheKey(int $userId, bool $isAdmin): string
    {
        return $isAdmin ? 'dashboard:admin' : "dashboard:user:{$userId}";
    }

    public static function forgetCache(int $userId): void
    {
        Cache::forget(self::cacheKey($userId, false));
        self::forgetAdmin();
    }

    public static function forgetAdmin(): void
    {
        Cache::forget('dashboard:admin');
    }
}
'''
        (ROOT/'backend/my-project/app/Services/DashboardCache.php').write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Http/Controllers/DashboardController.php'
        source=path.read_text(encoding='utf-8').replace('use App\\Models\\User;','use App\\Models\\User;\nuse App\\Services\\DashboardCache;')
        start=source.index('    /**\n     * Drop cached dashboard')
        end=source.index('    private function buildStats',start)
        source=source[:start]+source[end:]
        source=source.replace('self::cacheKey(', 'DashboardCache::cacheKey(').replace('should call forgetCache()', 'should call DashboardCache::forgetCache()')
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Services/OrderService.php'
        source=path.read_text(encoding='utf-8').replace('use App\\Http\\Controllers\\DashboardController;\n','').replace('DashboardController::forgetCache','DashboardCache::forgetCache')
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/app/Services/ProductService.php'
        source=path.read_text(encoding='utf-8').replace('use Illuminate\\Contracts\\Pagination\\LengthAwarePaginator;\n','')
        start=source.index('    /**\n     * List products')
        end=source.index('    /**\n     * Find a single product',start)
        source=source[:start]+source[end:]
        source=source.replace('return Product::create($data);', '$product = Product::create($data);\n        DashboardCache::forgetAdmin();\n\n        return $product;')
        source=source.replace('$this->cache->forget($id);','$this->cache->forget($id);\n        DashboardCache::forgetAdmin();')
        path.write_text(source,encoding='utf-8')
        path=ROOT/'backend/my-project/tests/Feature/PerformanceCachingTest.php'
        source=path.read_text(encoding='utf-8')
        method=r'''
    public function test_product_management_refreshes_the_cached_admin_product_count(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $category = \App\Models\Category::create(['name' => 'Dashboard category']);
        $this->actingAs($admin, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_products', 0);
        $product = $this->postJson('/api/products', ['name' => 'Dashboard product', 'price' => '2.00',
            'category_id' => $category->id, 'is_active' => true])->assertCreated()->json('data');
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('data.total_products', 1);
        $this->deleteJson('/api/products/'.$product['id'])->assertOk();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('data.total_products', 0);
    }
'''
        head,tail=source.rsplit('\n}',1)
        path.write_text(head+'\n'+method+'\n}'+tail,encoding='utf-8')
    elif command == 'stage-refactor':
        for args in [['apply-refactor'],['sync'],['tests','after-refactor'],['load','after-refactor','dashboard','products-list']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'notification-benchmark':
        source=(ROOT/'perf/notification-timing.php').read_text(encoding='utf-8')
        result=docker('exec','-i','requirement3-tests','php',input=source)
        values=json.loads(result.stdout)
        save('results/notification-'+sys.argv[2]+'.json',json.dumps(values,indent=2))
        print(json.dumps(values,indent=2))
    elif command == 'apply-notifications':
        path=ROOT/'backend/my-project/app/Services/OrderService.php'
        source=path.read_text(encoding='utf-8').replace('$this->notificationService->createOrderNotification(', '$this->notifyAfterCommit(')
        method=r'''
    private function notifyAfterCommit(User $user, Order $order, string $type): void
    {
        DB::afterCommit(function () use ($user, $order, $type): void {
            try {
                $this->notificationService->createOrderNotification($user, $order, $type);
            } catch (\Throwable $exception) {
                // The order is committed. A secondary notification must not undo it.
                Log::error('Order notification failed after commit', [
                    'order_id' => $order->id,
                    'user_id' => $user->id,
                    'type' => $type,
                    'error' => $exception->getMessage(),
                ]);
            }
        });
    }
'''
        head,tail=source.rsplit('\n}',1)
        path.write_text(head+'\n'+method+'\n}'+tail,encoding='utf-8')
        old=r'''        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('createOrderNotification')
            ->once()
            ->andThrow(new RuntimeException('Simulated notification persistence failure'));
        $this->app->instance(NotificationService::class, $notifications);'''
        new=r'''        // Exercise an actual order-persistence failure; notifications now run after commit.
        Order::created(static function (): void {
            throw new RuntimeException('Simulated order persistence failure');
        });'''
        for name in ['Feature/ApiWorkflowTest.php','Integration/InventoryOrderIntegrationTest.php']:
            path=ROOT/'backend/my-project/tests'/name
            source=path.read_text(encoding='utf-8')
            if old not in source:raise RuntimeError('Compensation fixture not found in '+name)
            source=source.replace(old,new).replace("$this->assertSame('Simulated notification persistence failure'", "$this->assertSame('Simulated order persistence failure'")
            source=source.replace('use App\\Services\\NotificationService;\n','')
            if name.startswith('Integration/'):source=source.replace('use Mockery;\n','')
            path.write_text(source,encoding='utf-8')
        source=r'''<?php

namespace Tests\Integration;

use App\Models\Category;
use App\Models\InventoryOperation;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\InventoryGrpcClient;
use App\Services\NotificationService;
use App\Services\OrderService;
use App\Services\ReservationResult;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class NotificationAfterCommitTest extends TestCase
{
    public function test_notification_failure_keeps_the_committed_order_and_does_not_reserve_again(): void
    {
        $identity = DB::selectOne('SELECT DATABASE() AS name, CURRENT_USER() AS account');
        if ($identity->name !== 'ecommerce_test' || ! str_starts_with($identity->account, 'laravel_test@')) {
            throw new RuntimeException('Refusing to reset a non-test database.');
        }
        // Real commits are required here; RefreshDatabase's outer rollback would defer callbacks.
        Artisan::call('migrate:fresh', ['--force' => true]);
        $user = User::factory()->create();
        $category = Category::create(['name' => 'After-commit category']);
        $product = Product::create(['name' => 'After-commit product', 'price' => '3.00',
            'category_id' => $category->id, 'is_active' => true]);
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')->once()->andReturn(new ReservationResult(true, 'after-commit-reservation'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('createOrderNotification')->once()->andReturnUsing(function (): void {
            $this->assertSame(0, DB::transactionLevel());
            throw new RuntimeException('Notification storage unavailable');
        });
        $this->app->instance(NotificationService::class, $notifications);
        Log::spy();
        $key = (string) Str::uuid();
        $items = [['product_id' => $product->id, 'quantity' => 1]];
        $order = app(OrderService::class)->createOrder($user, $items, $key);
        $replayed = app(OrderService::class)->createOrder($user, $items, $key);
        $this->assertSame($order->id, $replayed->id);
        $this->assertSame(1, Order::count());
        $this->assertSame('completed', InventoryOperation::where('idempotency_key', $key)->value('status'));
        Log::shouldHaveReceived('error')->once()->withArgs(fn ($message, $context) =>
            $message === 'Order notification failed after commit' && $context['order_id'] === $order->id);
    }
}
'''
        (ROOT/'backend/my-project/tests/Integration/NotificationAfterCommitTest.php').write_text(source,encoding='utf-8')
    elif command == 'stage-notifications':
        for args in [['notification-benchmark','before'],['apply-notifications'],['sync'],['notification-benchmark','after'],['tests','after-notifications']]:
            subprocess.run([sys.executable,__file__,*args],check=True)
    elif command == 'persist-runtime':
        docker('tag','internet-applications-backend:latest','requirement3-runtime:redis-base')
        r=docker('build','-f',LINUX_ROOT+'/perf/Dockerfile.final-runtime','-t','internet-applications-backend:latest',LINUX_ROOT+'/backend/my-project',check=False)
        save('results/final-runtime-build.txt',r.stdout+r.stderr)
        if r.returncode:raise RuntimeError(redact(r.stdout+r.stderr)[-1800:])
        docker('tag','internet-applications-backend:latest','internet-applications-scheduler:latest')
        r=compose('up','-d','--no-build','--wait','--wait-timeout','180','backend','scheduler','inventory-service','redis')
        save('results/final-runtime-startup.txt',r.stdout+r.stderr)
        save('results/final-images.txt',compose('images').stdout)
        subprocess.run([sys.executable,__file__,'wait-health'],check=True)
        subprocess.run([sys.executable,__file__,'verify-etag'],check=True)
        print('Verified source persisted in backend and scheduler images',flush=True)
    elif command == 'summary':
        stages=['baseline','after-indexes','after-dashboard','after-redis','after-pagination','after-product-cache','after-etag','after-refactor']
        summaries={}
        lines=['Medians of three runs. Endpoint latency excludes setup login; request rate includes all HTTP requests. Units are milliseconds, requests/second, percent errors and received bytes. `not measured` means that scenario was not rerun at that step.','']
        for scenario in ['products-list','product-detail','customer-orders','dashboard']:
            summaries[scenario]={}
            for stage in stages:
                folder=OUT/('baseline' if stage=='baseline' else 'results/'+stage)
                paths=[folder/f'k6-{scenario}-{run}.json' for run in range(1,4)]
                if not all(p.exists() for p in paths): continue
                metrics=[json.loads(p.read_text(encoding='utf-8'))['metrics'] for p in paths]
                values={key:statistics.median(m['endpoint_duration'][key] for m in metrics) for key in ['p(50)','p(95)','p(99)']}
                values.update({'rps':statistics.median(m['http_reqs']['rate'] for m in metrics),
                    'error_percent':100*statistics.median(m['endpoint_errors']['value'] for m in metrics),
                    'received_bytes':statistics.median(m['data_received']['count'] for m in metrics),
                    'conditional_hits':statistics.median(m.get('conditional_hits',{}).get('count',0) for m in metrics)})
                summaries[scenario][stage]=values
            lines.extend([f'**{scenario}**','', '| Metric | '+' | '.join(stages)+' |','|---|'+'---|'*len(stages)])
            for key in ['p(50)','p(95)','p(99)','rps','error_percent','received_bytes','conditional_hits']:
                cells=[f"{summaries[scenario][stage][key]:.3f}" if stage in summaries[scenario] else 'not measured' for stage in stages]
                lines.append('| '+key+' | '+' | '.join(cells)+' |')
            lines.append('')
        save('results/summary.json',json.dumps(summaries,indent=2))
        report=ROOT/'REPORT.md'
        content=report.read_text(encoding='utf-8')
        start=content.index('## Measurements\n')+len('## Measurements\n')
        end=content.index('## EXPLAIN evidence',start)
        report.write_text(content[:start]+'\n'+'\n'.join(lines)+'\n'+content[end:],encoding='utf-8')
        print(json.dumps(summaries,indent=2))
