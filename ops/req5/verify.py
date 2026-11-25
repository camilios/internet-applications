"""Req5 acceptance test. Run under Python 3 where the local Docker CLI is available."""
import concurrent.futures as futures
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import build_opener, ProxyHandler, Request
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'ecommerce-req5'
BASE = 'http://127.0.0.1:8015'
RUN = str(uuid4())
PROBE = Path(__file__).with_name('probe.php').read_text(encoding='utf-8')
COMPOSE = ['docker', 'compose', '-p', PROJECT, '-f', str(ROOT / 'docker-compose.req5.yml')]
opener = build_opener(ProxyHandler({}))


def command(*args, stdin=None):
    p = subprocess.run(args, input=stdin, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, cwd=ROOT, timeout=90)
    if p.returncode:
        raise RuntimeError(f'{args[0]} {args[1]} failed: {p.stdout[-1000:]}')
    return p.stdout.strip()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def containers(service, count, compose=COMPOSE):
    ids = command(*compose, 'ps', '-q', service).splitlines()
    check(len(ids) == count, f'Expected {count} running {service} containers, found {len(ids)}')
    found = []
    for cid in ids:
        fmt = '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}} {{.State.Running}} {{.Name}}'
        project, actual, running, name = command('docker', 'inspect', '-f', fmt, cid).split()
        check((project, actual, running) == (PROJECT, service, 'true'), 'Container outside the isolated test')
        found.append((name.lstrip('/'), cid))
    return dict(sorted(found))


def probe(cid, action):
    raw = command('docker', 'exec', '-i', '-e', f'REQ5_ACTION={action}', '-e', f'REQ5_RUN={RUN}', cid, 'php', stdin=PROBE)
    try:
        return json.loads(raw)
    except ValueError:
        # Never print a token returned by the fixture.
        raise RuntimeError(f'Fixture {action} did not return JSON') from None


def http(path, token=None, method='GET'):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = Request(BASE + path, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        upstreams = response.headers.get('X-Req5-Upstream', '')
        # Nginx separates retry attempts with commas and internal redirects with " : ".
        address = upstreams.rsplit(' : ', 1)[-1].rsplit(',', 1)[-1].strip().split(':')[0]
        return response.status, address, response.read()


def sample(n, peers, path='/up', token=None, expected=200, user=None, concurrency=12):
    counts = Counter()
    def one(_):
        status, ip, body = http(path, token)
        check(status == expected and ip in peers, f'{path}: HTTP {status} via {ip}; expected {expected} via {list(peers.values())}')
        if user is not None:
            parsed = json.loads(body)
            check(parsed.get('data', parsed).get('id') == user, 'Different customer returned by /api/me')
        return peers[ip]
    with futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        counts.update(pool.map(one, range(n)))
    check(set(counts) == set(peers.values()), f'{path} did not reach all expected replicas: {counts}')
    return dict(sorted(counts.items()))


def until(fn, seconds, error):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if fn():
            return
        time.sleep(1)
    raise RuntimeError(error)


def main():
    apis, workers = containers('api', 3), containers('email-worker', 3)
    gateway, = containers('gateway', 1).values()
    ipfmt = '{{(index .NetworkSettings.Networks "ecommerce-req5_edge").IPAddress}}'
    peers = {command('docker','inspect','-f',ipfmt,cid): name for name,cid in apis.items()}
    check(len(peers) == 3 and '' not in peers, 'Missing distinct edge IPs')
    # Tie the loopback URL to the verified isolated gateway before sending any token.
    check(command('docker','port',gateway,'80/tcp') == '127.0.0.1:8015', 'Unexpected gateway binding')
    name, first = next(iter(apis.items()))
    alive = {ip:n for ip,n in peers.items() if n != name}
    survivor = next(cid for n,cid in apis.items() if n != name)
    since = datetime.now(timezone.utc).isoformat(timespec='seconds')
    proof = {'started_utc':since, 'run':RUN, 'health_path':'GET /up', 'concurrent_clients':12,
             'gateway_version':command('docker','exec',gateway,'nginx','-v'),
             'images':{svc:command('docker','inspect','-f','{{.Config.Image}}',cid) for svc,cid in
                       [('api',first),('email-worker',next(iter(workers.values()))),('gateway',gateway),('rabbitmq',next(iter(containers('rabbitmq',1).values())))]}}
    proof['before_stop_500'] = sample(500, peers)
    print('500 GET /up:', proof['before_stop_500'], flush=True)
    proof['catalog_before_stop'] = sample(6, peers, '/api/categories', concurrency=1)
    probe(first, 'write')
    try:
        states = {n:probe(cid, 'read') for n,cid in apis.items()}
        check(all(s['local_log'] == (n == name) and s['public_file'] and s['redis'] for n,s in states.items()), 'Shared/local state mismatch')
        # docker exec's stderr attaches to the exec session rather than the service log.
        # Worker processing below independently proves real service stderr aggregation.
        proof['state_written_on'] = name
        proof['state_visibility'] = states
    finally:
        probe(first, 'remove-markers')
    user = probe(first, 'user')
    proof['same_customer_before_stop'] = sample(6, peers, '/api/me', user['token'], user=user['id'], concurrency=1)
    try:
        command('docker','stop','-t','3',first)
        check(command('docker','inspect','-f','{{.State.Running}}',first) == 'false', 'Selected API did not stop')
        proof['stopped_api'] = name
        proof['while_stopped_120'] = sample(120, alive)
        proof['same_customer_while_stopped'] = sample(6, alive, '/api/me', user['token'], user=user['id'], concurrency=1)
        print('120 GET /up with one stopped:', proof['while_stopped_120'], flush=True)
    finally:
        command('docker','start',first)
        until(lambda: command('docker','inspect','-f','{{.State.Health.Status}}',first) == 'healthy', 90, 'Restored API unhealthy')
    # Let Docker DNS re-advertise the restored instance; discover its possibly new IP.
    peers = {command('docker','inspect','-f',ipfmt,cid):n for n,cid in apis.items()}
    def rejoined():
        return {http('/up')[1] for _ in range(9)} == set(peers)
    until(rejoined, 30, 'API did not rejoin Nginx')
    proof['after_restart'] = sample(30, peers)
    status, _, _ = http('/api/logout',user['token'],'POST')
    check(status == 200,'Logout failed')
    proof['revoked_token_401'] = sample(6, peers, '/api/me', user['token'], expected=401, concurrency=1)
    events = set(probe(survivor,'enqueue'))
    check(len(events) == 150,'Wrong number of distinct fixture events')
    until(lambda: set(probe(survivor,'delivered')) == events, 140, 'Not all 150 events recorded mock delivery')
    pattern = re.compile(r'Order email processed.*?"event_id"\s*:\s*"([0-9a-f-]+)"')
    per_worker = {n:[e for e in pattern.findall(command('docker','logs','--since',since,cid)) if e in events] for n,cid in workers.items()}
    combined = Counter(e for items in per_worker.values() for e in items)
    check(set(combined) == events and all(v == 1 for v in combined.values()) and all(per_worker.values()), 'Worker logs do not show each event once with all three participating')
    proof['worker_queue'] = 'orders.email'
    proof['unique_mock_deliveries'] = len(combined)
    proof['jobs_per_worker'] = {n:len(items) for n,items in per_worker.items()}
    path = ROOT/'docs'/'req5-evidence.json'
    path.write_text(json.dumps(proof,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print('150 deliveries:', proof['jobs_per_worker'], '\nPASS:', path, flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        sys.exit(f'FAIL: {exc}')
