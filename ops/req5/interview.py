"""Live Req5 interview: 500 requests across an actual stop + real checkout and local SMTP."""
import concurrent.futures as futures
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys
from threading import Event, Lock
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request
from uuid import uuid4

import verify as v

N_ORDERS = 24
INBOX = 'http://127.0.0.1:8025'
FIXTURE = Path(__file__).with_name('interview-fixture.php').read_text(encoding='utf-8')
RUN = str(uuid4())
RECIPIENT = RUN + '@example.invalid'


def fixture(cid, action):
    result = v.command('docker','exec','-i','-e','REQ5_INTERVIEW_RUN='+RUN,'-e',
                       'REQ5_INTERVIEW_ACTION='+action,cid,'php',stdin=FIXTURE)
    return json.loads(result)


def edge_addresses(apis):
    ip_format = '{{(index .NetworkSettings.Networks "ecommerce-req5_edge").IPAddress}}'
    peers = {v.command('docker', 'inspect', '-f', ip_format, cid): name for name, cid in apis.items()}
    v.check(len(peers) == len(apis) and '' not in peers, 'Missing distinct API addresses')
    return peers


def start_healthy(cid):
    v.command('docker', 'start', cid)
    v.until(lambda: v.command('docker', 'inspect', '-f', '{{.State.Health.Status}}', cid) == 'healthy',
            90, 'API failed to return')


def sample_after_restore(apis):
    peers = edge_addresses(apis)
    v.until(lambda: {v.http('/up')[1] for _ in range(9)} == set(peers),
            30, 'Nginx did not rediscover the restored API')
    return v.sample(12, peers, concurrency=1)


def check_individual_replica(name, cid, apis):
    survivors = {ip: peer for ip, peer in edge_addresses(apis).items() if peer != name}
    try:
        v.command('docker', 'stop', '-t', '2', cid)
        v.check(v.command('docker', 'inspect', '-f', '{{.State.Running}}', cid) == 'false',
                name + ' did not stop')
        while_down = v.sample(6, survivors, path='/api/categories', concurrency=1)
    finally:
        start_healthy(cid)
    rejoined = sample_after_restore(apis)
    print('Individual stop:', name, 'catalog responses:', while_down, 'after restart:', rejoined, flush=True)
    return {'while_down_get_categories': while_down, 'after_restart_get_up': rejoined}


def live_load(first, name, peers):
    trigger, stopping, down = Event(), Event(), Event()
    lock = Lock()
    counts = Counter()
    failures = Counter()
    rows = []
    started = time.monotonic()
    marks = {}

    def stop_one():
        if not trigger.wait(60):
            raise RuntimeError('Load did not reach the stop threshold')
        marks['stop_requested_s'] = time.monotonic() - started
        stopping.set()
        v.command('docker','stop','-t','2',first)
        v.check(v.command('docker','inspect','-f','{{.State.Running}}',first)=='false','Replica still running')
        marks['stop_confirmed_s'] = time.monotonic() - started
        down.set()

    def one(i):
        # Keep the same pool active through the stop, and reserve a tail issued
        # only after Docker confirms it. No client retries or hidden exclusions.
        if i >= 440 and not down.wait(45):
            raise RuntimeError('Stop not confirmed during load')
        time.sleep(0.06)
        phase = 'down' if down.is_set() else 'transition' if stopping.is_set() else 'before'
        try:
            code, ip, _ = v.http('/up')
            who = peers.get(ip)
            ok = code == 200 and who is not None
            error = str(code) if code != 200 else 'unknown upstream'
        except (OSError, URLError) as exc:
            who, ok, error = None, False, type(exc).__name__
        with lock:
            if ok:
                counts[phase,who] += 1
            else:
                failures[error] += 1
            rows.append((phase,ok))
            if len(rows) == 100:
                trigger.set()

    try:
        with futures.ThreadPoolExecutor(max_workers=1) as control, futures.ThreadPoolExecutor(max_workers=12) as clients:
            stop_result = control.submit(stop_one)
            list(clients.map(one,range(500)))
            stop_result.result()
        results = {p:{w:c for (ph,w),c in counts.items() if ph==p}
                   for p in ('before','transition','down')}
        stats = {'attempted':len(rows),'http_200':sum(counts.values()),'errors':dict(failures),
                 'error_percent':100*sum(failures.values())/len(rows),'replicas':results,'stop_target':name,
                 'elapsed_s':round(time.monotonic()-started,3),**{k:round(val,3) for k,val in marks.items()}}
        print('500 requests / 12 clients:',json.dumps(stats),flush=True)
        v.check(len(rows)==500 and sum(failures.values())<=2,'More than 2 user-visible errors in 500 requests')
        v.check(set(results['before'].keys())==set(peers.values()),'Not all three served before the stop')
        v.check(set(results['down'].keys())==set(peers.values())-{name},'Unexpected distribution after confirmed stop')
        v.check(sum(results['transition'].values())>0,'No successful requests observed during the stop command')
        return stats
    finally:
        start_healthy(first)


def prepare_inventory(cid, product):
    # A new catalog product can share an ID with pre-seeded inventory rows.
    # Only add this run's stock; never overwrite reservations or other quantities.
    js = """
const mysql=require('mysql2/promise'),{config}=require('/app/dist/config.js');
(async()=>{ if(config.db.host!=='inventory-mysql'||config.db.database!=='inventory_db')throw Error('Wrong inventory');
const db=await mysql.createConnection(config.db);
try{await db.execute('INSERT INTO inventory_items(product_id,total_quantity,reserved_quantity) VALUES(?,?,0) ON DUPLICATE KEY UPDATE total_quantity=total_quantity+?', [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[3])]);}
finally{await db.end();}})().catch(()=>{process.exitCode=1;});
"""
    v.command('docker','exec','-i',cid,'node','-',str(product),str(N_ORDERS),stdin=js)


