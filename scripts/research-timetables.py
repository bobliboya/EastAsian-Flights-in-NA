"""Collect dated, in-scope passenger schedule facts; does not modify app data.

Run explicitly with network access. Cached evidence supports offline review/import.
"""

import concurrent.futures
import json
import re
import time
import sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATE = "2026-10-20"
AUDIT = "--audit" in sys.argv
OUT = ROOT / "artifacts" / ("timetable-audit-cache" if AUDIT else "timetable-research")
OUT.mkdir(parents=True, exist_ok=True)
routes = json.loads((ROOT / "src/data/routes.json").read_text(encoding="utf-8"))
names = {
    a["iata_code"]: a["name_en"].replace(" ", "_")
    for a in json.loads((ROOT / "src/data/airlines.json").read_text(encoding="utf-8"))
}
names["TW"] = "T_way_Air"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def weekdays(raw):
    if raw == "Daily":
        return "1234567"
    found = set()
    for part in raw.split(","):
        if "-" in part:
            a, b = part.split("-")
            found.update(range(DAYS.index(a) + 1, DAYS.index(b) + 2))
        else:
            found.add(DAYS.index(part) + 1)
    return "".join(str(n) for n in sorted(found))


def collect(task):
    airline, origin, destination = task
    path = OUT / f"{airline}-{origin}-{destination}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    url = f"https://info.flightmapper.net/route/{names[airline]}_{airline}_{origin}_{destination}"
    result = dict(
        airline=airline,
        origin=origin,
        destination=destination,
        url=url,
        checked_on=DATE,
        rows=[],
    )
    if AUDIT:
        result["schedule_rows"] = []
    try:
        response = requests.get(url, timeout=35)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table")
        if not table:
            raise ValueError("No schedule table")
        for row in table.select("tr.odd, tr.even"):
            text = row.get_text(" ", strip=True)
            if "Non-stop" not in text or re.search(
                r"cargo|freighter|codeshare|operated by|charter", text, re.I
            ):
                continue
            airports = [
                a.get("href", "").split("/")[-1]
                for a in row.select('a[href^="/airport/"]')
            ]
            if airports != [origin, destination]:
                continue
            number = re.search(rf"\b{airline} (\d+)\b", text)
            plane = re.search(r"Non-stop (.+?) \(([A-Z0-9]{3})\)", text)
            days = re.match(
                r"(Daily|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[A-Za-z,\-]*)\s", text
            )
            if not (number and plane and days):
                continue
            dates = re.search(
                r"Effective (\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})", text
            )
            start = re.search(r"Effective from (\d{4}-\d{2}-\d{2})", text)
            end = re.search(r"Valid until (\d{4}-\d{2}-\d{2})", text)
            first = dates[1] if dates else start[1] if start else None
            last = dates[2] if dates else end[1] if end else None
            # Undated and future/expired rows do not establish today's timetable.
            if not (dates or start or end):
                continue
            fact = dict(
                flight_number=number[1].zfill(4),
                aircraft_name=plane[1],
                aircraft_iata=plane[2],
                days=weekdays(days[1]),
                source_valid_from=first,
                source_valid_to=last,
            )
            if AUDIT and not (
                (first and first > "2026-10-25") or (last and last < "2026-10-19")
            ):
                result["schedule_rows"].append(fact)
            if (first and first > DATE) or (last and last < DATE):
                continue
            result["rows"].append(fact)
        result["rows"] = list(
            {json.dumps(r, sort_keys=True): r for r in result["rows"]}.values()
        )
    except Exception as error:
        result["error"] = str(error)
    path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    time.sleep(0.7)
    return result


if __name__ == "__main__":
    tasks = [
        (r["airline"], a, b)
        for r in routes
        if r["service_status"] != "announced"
        and not (r.get("service_end") and r["service_end"] < DATE)
        for a, b in [(r["origin"], r["destination"]), (r["destination"], r["origin"])]
    ]
    if AUDIT:
        prior = json.loads(
            (ROOT / "scripts/data/timetable-research-20261020.json").read_text(
                encoding="utf-8"
            )
        )
        tasks = [(p["airline"], p["origin"], p["destination"]) for p in prior]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5 if AUDIT else 3) as pool:
        for i, result in enumerate(pool.map(collect, tasks), 1):
            results.append(result)
            if i % 20 == 0:
                print(
                    f'{i}/{len(tasks)} pages; {sum(len(r["rows"]) for r in results)} current passenger rows',
                    flush=True,
                )
    print(
        f'Done: {sum(bool(r["rows"]) for r in results)} directions, {sum(bool(r.get("error")) for r in results)} errors',
        flush=True,
    )
    evidence_path = (
        ROOT
        / "scripts/data"
        / (
            "timetable-audit-evidence-20261020.json"
            if AUDIT
            else "timetable-research-20261020.json"
        )
    )
    evidence_path.parent.mkdir(exist_ok=True)
    evidence_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
