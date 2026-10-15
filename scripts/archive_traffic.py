"""Copy durable traffic results to the traffic-history branch, then acknowledge.

This job cannot fetch traffic or change its budget. GitHub supplies a short-lived,
repository-scoped token through checkout; the Worker only receives an export key.
"""
import argparse
import csv
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request

SERVICE = 'https://bali-petrol-traffic.honeymooninbali.workers.dev'
FIELDS = ['recordId', 'stationId', 'stationName', 'requestedAtUTC', 'requestedAtWITA',
          'completedAtUTC', 'status', 'errorCode', 'checkedAtUTC', 'checkedAtWITA',
          'approachStatus', 'continuousSlowMetres', 'extent', 'coveredApproachMetres',
          'congestedRoadMetres', 'slowRoadMetres', 'coveredRoadMetres']
ID = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z_[a-f0-9-]{36}_[a-z0-9-]+$')


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Git archive operation failed; results remain queued on the server.')
    return result.stdout.strip()


def api(path, data=None):
    key = os.environ.get('ARCHIVE_EXPORT_KEY', '')
    if len(key) < 43:
        raise RuntimeError('Archive export key is not configured.')
    request = urllib.request.Request(SERVICE + '/internal/archive/' + path,
                                    headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                             'User-Agent': 'BaliPetrolMap-GitHubArchive/1.0'},
                                    data=None if data is None else json.dumps(data).encode())
    # No credential-bearing redirects. No provider requests or automatic retries.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise RuntimeError('Oversize archive export.')
    return json.loads(body)


def instant(text):
    parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Archive timestamps require a timezone.')
    return parsed


def csv_value(value):
    text = str(value) if value is not None else ''
    return "'" + text if text.startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else text


def save_page(repo, entries, catalogue):
    index_path = repo / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'schemaVersion': 1, 'stations': {}}
    affected = set()
    for entry in entries:
        payload = entry['payload']
        if hashlib.sha256(payload.encode()).hexdigest() != entry['sha256']:
            raise ValueError('Archive digest mismatch.')
        row = json.loads(payload)
        if row['id'] != entry['id'] or not ID.fullmatch(row['id']) or row['stationId'] not in catalogue or row.get('schemaVersion') != 1 or row.get('status') not in ('success', 'failed'):
            raise ValueError('Invalid archive record.')
        day = instant(row['requestedAtWita']).date().isoformat()
        instant(row['completedAt'])
        target = repo / 'history' / day / (row['id'] + '.json')
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_text() != payload:
            raise ValueError('Refusing to overwrite an immutable observation.')
        target.write_text(payload, encoding='utf-8')
        affected.add(day)
        previous = index['stations'].get(row['stationId'], {})
        if not previous.get('lastAttemptAt') or instant(row['completedAt']) >= instant(previous['lastAttemptAt']):
            previous.update(lastAttemptAt=row['completedAt'], lastAttemptStatus=row['status'], errorCode=row.get('errorCode'))
        if row['status'] == 'success':
            reading = row['reading']
            if reading.get('id') != row['stationId'] or reading.get('provider') != 'tomtom-orbis-v2':
                raise ValueError('Invalid station reading.')
            if not previous.get('checkedAt') or instant(reading['checkedAt']) >= instant(previous['checkedAt']):
                latest = repo / 'latest' / (row['stationId'] + '.json')
                latest.parent.mkdir(exist_ok=True)
                latest.write_text(json.dumps(reading, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
                previous.update(checkedAt=reading['checkedAt'], path='latest/' + row['stationId'] + '.json')
        index['stations'][row['stationId']] = previous
    if not entries:
        return
    index['updatedAt'] = max(index.get('updatedAt') or '', *(json.loads(e['payload'])['completedAt'] for e in entries))
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    for day in affected:
        # Rebuild a bounded daily CSV from immutable snapshots (max 1,000 checks/day).
        rows = []
        for path in sorted((repo / 'history' / day).glob('*.json')):
            event = json.loads(path.read_text(encoding='utf-8'))
            reading = event.get('reading', {})
            approach = reading.get('approach', {})
            route = next((r for r in approach.get('routes', []) if r['id'] == approach.get('selectedId')), {})
            checked = reading.get('checkedAt')
            rows.append(dict(zip(FIELDS, [event['id'], event['stationId'], catalogue[event['stationId']]['shortName'],
                       event['requestedAt'], event['requestedAtWita'], event['completedAt'], event['status'], event.get('errorCode', ''),
                       checked or '', instant(checked).astimezone(timezone(timedelta(hours=8))).isoformat() if checked else '',
                       approach.get('status', ''), route.get('continuousSlowMetres'), route.get('extent', ''), route.get('coveredMetres'),
                       reading.get('jamMetres'), reading.get('slowMetres'), reading.get('coveredMetres')])))
        with (repo / 'history' / day / 'readings.csv').open('w', newline='', encoding='utf-8') as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows({k: csv_value(v) for k, v in row.items()} for row in rows)


def run(repo, catalogue, send=api):
    if git(repo, 'branch', '--show-current') != 'traffic-history' or git(repo, 'status', '--porcelain'):
        raise RuntimeError('A clean traffic-history checkout is required.')
    archived = 0
    for _ in range(100):
        page = send('export')
        if page.get('schemaVersion') != 1 or not isinstance(page.get('records'), list) or len(page['records']) > 20:
            raise ValueError('Invalid export response.')
        entries = page['records']
        if not entries:
            break
        save_page(repo, entries, catalogue)
        if git(repo, 'status', '--porcelain'):
            git(repo, 'add', '--', 'history', 'latest', 'index.json') if (repo / 'latest').exists() else git(repo, 'add', '--', 'history', 'index.json')
            git(repo, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
                'commit', '-m', f'Archive {len(entries)} dated traffic checks')
            git(repo, 'push', 'origin', 'HEAD:refs/heads/traffic-history')
        commit = git(repo, 'rev-parse', 'HEAD')
        remote = git(repo, 'ls-remote', 'origin', 'refs/heads/traffic-history').split()[0]
        if remote != commit:
            raise RuntimeError('Archive commit is not confirmed on GitHub; results remain queued.')
        ack = send('ack', {'commit': commit, 'records': [{'id': e['id'], 'sha256': e['sha256']} for e in entries]})
        if not ack.get('ok'):
            raise RuntimeError('Archive acknowledgement failed; retrying later is safe.')
        archived += len(entries)
    print(f'{archived} traffic checks confirmed in GitHub. No traffic API calls made.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive-dir', type=Path, required=True)
    args = parser.parse_args()
    catalogue = json.loads((Path(__file__).resolve().parents[1] / 'dist/stations.json').read_text(encoding='utf-8'))
    run(args.archive_dir.resolve(), {s['id']: s for s in catalogue['stations']})
