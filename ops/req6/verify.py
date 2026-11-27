"""Req6 live proof. Run in WSL after starting the isolated ecommerce-req6 stack."""
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import build_opener, ProxyHandler, Request
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'ops' / 'req5'))
from interview import FIXTURE, prepare_inventory

PROJECT = 'ecommerce-req6'
BASE = 'http://127.0.0.1:8016'
PROM = 'http://127.0.0.1:9096'
GRAFANA = 'http://127.0.0.1:3006'
client = build_opener(ProxyHandler({}))


def docker(*args, data=None):
    result = subprocess.run(['docker', *args], input=data, capture_output=True, text=True, timeout=100)
    if result.returncode:
        raise RuntimeError('Docker command failed: ' + args[0])
    return result.stdout


def containers(service, count):
    ids = docker('ps', '-q', '--filter', 'label=com.docker.compose.project='+PROJECT,
                 '--filter', 'label=com.docker.compose.service='+service).splitlines()
    if len(ids) != count:
        raise RuntimeError(f'Expected {count} running {PROJECT}/{service} containers, found {len(ids)}')
    return ids


def http(url, data=None, headers=None):
    req = Request(url, data=json.dumps(data).encode() if data is not None else None, headers=headers or {})
    try:
        with client.open(req, timeout=20) as reply:
            return reply.status, reply.headers, reply.read()
    except HTTPError as exc:
        return exc.code, exc.headers, exc.read()
    except OSError as exc:
        target = urlsplit(url)
        raise ConnectionError(f'{target.netloc}{target.path}: {exc}') from exc


def get_json(url):
    status, _, body = http(url)
    if status != 200:
        raise RuntimeError(f'HTTP {status} on monitoring endpoint')
    return json.loads(body)


def query(expr):
    result = get_json(PROM+'/api/v1/query?'+urlencode({'query':expr}))
    return result['data']['result']


def until(check, label, timeout=120):
    end = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < end:
        try:
            result = check()
            if result:
                return result
        except ConnectionError as exc:
            last_error = str(exc)
        time.sleep(2)
    raise RuntimeError('Timed out: '+label+(f' ({last_error})' if last_error else ''))


def notified(alert, state):
    points = query(f'order_alert_notifications_total{{alert="{alert}",status="{state}"}}')
    return int(float(points[0]['value'][1])) if points else 0


def monitoring():
    until(lambda:http(GRAFANA+'/api/health')[0]==200,'Grafana startup')
    until(lambda:http(PROM+'/-/ready')[0]==200,'Prometheus startup')
    dashboard = get_json(GRAFANA+'/api/dashboards/uid/req6-orders')['dashboard']
    targets = until(lambda: (points if len(points := query('up{job=~"gateway|rabbitmq"} == 1')) == 2 else None),
                    'both Prometheus targets')
    rules = get_json(GRAFANA+'/api/prometheus/grafana/api/v1/rules')['data']['groups']
    names = {r['name'] for group in rules for r in group['rules']}
    if not {'OrderEmailQueueHigh', 'HttpErrorsHigh'} <= names:
        raise RuntimeError('Expected both provisioned rules')
    return {'dashboard':dashboard['title'],'panels':len(dashboard['panels']),
            'targets':[p['metric']['job'] for p in targets],'rules':sorted(names)}


