"""Capture final read-only runtime evidence and the complete working-tree state."""
import json
import re
import subprocess
import urllib.request
from requirement3 import ROOT, OUT, compose, counts, docker, save

request = urllib.request.Request('http://localhost:8000/api/products/1', method='OPTIONS', headers={
    'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type,if-none-match'})
with urllib.request.urlopen(request, timeout=30) as response:
    cors = {'status': response.status, 'headers': dict(response.headers)}
save('results/cors-preflight.json', json.dumps(cors, indent=2))
health = {}
for url in ['http://localhost:8000/up', 'http://localhost:5173']:
    with urllib.request.urlopen(url, timeout=30) as response:
        health[url] = response.status
save('results/final-health.json', json.dumps(health, indent=2))
save('results/final-counts.txt', counts())
save('results/final-runtime.txt', compose('version').stdout + compose('ps').stdout +
     docker('info', '--format', '{{.OperatingSystem}} CPUs={{.NCPU}} RAM={{.MemTotal}}').stdout)

for name, args in [('git-status-end.txt', ['status', '--short']),
                   ('git-diff-end.txt', ['diff', '--stat']),
                   ('git-diff-check.txt', ['diff', '--check']),
                   ('inventory-source-diff.txt', ['diff', '--', 'inventory-service']),
                   ('changed-files.txt', ['diff', '--name-only'])]:
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, encoding='utf-8')
    save('results/' + name, result.stdout + result.stderr)
    if name == 'git-diff-check.txt' and result.returncode:
        raise RuntimeError('git diff --check failed: see raw output')
result = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT,
                        capture_output=True, encoding='utf-8')
save('results/new-files.txt', result.stdout)

decoder = json.JSONDecoder()
plans = {}
for stage, filename in [('before', 'baseline/explain-before.txt'),
                         ('after', 'results/after-indexes/explain-after.txt')]:
    content = (OUT / filename).read_text(encoding='utf-8')
    rows = []
    cursor = 0
    for _ in range(6):
        query_end = content.index('\n', cursor)
        query = content[cursor:query_end].strip()
        cursor = query_end + 1
        traditional, length = decoder.raw_decode(content[cursor:])
        cursor += length
        while content[cursor].isspace(): cursor += 1
        analysis, length = decoder.raw_decode(content[cursor:])
        cursor += length
        while cursor < len(content) and content[cursor].isspace(): cursor += 1
        plan = analysis[0]['EXPLAIN']
        actual = re.findall(r'actual time=([\d.]+)\.\.([\d.]+) rows=([\d.]+) loops=(\d+)', plan)
        rows.append({'query': query, 'type': traditional[0]['type'], 'key': traditional[0]['key'],
                     'estimated_rows': traditional[0]['rows'], 'leaf_actual_rows': actual[-1][2],
                     'leaf_loops': actual[-1][3], 'root_completion_ms': actual[0][1]})
    plans[stage] = rows
save('results/explain-summary.json', json.dumps(plans, indent=2))
print(json.dumps({'health': health, 'cors': cors, 'plans': plans}, indent=2))
