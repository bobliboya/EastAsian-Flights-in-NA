"""Generate the current weekly network from two administrator CSV tables."""
import argparse
import csv
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src/data'
ADMIN = ROOT / 'admin'
ROUTE_FIELDS = ['airline', 'origin', 'destination', 'note']
FLIGHT_FIELDS = ['airline', 'flight_number', 'origin', 'destination', 'aircraft',
                 'weekly_flights', 'weekdays', 'note']


def normalize_aircraft(value):
    if not value.strip():
        return ''
    codes = []
    for model in value.split('/'):
        code = model.strip().upper()
        code = re.sub(r'^BOEING\s+', 'B', code)
        code = re.sub(r'^AIRBUS\s+', 'A', code)
        if not re.fullmatch(r'[AB]\d{2}[0-9A-Z]', code):
            raise ValueError(f'Invalid aircraft code: {model}; use B747, B77W, A359, A35K, etc.')
        if code not in codes:
            codes.append(code)
    return ' / '.join(codes)


def read_csv(name, fields):
    """Read the editable tables, allowing UTF-8 BOM from Excel exports."""
    with (ADMIN / name).open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != fields:
            raise ValueError(f'{name}: expected columns {fields}')
        rows = []
        for number, row in enumerate(reader, 2):
            if None in row or any(v is None for v in row.values()):
                raise ValueError(f'{name}:{number}: incorrect column count')
            if any(row.values()):
                rows.append({k: v.strip() for k, v in row.items()})
        return rows


def build():
    """Convert CSV values to website records without changing files."""
    routes = [dict(r, id=f"{r['airline']}:{r['origin']}-{r['destination']}")
              for r in read_csv('routes.csv', ROUTE_FIELDS)]
    flights = []
    for row in read_csv('timetables.csv', FLIGHT_FIELDS):
        label = f"{row['airline']}{row['flight_number']} {row['origin']}-{row['destination']}"
        number = row['flight_number']
        if not number.isascii() or not number.isdigit() or len(number) > 4:
            raise ValueError(f'{label}: flight number must contain 1–4 digits')
        weekdays = row['weekdays']
        if not weekdays or any(d not in '1234567' for d in weekdays) or len(set(weekdays)) != len(weekdays):
            raise ValueError(f'{label}: weekdays must contain unique digits 1–7 (e.g. 135)')
        if not row['weekly_flights'].isascii() or not row['weekly_flights'].isdigit():
            raise ValueError(f'{label}: weekly_flights must be an integer')
        weekly = int(row['weekly_flights'])
        if weekly != len(weekdays):
            raise ValueError(f'{label}: weekly_flights must match the number of weekdays')
        if not row['note']:
            raise ValueError(f'{label}: add a note describing how current the information is')
        flights.append(dict(row, aircraft=normalize_aircraft(row['aircraft']), flight_number=number.zfill(4), weekly_flights=weekly,
                            weekdays=''.join(sorted(weekdays))))
    return {'routes.json': routes, 'flights.json': flights}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check', 'apply'])
    args = parser.parse_args()
    output = build()
    artifacts = ROOT / 'artifacts'
    artifacts.mkdir(exist_ok=True)
    # Validate a full temporary copy before replacing either published JSON file.
    with tempfile.TemporaryDirectory(prefix='flight-data-', dir=artifacts) as folder:
        stage = Path(folder)
        for name in ['airports.json', 'airlines.json']:
            (stage / name).write_bytes((DATA / name).read_bytes())
        for name, value in output.items():
            (stage / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        result = subprocess.run(['node', str(ROOT / 'scripts/validate-data.mjs')],
            env=dict(os.environ, FLIGHT_DATA_DIR=str(stage)), capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise ValueError(result.stderr.strip())
        print(result.stdout.strip())
        if args.command == 'apply':
            for name in output:
                os.replace(stage / name, DATA / name)
            print('Updated current network JSON. Commit and publish CSV and JSON together.')
        else:
            print('CSV validation passed; website JSON unchanged.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as exc:
        raise SystemExit(f'ERROR: {exc}') from exc
