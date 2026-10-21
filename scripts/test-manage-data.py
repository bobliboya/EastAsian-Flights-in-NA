"""Run with: python scripts/test-manage-data.py"""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manage_data', Path(__file__).with_name('manage-data.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class MaintenanceTests(unittest.TestCase):
    def test_aircraft_normalization_preserves_specific_models(self):
        self.assertEqual(m.normalize_aircraft('Boeing 747'), 'B747')
        self.assertEqual(m.normalize_aircraft('Boeing 767'), 'B767')
        self.assertEqual(m.normalize_aircraft('a359 / B77W / a359'), 'A359 / B77W')
        self.assertEqual(m.normalize_aircraft('A35K / B78X'), 'A35K / B78X')
        self.assertEqual(m.normalize_aircraft(''), '')
        with self.assertRaisesRegex(ValueError, 'Invalid aircraft'):
            m.normalize_aircraft('Boeing unknown')

    def changed_rows(self, **changes):
        original = m.read_csv
        def read(name, fields):
            rows = original(name, fields)
            if name == 'timetables.csv':
                rows[0].update(changes)
            return rows
        return patch.object(m, 'read_csv', read)

    def test_weekly_records_and_repeatable_generation(self):
        output = m.build()
        self.assertEqual(len(output['flights.json']), len(m.read_csv('timetables.csv', m.FLIGHT_FIELDS)))
        for flight in output['flights.json']:
            self.assertEqual(set(flight), set(m.FLIGHT_FIELDS))
            self.assertEqual(flight['weekly_flights'], len(flight['weekdays']))
        self.assertEqual(output, m.build())

    def test_mismatched_count_rejected(self):
        with self.changed_rows(weekly_flights='2', weekdays='135'):
            with self.assertRaisesRegex(ValueError, 'must match'):
                m.build()

    def test_duplicate_and_invalid_weekdays_rejected(self):
        for days in ['113', '18', '']:
            with self.changed_rows(weekdays=days):
                with self.assertRaisesRegex(ValueError, 'unique digits'):
                    m.build()

    def test_note_and_number(self):
        with self.changed_rows(note=''):
            with self.assertRaisesRegex(ValueError, 'note'):
                m.build()
        with self.changed_rows(flight_number='7'):
            self.assertEqual(m.build()['flights.json'][0]['flight_number'], '0007')

    def test_bad_reference_does_not_write_output(self):
        names = ['routes.json', 'flights.json']
        before = {name: (m.DATA / name).read_bytes() for name in names}
        with self.changed_rows(origin='XXX'), patch('sys.argv', ['manage-data.py', 'apply']):
            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError, 'Invalid endpoints'):
                    m.main()
        self.assertEqual(before, {name: (m.DATA / name).read_bytes() for name in names})


if __name__ == '__main__':
    unittest.main()
