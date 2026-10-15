import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('archive_traffic.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'archive'
        self.repo.mkdir()
        self.catalogue = {'bypass-27': {'shortName': 'Bypass 54.803.27'}}

    def tearDown(self):
        self.temp.cleanup()

    def entry(self, hour=0, status='success', **changes):
        time = f'2026-10-15T{hour:02}:00:00.000Z'
        ident = time.replace(':', '-') + '_12345678-1234-1234-1234-123456789012_bypass-27'
        row = {'schemaVersion': 1, 'id': ident, 'stationId': 'bypass-27', 'status': status,
               'requestedAt': time, 'requestedAtWita': f'2026-10-15T{hour+8:02}:00:00.000+08:00', 'completedAt': time}
        if status == 'success':
            row['reading'] = {'id': 'bypass-27', 'provider': 'tomtom-orbis-v2', 'checkedAt': time, 'jamMetres': 80,
                              'slowMetres': 20, 'coveredMetres': 800, 'approach': {'status': 'partial', 'selectedId': 'in',
                              'routes': [{'id': 'in', 'continuousSlowMetres': 80, 'extent': 'gap', 'coveredMetres': 195}]}}
        else:
            row['errorCode'] = 'provider_unavailable'
        row.update(changes)
        payload = json.dumps(row, separators=(',', ':'))
        return {'id': ident, 'payload': payload, 'sha256': hashlib.sha256(payload.encode()).hexdigest()}

    def test_dates_failures_csv_and_idempotence(self):
        first, failure = self.entry(), self.entry(1, 'failed')
        archive.save_page(self.repo, [first, failure], self.catalogue)
        archive.save_page(self.repo, [first, failure], self.catalogue)
        index = json.loads((self.repo / 'index.json').read_text())['stations']['bypass-27']
        self.assertEqual(index['checkedAt'], '2026-10-15T00:00:00.000Z')
        self.assertEqual(index['lastAttemptStatus'], 'failed')
        files = list((self.repo / 'history' / '2026-10-15').glob('*.json'))
        self.assertEqual(len(files), 2)
        with (self.repo / 'history' / '2026-10-15' / 'readings.csv').open(encoding='utf-8') as source:
            rows = list(archive.csv.DictReader(source))
        self.assertEqual(rows[0]['continuousSlowMetres'], '80')
        self.assertEqual(rows[1]['continuousSlowMetres'], '')
        self.assertEqual(rows[0]['checkedAtWITA'], '2026-10-15T08:00:00+08:00')

    def test_out_of_order_page_cannot_replace_newer_success(self):
        archive.save_page(self.repo, [self.entry(2)], self.catalogue)
        archive.save_page(self.repo, [self.entry(1)], self.catalogue)
        self.assertEqual(json.loads((self.repo / 'latest/bypass-27.json').read_text())['checkedAt'], '2026-10-15T02:00:00.000Z')

    def test_bad_digest_path_and_overwrite_fail(self):
        item = self.entry()
        with self.assertRaises(ValueError):
            archive.save_page(self.repo, [{**item, 'sha256': 'a' * 64}], self.catalogue)
        with self.assertRaises(ValueError):
            archive.save_page(self.repo, [self.entry(stationId='../bad')], self.catalogue)
        archive.save_page(self.repo, [item], self.catalogue)
        with self.assertRaises(ValueError):
            archive.save_page(self.repo, [self.entry(errorCode='changed')], self.catalogue)

    def test_push_precedes_ack_and_retry_does_not_duplicate(self):
        remote = self.root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(remote)], check=True, capture_output=True)
        archive.git(self.repo, 'init', '-b', 'traffic-history')
        archive.git(self.repo, 'remote', 'add', 'origin', str(remote))
        (self.repo / 'README.md').write_text('Synthetic archive test\n')
        archive.git(self.repo, 'add', 'README.md')
        archive.git(self.repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initialize')
        archive.git(self.repo, 'push', '-u', 'origin', 'traffic-history')
        item = self.entry()
        def lost_ack(path, data=None):
            if path == 'export':
                return {'schemaVersion': 1, 'records': [item]}
            self.assertEqual(archive.git(self.repo, 'ls-remote', 'origin', 'refs/heads/traffic-history').split()[0], data['commit'])
            raise ConnectionError('Simulated lost acknowledgement')
        with self.assertRaises(ConnectionError):
            archive.run(self.repo, self.catalogue, lost_ack)
        committed = archive.git(self.repo, 'rev-parse', 'HEAD')
        acknowledged = []
        def retry(path, data=None):
            if path == 'export':
                return {'schemaVersion': 1, 'records': [] if acknowledged else [item]}
            acknowledged.append(data)
            return {'ok': True}
        archive.run(self.repo, self.catalogue, retry)
        self.assertEqual(archive.git(self.repo, 'rev-parse', 'HEAD'), committed)
        self.assertEqual(acknowledged[0]['records'][0]['sha256'], item['sha256'])


if __name__ == '__main__':
    unittest.main()
