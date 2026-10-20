"""Audit every stored record against dates, catalog relations and live evidence.

No old record is promoted to current evidence. The report distinguishes retained
archives, published future plans, current index checks and official corrections.
Run research-timetables.py --audit first for independent network evidence.
"""

import json
from pathlib import Path
from datetime import date, timedelta
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src/data"


def read(path):
    if not path.exists():
        raise SystemExit(
            f"Missing evidence: {path.name}. Run research-timetables.py --audit first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


flights = read(DATA / "flights.json")
catalog = read(DATA / "catalog-metadata.json")
routes = read(DATA / "routes.json")
live = read(ROOT / "scripts/data/timetable-audit-evidence-20261020.json")
pages = {(p["airline"], p["origin"], p["destination"]): p for p in live}
review = read(ROOT / "scripts/data/timetable-supplemental-review-20261020.json")
days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
batch = catalog["timetable_snapshot"]["import_batch"]
plans = catalog["timetable_snapshot"]["seasonal_plan_import_batch"]
entries = []
errors = []
review_date = catalog["timetable_snapshot"]["checked_on"]
refreshed = {
    (f["airline"], f["origin"], f["destination"])
    for f in flights
    if f.get("import_batch") == batch
}
for f in flights:
    if f.get("import_batch") in [batch, plans]:
        continue
    route = next(
        (
            r
            for r in routes
            if r["airline"] == f["airline"]
            and {r["origin"], r["destination"]} == {f["origin"], f["destination"]}
        ),
        None,
    )
    if (
        route
        and route["service_status"] != "announced"
        and (not f.get("valid_from") or f["valid_from"] <= review_date)
        and (not f.get("valid_to") or f["valid_to"] >= review_date)
    ):
        assert (
            f["airline"],
            f["origin"],
            f["destination"],
        ) in refreshed, "Archive would leak into current display"
for index, f in enumerate(flights):
    key = f"{f['airline']}{f['flight_number']}:{f['origin']}-{f['destination']}:{f.get('valid_from','undated')}"
    checks = []
    assert all(f[d] in ["0", "1"] for d in days), key
    assert isinstance(f["flight_number"], str) and f["flight_number"].isdigit(), key
    ids = f.get("source_ids", [])
    assert all(s in catalog["sources"] for s in ids), key
    if f.get("import_batch") in [batch, plans]:
        assert f["operating_periods"] and f["aircraft"] and ids, key
        expected = {}
        current = date.fromisoformat(f["display_from"])
        while current <= date.fromisoformat(f["display_to"]):
            stamp = current.isoformat()
            for p in f["operating_periods"]:
                if (
                    (not p.get("valid_from") or p["valid_from"] <= stamp)
                    and (not p.get("valid_to") or stamp <= p["valid_to"])
                    and str(current.isoweekday()) in p["weekdays"]
                ):
                    expected.setdefault(stamp, set()).add(p["aircraft"])
            current += timedelta(days=1)
        actual = {d["date"]: set(d["aircraft"].split(" / ")) for d in f["departures"]}
        assert actual == expected and len(actual) == len(f["departures"]), key
        checks += [
            "calendar_dates",
            "aircraft_by_date",
            "date_deduplication",
            "source_references",
        ]
        if f["import_batch"] == plans:
            assert f["valid_from"] > catalog["timetable_snapshot"]["checked_on"], key
            classification = "future_seasonal_plan"
        else:
            page = pages.get((f["airline"], f["origin"], f["destination"]))
            found = [
                r
                for r in (page or {}).get("rows", [])
                if r["flight_number"] == f["flight_number"]
            ]
            official = any(catalog["sources"][s]["kind"] == "primary" for s in ids)
            supplemental = next(
                (
                    r
                    for r in review["supplemental"]
                    if (r["airline"], r["flight_number"], r["origin"], r["destination"])
                    == (f["airline"], f["flight_number"], f["origin"], f["destination"])
                ),
                None,
            )
            if f.get("verification_note"):
                classification = "source_conflict_explicitly_flagged"
                assert f.get("schedule_conflict") or f.get("aircraft_conflicts"), key
            elif supplemental:
                assert [d["date"] for d in f["departures"]] == [
                    d
                    for d in supplemental["dates"]
                    if f["display_from"] <= d <= f["display_to"]
                ], key
                assert f["aircraft"] == supplemental["aircraft"], key
                classification = "supplemental_source_rechecked"
            elif official:
                classification = "official_source_priority"
            elif found:
                for r in f.get("source_schedule_variants", []):
                    if r not in found:
                        errors.append(
                            dict(
                                flight=key,
                                issue="Source facts changed since collection",
                                previous=r,
                                live=found,
                            )
                        )
                classification = "live_index_rechecked"
            elif not any(s.startswith("fm_") for s in ids):
                classification = "supplemental_source_rechecked"
            else:
                classification = "unresolved_live_source"
                errors.append(
                    dict(
                        flight=key,
                        issue="Current flight not independently reproduced",
                        source_error=(page or {}).get("error"),
                    )
                )
            checks.append("operating_route")
            route = next(
                (
                    r
                    for r in routes
                    if r["airline"] == f["airline"]
                    and {r["origin"], r["destination"]}
                    == {f["origin"], f["destination"]}
                ),
                None,
            )
            assert route and route["service_status"] != "announced", key
    else:
        classification = (
            "dated_archive_superseded"
            if f.get("valid_from")
            else "undated_archive_unverified"
        )
        checks = ["string_identifiers", "weekday_encoding", "archive_preservation"]
    entries.append(
        dict(
            index=index,
            flight=key,
            classification=classification,
            checks=checks,
            source_ids=ids,
            departure_count=len(f.get("departures", [])),
            operating_period_count=len(f.get("operating_periods", [])),
        )
    )
report = dict(
    checked_on=catalog["timetable_snapshot"]["checked_on"],
    records=len(entries),
    classifications=dict(Counter(e["classification"] for e in entries)),
    source_pages=len(live),
    source_page_errors=[
        dict(
            airline=p["airline"],
            origin=p["origin"],
            destination=p["destination"],
            error=p["error"],
        )
        for p in live
        if p.get("error")
    ],
    unresolved=errors,
    records_audited=entries,
)
out = ROOT / "scripts/data/timetable-audit-20261020.json"
out.write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
labels = {
    "official_source_priority": "采用已核对的官方资料",
    "live_index_rechecked": "重新读取索引后相符",
    "source_conflict_explicitly_flagged": "来源有分歧，界面明确标为待核实",
    "supplemental_source_rechecked": "采用已核对的补充来源",
    "future_seasonal_plan": "下一季计划，未计入当前班表",
    "dated_archive_superseded": "此前有日期的归档，已由新批次替代",
    "undated_archive_unverified": "无日期历史归档，未作为当前事实核实",
    "unresolved_live_source": "当前来源尚有待解决项",
}
lines = [
    "# 航班全量复查报告",
    "",
    f"核查日：{report['checked_on']}。逐条检查 {len(entries)} 条记录，重新读取 {len(live)} 个方向的来源。",
    "",
    "| 分类 | 记录数 |",
    "| --- | ---: |",
]
lines += [f"| {labels.get(k,k)} | {v} |" for k, v in report["classifications"].items()]
lines += [
    "",
    f"未解决的当前记录差异：{len(errors)}。",
    "",
    "修正：按来源分段生成实际出发日期，取消把星期数量直接显示成每周班次；保留各分段机型；延续未结束的星期分段；补齐加航10月24日相邻分段及10月23日AC15。",
    "",
    "历史资料只检查标识、归档和关联，不宣称其航班号、机型及班期在当前仍有效。第三方索引无页面的长荣IAD、首航TAO–YVR仍按已核对的官方／补充来源记录。",
    "",
    "来源分歧：CI23／CI24 部分日期的机型、MF806 的周五／周六班期。界面明确标注待航司核实，不能把这些记录视为已确认。JX9 补齐10月24日相邻分段。",
    "",
    "逐条结果与引用：`../scripts/data/timetable-audit-20261020.json`。",
]
report_path = ROOT / "artifacts/timetable-audit-report.md"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(
    json.dumps(
        {k: v for k, v in report.items() if k != "records_audited"},
        ensure_ascii=False,
        indent=2,
    )
)
if errors:
    raise SystemExit("Unresolved records require review; see audit report")
