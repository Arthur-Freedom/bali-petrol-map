"""Inspect/apply project-level Google cost limits; never read or print API keys.

Uses the already authenticated gcloud account. Run without --apply to inspect.
These limits cover the two services in project chessinbali, including calls that
bypass the app. Lowering a quota can temporarily make the service unavailable.
"""
import argparse, json, shutil, subprocess, time, urllib.error, urllib.request

PROJECT = '372855816307'
LIMITS = {
    'routes.googleapis.com': {
        ('compute_routes_requests', '1/d/{project}'): 50,
        ('compute_routes_requests', '1/min/{project}'): 50,
        ('compute_route_matrix_elements', '1/d/{project}'): 0,
    },
    'maps-backend.googleapis.com': {
        ('billable_default', '1/d/{project}'): 100,
        ('billable_default', '1/min/{project}'): 10,
        ('3d_billable_default', '1/d/{project}'): 0,
        ('MapsGroundingWidget', '1/d/{project}'): 0,
    },
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    gcloud = shutil.which('gcloud.cmd') or shutil.which('gcloud')
    if not gcloud:
        from pathlib import Path
        gcloud = str(Path.home() / 'AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd')
    result = subprocess.run([gcloud, 'auth', 'print-access-token', '--quiet'], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Sign in to gcloud before managing quotas.')
    token = result.stdout.strip()

    def request(path, method='GET', body=None):
        req = urllib.request.Request('https://serviceusage.googleapis.com/v1beta1/' + path,
            method=method, data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = json.loads(error.read()).get('error', {}).get('message', '')
            raise RuntimeError(f'Quota request failed ({error.code}): {detail}') from None

    for service, wanted in LIMITS.items():
        data = request(f'projects/{PROJECT}/services/{service}/consumerQuotaMetrics?view=FULL&pageSize=200')
        found = set()
        for metric in data.get('metrics', []):
            for limit in metric.get('consumerQuotaLimits', []):
                key = (metric['metric'].split('/')[-1], limit['unit'])
                if key not in wanted:
                    continue
                found.add(key)
                bucket = next(b for b in limit['quotaBuckets'] if not b.get('dimensions'))
                desired = wanted[key]
                # Google's protobuf JSON omits numeric fields whose value is zero.
                effective = int(bucket.get('effectiveLimit', 0))
                if args.apply and effective != desired:
                    if effective < desired:
                        raise RuntimeError('Refusing to loosen an existing stricter limit: ' + limit['name'])
                    override = bucket.get('consumerOverride')
                    # The requested reductions deliberately exceed Google's 10% safety threshold.
                    path = (override['name'] if override else limit['name'] + '/consumerOverrides')
                    path += '?force=true'
                    operation = request(path, 'PATCH' if override else 'POST', {'overrideValue': str(desired)})
                    for _ in range(20):
                        if operation.get('done'):
                            break
                        time.sleep(1)
                        operation = request(operation['name'])
                    if not operation.get('done') or operation.get('error'):
                        raise RuntimeError('Quota update did not finish successfully: ' + json.dumps(operation))
                print(json.dumps({'service': service, 'metric': key[0], 'unit': key[1],
                    'previous': effective, 'target': desired, 'applied': args.apply}))
        if found != set(wanted):
            raise RuntimeError('Missing expected quotas: ' + str(set(wanted) - found))

if __name__ == '__main__':
    main()