def inbox_counts():
    query = urlencode({'query':'to:'+RECIPIENT,'limit':100})
    with v.opener.open(INBOX+'/api/v1/search?'+query,timeout=8) as response:
        box = json.load(response)
    # Count distinct actual mailbox entries by order; never use Message-ID as a
    # unique count, since a duplicate may have the exact same Message-ID.
    ids, mail = set(), Counter()
    for msg in box['messages']:
        if not any(x['Address']==RECIPIENT for x in msg['To']):
            continue
        v.check(msg['ID'] not in ids,'Mailbox returned the same entry twice')
        ids.add(msg['ID'])
        m = re.fullmatch(r'Order #(\d+) confirmation',msg['Subject'])
        v.check(bool(m),'Unexpected email to the run-specific recipient')
        mail[int(m[1])] += 1
    return mail


def checkout(product, token):
    data = json.dumps({'items':[{'product_id':product,'quantity':1}]}).encode()
    req = Request(v.BASE+'/api/orders',data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json',
                  'Accept':'application/json','Idempotency-Key':str(uuid4())},method='POST')
    try:
        with v.opener.open(req,timeout=35) as response:
            v.check(response.status==201,'Order was not created')
            return json.load(response)['data']['id']
    except HTTPError as exc:
        body=exc.read()
        try: reason=json.loads(body).get('message','')[:180]
        except ValueError: reason=''
        raise RuntimeError(f'Checkout HTTP {exc.code}: {reason}') from None


def worker_events(workers,since,events):
    patt = re.compile(r'Order email processed.*?"event_id"\s*:\s*"([0-9a-f-]+)"')
    return {w:Counter(e for e in patt.findall(v.command('docker','logs','--since',since,cid)) if e in events)
            for w,cid in workers.items()}


def main():
    apis, workers = v.containers('api',3), v.containers('email-worker',3)
    gateway, = v.containers('gateway',1).values()
    mailbox, = v.containers('mailpit',1,[*v.COMPOSE,'-f',str(v.ROOT/'docker-compose.req5-interview.yml')]).values()
    inv, = v.containers('inventory-service',1).values()
    v.check(v.command('docker','port',gateway,'80/tcp')=='127.0.0.1:8015' and
            v.command('docker','port',mailbox,'8025/tcp')=='127.0.0.1:8025','Unexpected local port mapping')
    v.check(all(fixture(cid,'mailer') is True for cid in workers.values()),'Workers must point only to the local SMTP inbox')
    name, first = next(iter(apis.items()))
    initial = edge_addresses(apis)
    distribution = v.sample(9,initial,concurrency=1)
    print('Initial header distribution:',distribution,flush=True)
    stats = live_load(first,name,initial)
    after = sample_after_restore(apis)
    other_replicas = {n: check_individual_replica(n, cid, apis) for n, cid in apis.items() if n != name}
    user = fixture(first,'setup')
    prepare_inventory(inv,user['product'])
    since = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        orders = list(pool.map(lambda _:checkout(user['product'],user['token']),range(N_ORDERS)))
    expected = Counter(orders)
    v.check(len(expected)==N_ORDERS,'Duplicated order ID in HTTP responses')
    mapping = fixture(first,'events')
    v.check(set(map(int,mapping))==set(orders),'Missing outbox event for a checkout')
    events = set(mapping.values())
    v.check(len(events)==len(orders),'Duplicate outbox event identity')
    v.until(lambda:inbox_counts()==expected,90,'SMTP inbox did not receive exactly one copy per order')
    v.until(lambda: sum(worker_events(workers, since, events).values(), Counter()) == Counter(events),
            30, 'Worker logs did not confirm each original checkout once')
    logs = worker_events(workers,since,events)
    v.check(all(logs.values()) and sum(logs.values(),Counter())==Counter(events),
            'Not all 3 workers participated exactly once in the original batch')
    replay = fixture(first,'replay')
    target = Counter(events)
    target[replay] += 1
    v.until(lambda:sum(worker_events(workers,since,events).values(),Counter())==target,
            45,'Explicit redelivery was not handled')
    actual=inbox_counts()
    v.check(actual==expected,'Redelivery produced duplicate SMTP mail')
    report={'run':RUN,'utc':since,'url':v.BASE,'before':distribution,'load':stats,'after_restore':after,
            'initial_ip_to_container':initial,'individual_stops_other_replicas':other_replicas,
            'http_201_orders':len(orders),'worker_queue':'orders.email','initial_worker_jobs':{w:sum(c.values()) for w,c in logs.items()},
            'smtp_inbox':INBOX,'test_recipient':RECIPIENT,'distinct_mailbox_entries':sum(actual.values()),
            'orders':[{'id':o,'event_id':mapping[str(o)],'worker':next(w for w,c in logs.items() if mapping[str(o)] in c),
                       'received_copies':actual[o]} for o in sorted(orders)],
            'replayed_event':replay,'processed_again':True,'extra_mail_after_replay':0}
    path=v.ROOT/'docs'/'req5-interview-evidence.json'
    path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('Orders / SMTP copies:',len(orders),sum(actual.values()),'worker jobs:',report['initial_worker_jobs'],
          'duplicates after replay: 0','\nPASS:',path,flush=True)


if __name__=='__main__':
    try: main()
    except (RuntimeError,OSError,ValueError,TimeoutError) as e: sys.exit('FAIL: '+str(e))