def run():
    monitored = monitoring()
    until(lambda:http(BASE+'/up')[0]==200,'gateway and Laravel startup')
    apis, workers = containers('api', 3), containers('email-worker', 3)
    inv, = containers('inventory-service', 1)
    publisher, = containers('outbox-publisher', 1)
    gateway, = containers('gateway', 1)
    containers('grafana', 1)
    containers('mailpit', 1)
    if docker('port',gateway,'80/tcp').strip() != '127.0.0.1:8016':
        raise RuntimeError('Unexpected gateway port')
    started = datetime.now(timezone.utc).isoformat(timespec='seconds')
    started_ms = int(time.time()*1000)
    tag = str(uuid4())
    def fixture(cid, action):
        return json.loads(docker('exec','-i','-e','REQ5_INTERVIEW_RUN='+tag,'-e',
                                 'REQ5_INTERVIEW_ACTION='+action,cid,'php',data=FIXTURE))
    if not all(fixture(cid, 'mailer') is True for cid in workers):
        raise RuntimeError('This demonstration requires local Mailpit delivery')
    user = fixture(apis[0], 'setup')
    prepare_inventory(inv, user['product'])
    marker = 'req6-test-'+tag
    trace = str(uuid4())
    def checkout(correlation):
        status, headers, body = http(BASE+'/api/orders',
            {'items':[{'product_id':user['product'], 'quantity':1}]},
            {'Authorization':'Bearer '+user['token'], 'Content-Type':'application/json', 'Accept':'application/json',
             'Idempotency-Key':str(uuid4()), 'X-Correlation-ID':correlation})
        if status != 201 or headers.get('X-Correlation-ID') != correlation:
            raise RuntimeError(f'Checkout or correlation header failed (HTTP {status})')
        return json.loads(body)['data']['id']
    # Deliberately synthetic values. Neither the URL query nor the credentials may appear in container logs.
    http(BASE+'/api/login?probe='+marker, {'email':'req6@example.invalid','password':marker},
         {'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+marker,
          'Cookie':'probe='+marker,'X-Correlation-ID':marker})
    report = {'started_utc':started,'monitoring':monitored,'correlation_id':trace}
    def totals():
        return {p['metric']['replica']:int(float(p['value'][1]))
                for p in query('sum by(replica) (order_http_requests_total{status="200",replica!="gateway"})')}
    # Seed a baseline for each series before applying load, including on a fresh stack.
    def read_replica():
        status, headers, _ = http(BASE+'/up')
        if status != 200:
            raise RuntimeError(f'Load request returned HTTP {status}')
        address = headers.get('X-Req5-Upstream', '').split(',')[-1].strip()
        if not address.endswith(':8000'):
            raise RuntimeError('Missing API address on a successful response')
        return address[:-5]

    initial = totals()
    warmup = Counter(read_replica() for _ in range(9))
    if len(warmup) != 3:
        raise RuntimeError('Warmup did not reach three API replicas')
    def baseline():
        current = totals()
        return current if all(current.get(ip,0) >= initial.get(ip,0)+n for ip,n in warmup.items()) else None
    before = until(baseline, 'replica counters after warmup')
    remaining = 500
    client_counts = Counter()
    dashboard_query = 'sum by (replica) (order_http_requests_total)'
    with ThreadPoolExecutor(max_workers=10) as pool:
        while remaining:
            batch = min(25, remaining)
            client_counts.update(pool.map(lambda _: read_replica(), range(batch)))
            remaining -= batch
            if remaining == 250:
                proxy = GRAFANA+'/api/datasources/proxy/uid/req6-prom/api/v1/query?'
                sample = get_json(proxy+urlencode({'query':dashboard_query}))['data']['result']
                report['grafana_during_load'] = {p['metric']['replica']:float(p['value'][1]) for p in sample}
                if len(report['grafana_during_load']) < 3:
                    raise RuntimeError('Grafana did not return all three replica series during load')
            time.sleep(.45)
    if sum(client_counts.values()) != 500 or set(client_counts) != set(warmup):
        raise RuntimeError('Expected 500 successful load requests')
    report['client_http_200'] = dict(client_counts)
    def load_seen():
        current = totals()
        delta = {ip:current.get(ip,0)-before[ip] for ip in client_counts}
        return delta if all(delta[ip] >= n for ip,n in client_counts.items()) else None
    report['load_200_by_replica'] = until(load_seen,'Prometheus load per replica')
    points = until(lambda:query('histogram_quantile(0.95,sum by(le)(rate(order_http_duration_seconds_bucket[1m])))'),
                   'response-time histogram')
    report['p95_seconds'] = float(points[0]['value'][1])
    if not (0 <= report['p95_seconds'] < float('inf')):
        raise RuntimeError('No finite latency sample')
    print('Load shown on Grafana:', report['load_200_by_replica'], flush=True)
    queue_alert, error_alert = 'OrderEmailQueueHigh', 'HttpErrorsHigh'
    q0, e0 = notified(queue_alert,'firing'), notified(error_alert,'firing')
    qr0, er0 = notified(queue_alert,'resolved'), notified(error_alert,'resolved')
    try:
        docker('stop', '-t', '4', *workers)
        report['order_id'] = checkout(trace)
        for _ in range(5):
            checkout(str(uuid4()))
        ready = until(lambda:query('rabbitmq_queue_messages_ready{queue="orders.email"} >= 6'), 'six waiting emails')
        report['queue_ready'] = int(float(ready[0]['value'][1]))
        until(lambda:notified(queue_alert,'firing') > q0, 'queue alert delivered')
        print('Queue alert delivered; ready messages:', report['queue_ready'], flush=True)
    finally:
        docker('start', *workers)
    def traced():
        matches = []
        for service, ids in [('api',apis),('inventory-service',[inv]),('outbox-publisher',[publisher]),('email-worker',workers)]:
            for cid in ids:
                logs = subprocess.run(['docker','logs','--since',started,cid],capture_output=True,text=True,check=True)
                raw = logs.stdout + logs.stderr
                if marker in raw or user['token'] in raw:
                    raise RuntimeError('Sensitive value found in '+service+' logs')
                for line in raw.splitlines():
                    if trace not in line: continue
                    row = json.loads(line)
                    if row.get('correlation_id')==trace:
                        matches.append({'service':service, **row})
        messages={r['message'] for r in matches}
        needed={'HTTP request started','Inventory RPC finished','HTTP request finished','Outbox publication confirmed',
                'Order confirmation accepted by delivery transport','Order email processed'}
        if not needed <= messages:
            return None
        events = [r for r in matches if r['message'] in {'Outbox publication confirmed','Order email processed'}]
        if len({r['event_id'] for r in events}) != 1 or any(r['order_id'] != report['order_id'] for r in events):
            raise RuntimeError('Trace reached a different order or event')
        return sorted(matches,key=lambda r:datetime.fromisoformat(r['time'].replace('Z','+00:00')))
    report['trace'] = until(traced,'complete correlation across services')
    gateway_logs = subprocess.run(['docker','logs','--since',started,gateway],capture_output=True,text=True,check=True)
    if any(value in gateway_logs.stdout + gateway_logs.stderr for value in (marker, user['token'])):
        raise RuntimeError('Sensitive value found in gateway log')
    inbox = get_json('http://127.0.0.1:8026/api/v1/search?'+urlencode({'query':'to:'+tag+'@example.invalid'}))
    if sum(m['Subject']==f"Order #{report['order_id']} confirmation" for m in inbox['messages']) != 1:
        raise RuntimeError('Expected exactly one confirmation for the traced order')
    report['smtp_copies_for_order'] = 1
    print('Traced order',report['order_id'],'from HTTP through inventory and SMTP:',trace,flush=True)
    try:
        docker('stop','-t','2',*apis)
        errors = 0
        deadline = time.monotonic()+100
        while notified(error_alert,'firing') <= e0 and time.monotonic() < deadline:
            errors += http(BASE+'/up')[0] >= 500
            time.sleep(.4)
        if errors < 3 or notified(error_alert,'firing') <= e0:
            raise RuntimeError('HTTP error alert did not reach its receiver')
        report['observed_http_5xx'] = errors
        print('HTTP error alert delivered; observed 5xx:',errors,flush=True)
    finally:
        docker('start', *apis)
    until(lambda:http(BASE+'/up')[0]==200,'API recovery')
    until(lambda:notified(queue_alert,'resolved') > qr0 and notified(error_alert,'resolved') > er0,
          'both recovery notifications',150)
    report['delivered_alerts']=[queue_alert,error_alert]
    report['recovered_alerts']=[queue_alert,error_alert]
    report['secret_probe']='absent from checked logs'
    ended_ms = int(time.time()*1000)
    report['dashboard_url'] = f'{GRAFANA}/d/req6-orders/orders?from={started_ms}&to={ended_ms}'
    path = ROOT/'docs'/'req6-evidence.json'
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('PASS',path,'correlation_id',trace,flush=True)

if __name__=='__main__':
    try:
        if sys.argv[1:] == ['--monitoring-only']: print(json.dumps(monitoring(),indent=2))
        elif not sys.argv[1:]: run()
        else: sys.exit('Usage: verify.py [--monitoring-only]')
    except (RuntimeError,URLError,OSError,ValueError,subprocess.SubprocessError) as exc:
        sys.exit('FAIL: '+str(exc))
