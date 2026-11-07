"""Compare archived three-run k6 evidence with an optional fresh interview run."""
import argparse
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ('dashboard', 'products-list', 'product-detail', 'customer-orders')
LAST = {'dashboard': 'after-refactor', 'products-list': 'after-refactor',
        'product-detail': 'after-etag', 'customer-orders': 'after-pagination'}

def measurements(folder, scenario):
    paths = [folder / f'k6-{scenario}-{run}.json' for run in range(1, 4)]
    records = []
    for path in paths:
        metrics = json.loads(path.read_text(encoding='utf-8-sig'))['metrics']
        duration = metrics['endpoint_duration']
        records.append({key: float(duration[key]) for key in ('p(50)', 'p(95)', 'p(99)')} | {
            'rps': float(metrics['http_reqs']['rate']),
            'error_percent': 100 * float(metrics['endpoint_errors']['value']),
            'received_bytes': float(metrics['data_received']['count']),
        })
    return records

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', choices=SCENARIOS, default='dashboard')
    parser.add_argument('--live-dir', type=Path)
    args = parser.parse_args()
    evidence = ROOT / 'docs/performance'
    stages = [('ARCHIVED BEFORE', evidence / 'baseline'),
              ('ARCHIVED AFTER', evidence / 'results' / LAST[args.scenario])]
    if args.live_dir:
        stages.append(('LIVE CURRENT (AFTER)', args.live_dir.resolve()))
    print(f'\nScenario: {args.scenario} | milliseconds | median of THREE run-level percentiles')
    print('Historical after stage:', LAST[args.scenario])
    print('Archived BEFORE is saved evidence, NOT a fresh run of the old application.\n')
    aggregate = {}
    invalid = False
    for label, folder in stages:
        values = measurements(folder, args.scenario)
        print(label, '\n  source:', folder)
        print('  run    p50_ms    p95_ms    p99_ms    req/s   error%')
        for index, row in enumerate(values, 1):
            print(f"  {index:>3} {row['p(50)']:>9.3f} {row['p(95)']:>9.3f} {row['p(99)']:>9.3f} {row['rps']:>8.3f} {row['error_percent']:>8.3f}")
        summary = {key: median(row[key] for row in values) for key in values[0]}
        aggregate[label] = summary
        print(f"  MED {summary['p(50)']:>9.3f} {summary['p(95)']:>9.3f} {summary['p(99)']:>9.3f} {summary['rps']:>8.3f} {summary['error_percent']:>8.3f}")
        print(f"  median received bytes: {summary['received_bytes']:.0f}\n")
        invalid |= any(row['error_percent'] > 0 for row in values)
    if invalid:
        print('INVALID COMPARISON: endpoint errors occurred. Diagnose errors before claiming improvement.')
        return 2
    previous = aggregate['ARCHIVED BEFORE']['p(95)']
    archived = aggregate['ARCHIVED AFTER']['p(95)']
    if previous:
        print(f'Historical p95 reduction: {(previous - archived) / previous * 100:.2f}% (derived from saved runs).')
    if args.live_dir:
        print('Live current timings are new observations; they need not equal historical AFTER.')
        dataset_path = args.live_dir / 'dataset-counts.json'
        if dataset_path.exists():
            dataset = json.loads(dataset_path.read_text())
            expected = {'users': 5004, 'products': 15, 'orders': 300004, 'order_items': 749372}
            print('Current dataset:', dataset)
            if dataset != expected:
                print('DATASET DIFFERENT from recorded baseline. Do not claim a controlled before/after comparison.')
    print('This paced laptop workload is not a maximum-capacity test. No deployment threshold gate was used.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
