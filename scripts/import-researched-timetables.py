"""Offline, idempotent import of reviewed 2026-10-20 timetable evidence.

Existing records are retained verbatim. Airport/airline qualification dates remain
unchanged; reviewed route corrections have their own check dates. Re-run
research-timetables.py separately to collect source facts.
"""

import json
from collections import defaultdict
from pathlib import Path
from datetime import date, timedelta

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src/data"
DATE = "2026-10-20"
BATCH = "passenger_snapshot_20261020"
PLAN_BATCH = "seasonal_plans_20261020"
HORIZON = "2026-10-24"  # Review before the winter timetable change.
DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


catalog = read(DATA / "catalog-metadata.json")
routes = read(DATA / "routes.json")
flights = [
    f
    for f in read(DATA / "flights.json")
    if f.get("import_batch") not in [BATCH, PLAN_BATCH]
]
new = []
sources = catalog["sources"]


def source(key, title, url, kind="primary"):
    sources[key] = dict(title=title, url=url, kind=kind, accessed_on=DATE)


source(
    "aa_ord_nrt_2027",
    "American official summer 2027 launch: ORD to NRT March 19",
    "https://news.aa.com/news/news-details/2026/Summer-gets-sweeter-with-new-global-routes-from-American-Airlines-NET-RTS-08/",
)
source(
    "ua_ord_nrt_2026",
    "Narita airport: United Narita–Chicago starts October 25, 2026",
    "https://www.narita-airport.jp/en/company/media-center/news/20260518_unitedairlines_en/",
)
source(
    "ua_kix_lax_2027",
    "United official new Los Angeles–Osaka service starts March 27, 2027",
    "https://united.mediaroom.com/2026-08-25-United-Adds-10-International-Cities-for-2027-Largest-Expansion-in-Airlines-History",
)
for r in routes:
    if r["id"] in ["UA:NRT-ORD", "AA:NRT-ORD"]:
        sid, start = (
            ("ua_ord_nrt_2026", "2026-10-25")
            if r["airline"] == "UA"
            else ("aa_ord_nrt_2027", "2027-03-20")
        )
        r.update(
            service_status="announced",
            service_start=start,
            checked_on=DATE,
            source_ids=[sid],
        )
        if r["airline"] == "AA":
            r["note"] = "官方公布ORD始发于2027-03-19开航；成田始发为次日。"
    if r["id"] == "UA:KIX-LAX":
        r.update(
            service_status="announced",
            service_start="2027-03-28",
            checked_on=DATE,
            source_ids=["ua_kix_lax_2027"],
            note="洛杉矶始发于2027-03-27开航；关西始发为次日。",
        )
catalog["route_snapshot"]["checked_on"] = DATE
catalog["route_snapshot"]["airport_pairs"] = len(
    {
        (r["origin"], r["destination"])
        for r in routes
        if r["service_status"] != "announced"
    }
)


def record(
    airline, origin, destination, number, days, aircraft, ids, until=HORIZON, **extra
):
    return dict(
        airline=airline,
        flight_number=number.zfill(4),
        origin=origin,
        destination=destination,
        dept_time="",
        arri_time="",
        aircraft=aircraft,
        **{day: "1" if str(i + 1) in days else "0" for i, day in enumerate(DAYS)},
        valid_from=DATE,
        valid_to=min(until, HORIZON),
        checked_on=DATE,
        source_ids=ids,
        import_batch=BATCH,
        **extra,
    )


aircraft_codes = {
    "77W": "B77W",
    "77L": "B77L",
    "777": "B777",
    "772": "B772",
    "773": "B773",
    "788": "B788",
    "789": "B789",
    "781": "B78X",
    "787": "B787",
    "359": "A359",
    "351": "A35K",
    "388": "A388",
    "333": "A333",
    "332": "A332",
    "339": "A339",
    "330": "A330",
    "763": "B763",
    "764": "B764",
    "74H": "B748",
    "744": "B744",
}
evidence = read(ROOT / "scripts/data/timetable-research-20261020.json")
for page in evidence:
    if not page["rows"]:
        continue
    sid = f"fm_{page['airline']}_{page['origin']}_{page['destination']}_20261020"
    source(
        sid,
        f"FlightMapper dated passenger schedule: {page['airline']} {page['origin']}–{page['destination']}",
        page["url"],
        "schedule_index",
    )
    grouped = defaultdict(list)
    for row in page["rows"]:
        grouped[row["flight_number"]].append(row)
    for number, rows in sorted(grouped.items()):
        days = "".join(sorted(set("".join(r["days"] for r in rows))))
        aircraft = " / ".join(
            sorted(
                {
                    aircraft_codes.get(r["aircraft_iata"], r["aircraft_name"])
                    for r in rows
                }
            )
        )
        # One weekday variant ending must not truncate another variant's service.
        until = max(r["source_valid_to"] or HORIZON for r in rows)
        new.append(
            record(
                page["airline"],
                page["origin"],
                page["destination"],
                number,
                days,
                aircraft,
                [sid],
                until,
                source_schedule_variants=rows,
            )
        )

# Prefer current official operating tables over schedule-index rows.
source(
    "ac_operating_20261020",
    "Air Canada Asia operating schedule, checked 2026-10-20",
    "https://vacations.aircanada.com/en/travel-info/where-we-fly/files/EN-ASIA-Asia.pdf",
)
official_ac = [
    ("YUL", "NRT", "5", "12345", "B77W", "23"),
    ("NRT", "YUL", "6", "123456", "B77W", "24"),
    ("YYZ", "KIX", "59", "24", "B789", "22"),
    ("KIX", "YYZ", "60", "35", "B789", "23"),
    ("YYZ", "ICN", "61", "12345", "B789", "23"),
    ("ICN", "YYZ", "62", "123456", "B789", "24"),
    ("YYZ", "PVG", "27", "135", "B789", "23"),
    ("PVG", "YYZ", "28", "1246", "B789", "24"),
    ("YYZ", "HND", "1", "12345", "B77W", "23"),
    ("HND", "YYZ", "2", "123456", "B77W", "24"),
    ("YYZ", "NRT", "9", "12345", "B789", "23"),
    ("NRT", "YYZ", "10", "123456", "B789", "24"),
    ("YVR", "PEK", "29", "12345", "B789", "23"),
    ("PEK", "YVR", "30", "123456", "B789", "24"),
    ("YVR", "HKG", "7", "12345", "B789", "23"),
    ("HKG", "YVR", "8", "123456", "B789", "24"),
    ("YVR", "HKG", "15", "5", "B789", "23"),
    ("YVR", "KIX", "23", "135", "B789", "23"),
    ("KIX", "YVR", "24", "1246", "B789", "24"),
    ("YVR", "ICN", "63", "12345", "B789", "23"),
    ("ICN", "YVR", "64", "123456", "B789", "24"),
    ("YVR", "PVG", "25", "12345", "B789", "23"),
    ("PVG", "YVR", "26", "123456", "B789", "24"),
    ("YVR", "SIN", "19", "245", "B789", "23"),
    ("SIN", "YVR", "20", "246", "B789", "24"),
    ("YVR", "NRT", "3", "12345", "B789", "23"),
    ("NRT", "YVR", "4", "123456", "B789", "24"),
]
ac_directions = {(a, b) for a, b, *_ in official_ac}
new = [
    f
    for f in new
    if not (f["airline"] == "AC" and (f["origin"], f["destination"]) in ac_directions)
]
# The official AC table lists ICN–YUL only for the next summer season.
# Keep the seasonal route in the catalog, but do not revive it using index rows.
new = [
    f
    for f in new
    if not (f["airline"] == "AC" and {f["origin"], f["destination"]} == {"ICN", "YUL"})
]
for a, b, n, d, p, end in official_ac:
    start = (
        "2026-10-23"
        if n == "15"
        else (
            "2026-10-20"
            if n in ["59", "19", "20"]
            else "2026-10-21" if n == "60" else "2026-10-19"
        )
    )
    new.append(
        record(
            "AC",
            a,
            b,
            n,
            d,
            p,
            ["ac_operating_20261020"],
            f"2026-10-{end}",
            operating_periods=[
                dict(
                    valid_from=start, valid_to=f"2026-10-{end}", weekdays=d, aircraft=p
                )
            ],
        )
    )

# Adjacent official rows on Oct 24 are part of the same review window. In
# particular AC7 continues on Saturday; AC9 changes equipment on Saturday.
ac_oct24 = {
    "1": "B77W",
    "9": "B77W",
    "29": "B789",
    "7": "B789",
    "63": "B789",
    "25": "B789",
    "3": "B789",
}
for f in new:
    if (
        f["airline"] == "AC"
        and str(int(f["flight_number"])) in ac_oct24
        and f.get("operating_periods")
    ):
        plane = ac_oct24[str(int(f["flight_number"]))]
        f["operating_periods"].append(
            dict(valid_from=HORIZON, valid_to=HORIZON, weekdays="6", aircraft=plane)
        )
        f["valid_to"] = HORIZON
        f["SAT"] = "1"
        f["aircraft"] = " / ".join(
            sorted({p["aircraft"] for p in f["operating_periods"]})
        )

source(
    "eva_northamerica_20261020",
    "EVA official North America aircraft information, including BR08/07",
    "https://flights.evaair.com/zh-tw/northamerica",
)
source(
    "eva_iad_schedule_20261020",
    "EVA official Taipei–Washington operating days, flight numbers and Boeing 787-9",
    "https://www.evaair.com/en-sg/about-eva-air/news/news-releases/2026-02-11-evaair-new-route-taipei-to-washington-dc.html",
)
source(
    "jx_phx_schedule_20261020",
    "STARLUX Phoenix official timetable and A350-1000 aircraft",
    "https://www.starlux-airlines.com/flights/zh-tw/flights-from-taipei-to-phoenix",
)
source(
    "jal_aircraft_20261020",
    "JAL US/Canada official summer operating table and A350-1000 aircraft",
    "https://www.jal.co.jp/flights/en-us/flight-resumption",
)
source(
    "ana_honu_20261020",
    "ANA A380 Honolulu official dated operating table",
    "https://www.ana.co.jp/en/jp/international/area/hawaii/a380/",
)
source(
    "zg_hnl_20261020",
    "ZIPAIR official summer Honolulu operating table (image inspected)",
    "https://www.zipair.net/ja/notification/375",
)
source(
    "zg_fleet_20261020",
    "ZIPAIR official fleet: Boeing 787-8 passenger aircraft",
    "https://corporate.zipair.net/ja/company/",
)
source(
    "zg_iah_20261020",
    "TRAICY: ZIPAIR September–October 2026 Houston operating table",
    "https://www.traicy.com/posts/20260309364867/",
    "schedule_report",
)
source(
    "zg_yvr_20261020",
    "ZIPAIR official Vancouver Tuesday addition through October 20 (image inspected)",
    "https://www.zipair.net/ja/notification/372",
)
source(
    "zg_yvr_base_20261020",
    "ZIPAIR Vancouver base weekdays and 2026 summer fifth weekly flight",
    "https://sky-budget.com/2026/02/08/zipair-increase-nrt-yvr-2026summer/",
    "schedule_report",
)
for destination, outbound, inbound, days, sid, until in [
    ("HNL", "2", "1", "247", "zg_hnl_20261020", HORIZON),
    ("IAH", "16", "15", "1356", "zg_iah_20261020", HORIZON),
    ("YVR", "22", "21", "12357", "zg_yvr_20261020", DATE),
]:
    new = [
        f
        for f in new
        if not (
            f["airline"] == "ZG"
            and {f["origin"], f["destination"]} == {"NRT", destination}
        )
    ]
    ids = [sid, "zg_fleet_20261020"] + (
        ["zg_yvr_base_20261020"] if destination == "YVR" else []
    )
    new += [
        record("ZG", "NRT", destination, outbound, days, "B788", ids, until),
        record("ZG", destination, "NRT", inbound, days, "B788", ids, until),
    ]
source(
    "hu730_current_20261020",
    "HU730 current Boston–Beijing nonstop Boeing 787-9 operating table",
    "https://www.flight.info/HU730",
    "schedule_index",
)
new = [
    f
    for f in new
    if not (f["airline"] == "HU" and f["origin"] == "BOS" and f["destination"] == "PEK")
]
new.append(
    record(
        "HU",
        "BOS",
        "PEK",
        "730",
        "357",
        "B789",
        ["hu730_current_20261020", "piao_nonstop_202609"],
    )
)
source(
    "jd_tao_yvr_aircraft_20261020",
    "Capital Airlines Qingdao–Vancouver JD471/472 passenger route and A330-200",
    "https://www.directflights.com/TAO-YVR",
    "schedule_index",
)
source(
    "jd_yvr_tao_aircraft_20261020",
    "Capital Airlines Vancouver–Qingdao JD472 passenger route and A330-200",
    "https://www.directflights.com/YVR-TAO",
    "schedule_index",
)
source(
    "piao_canada_table_20261020",
    "票帝中加班表图片：JD471/472周五，经停青岛上下客；10月2日起恢复",
    "https://piao.tips/wp-content/uploads/2026/09/wx_fmtpngampfromappmsg-141.png",
    "schedule_reference",
)
new = [
    f
    for f in new
    if not (f["airline"] == "JD" and {f["origin"], f["destination"]} == {"TAO", "YVR"})
]
new += [
    record(
        "JD",
        "TAO",
        "YVR",
        "471",
        "5",
        "A332",
        ["piao_canada_table_20261020", "jd_tao_yvr_aircraft_20261020"],
    ),
    record(
        "JD",
        "YVR",
        "TAO",
        "472",
        "5",
        "A332",
        ["piao_canada_table_20261020", "jd_yvr_tao_aircraft_20261020"],
    ),
]
new = [
    f
    for f in new
    if not (f["airline"] == "BR" and {f["origin"], f["destination"]} == {"TPE", "IAD"})
]
new += [
    record("BR", "TPE", "IAD", "4", "1356", "B789", ["eva_iad_schedule_20261020"]),
    record("BR", "IAD", "TPE", "3", "2467", "B789", ["eva_iad_schedule_20261020"]),
]
for f in new:
    if f["airline"] == "BR" and (
        f["flight_number"] in ["0007", "0008"]
        or {f["origin"], f["destination"]} == {"TPE", "DFW"}
    ):
        f["aircraft"] = "B789"
        f["source_ids"].append("eva_northamerica_20261020")
        f["aircraft_note"] = (
            "机型按航司官方资料更新；第三方索引的旧机型仅保留在来源变体中。"
        )
    if f["airline"] == "JX" and {f["origin"], f["destination"]} == {"TPE", "PHX"}:
        f["aircraft"] = "A35K"
        f["source_ids"].append("jx_phx_schedule_20261020")
    if f["airline"] == "JL" and f["flight_number"] in [
        "0003",
        "0004",
        "0005",
        "0006",
        "0011",
        "0012",
        "0015",
        "0016",
    ]:
        f["aircraft"] = "A35K"
        f["source_ids"].append("jal_aircraft_20261020")
    if f["airline"] == "NH" and f["flight_number"] in ["0181", "0182", "0183", "0184"]:
        f["aircraft"] = "A388"
        f["source_ids"].append("ana_honu_20261020")

new.sort(
    key=lambda f: (f["airline"], f["origin"], f["destination"], f["flight_number"])
)
assert len(
    {(f["airline"], f["origin"], f["destination"], f["flight_number"]) for f in new}
) == len(new)
source(
    "zg_sjc_20261020",
    "ZIPAIR official 2026–27 San Jose seasonal periods and weekdays (image inspected)",
    "https://www.zipair.net/ja/notification/428",
)
plans = []


def plan(airline, a, b, n, days, plane, ids, start, end):
    f = record(airline, a, b, n, days, plane, ids)
    f.update(
        valid_from=start,
        valid_to=end,
        import_batch=PLAN_BATCH,
        service_status="seasonal_planned",
    )
    plans.append(f)


plan(
    "AC",
    "YUL",
    "ICN",
    "67",
    "1246",
    "B789",
    ["ac_operating_20261020"],
    "2027-06-10",
    "2027-09-06",
)
plan(
    "AC",
    "ICN",
    "YUL",
    "68",
    "2357",
    "B789",
    ["ac_operating_20261020"],
    "2027-06-11",
    "2027-09-05",
)
for start, end, days in [
    ("2026-12-18", "2026-12-30", "357"),
    ("2027-01-01", "2027-01-03", "57"),
    ("2027-03-03", "2027-03-12", "135"),
    ("2027-03-15", "2027-03-26", "135"),
]:
    plan(
        "ZG",
        "NRT",
        "SJC",
        "30",
        days,
        "B788",
        ["zg_sjc_20261020", "zg_fleet_20261020"],
        start,
        end,
    )
    plan(
        "ZG",
        "SJC",
        "NRT",
        "29",
        days,
        "B788",
        ["zg_sjc_20261020", "zg_fleet_20261020"],
        start,
        end,
    )
all_flights = flights + new + plans


def departure_dates(periods, first, last):
    result = {}
    current = date.fromisoformat(first)
    while current <= date.fromisoformat(last):
        stamp = current.isoformat()
        for p in periods:
            if (
                (not p.get("valid_from") or p["valid_from"] <= stamp)
                and (not p.get("valid_to") or stamp <= p["valid_to"])
                and str(current.isoweekday()) in p["weekdays"]
            ):
                result.setdefault(stamp, set()).add(p["aircraft"])
        current += timedelta(days=1)
    return [
        dict(date=stamp, aircraft=" / ".join(sorted(planes)))
        for stamp, planes in sorted(result.items())
    ]


# Preserve each source interval. Calendar counts use their intersection with the
# explicit snapshot window, never the size of the union of weekday masks.
review = read(ROOT / "scripts/data/timetable-supplemental-review-20261020.json")
for f in new + plans:
    if not f.get("operating_periods"):
        variants = f.get("source_schedule_variants", [])
        if variants:
            f["operating_periods"] = [
                dict(
                    valid_from=r["source_valid_from"],
                    valid_to=r["source_valid_to"],
                    weekdays=r["days"],
                    aircraft=(
                        f["aircraft"]
                        if any(
                            s in f["source_ids"]
                            for s in [
                                "eva_northamerica_20261020",
                                "jx_phx_schedule_20261020",
                                "jal_aircraft_20261020",
                                "ana_honu_20261020",
                            ]
                        )
                        else aircraft_codes.get(r["aircraft_iata"], r["aircraft_name"])
                    ),
                )
                for r in variants
            ]
        else:
            f["operating_periods"] = [
                dict(
                    valid_from=f["valid_from"],
                    valid_to=f["valid_to"],
                    weekdays="".join(
                        str(i + 1) for i, d in enumerate(DAYS) if f[d] == "1"
                    ),
                    aircraft=f["aircraft"],
                )
            ]
    for r in review["supplemental"] + review["aircraft_conflicts"]:
        if (f["airline"], f["flight_number"], f["origin"], f["destination"]) != (
            r["airline"],
            r["flight_number"],
            r["origin"],
            r["destination"],
        ):
            continue
        sid = f"review_{r['airline']}{r['flight_number']}_20261020"
        source(sid, "逐航班补充核查", r["url"], kind="secondary")
        f["source_ids"].append(sid)
        if r.get("append_period"):
            f["operating_periods"].append(r["append_period"])
            f["valid_to"] = HORIZON
        if r.get("conflict_note"):
            f["verification_note"] = r["conflict_note"]
            f["schedule_conflict"] = r
        if r in review["aircraft_conflicts"]:
            f["verification_note"] = (
                "机型来源有分歧："
                + "、".join(r["dates"])
                + " 的 A359／B77W 待航司核实。"
            )
            f["aircraft_conflicts"] = r["dates"]
            for stamp in r["dates"]:
                f["operating_periods"].append(
                    dict(
                        valid_from=stamp,
                        valid_to=stamp,
                        weekdays=str(date.fromisoformat(stamp).isoweekday()),
                        aircraft="A359",
                    )
                )
    f.pop("frequency_note", None)
    f["display_from"] = f["valid_from"]
    f["display_to"] = f["valid_to"]
    f["departures"] = departure_dates(
        f["operating_periods"], f["display_from"], f["display_to"]
    )


def route_key(f):
    pair = next(
        (
            r
            for r in routes
            if r["airline"] == f["airline"]
            and {r["origin"], r["destination"]} == {f["origin"], f["destination"]}
        ),
        None,
    )
    return pair["id"] if pair else None


covered = {route_key(f) for f in new}
eligible = [
    r
    for r in routes
    if r["service_status"] != "announced"
    and not (r.get("service_end") and r["service_end"] < DATE)
]
missing = [r["id"] for r in eligible if r["id"] not in covered]
catalog["timetable_snapshot"] = dict(
    checked_on=DATE,
    review_by=HORIZON,
    import_batch=BATCH,
    records=len(new),
    airline_route_records=len(covered),
    airport_pairs=len({tuple(sorted([f["origin"], f["destination"]])) for f in new}),
    airlines=len({f["airline"] for f in new}),
    missing_airline_routes=missing,
    seasonal_plan_records=len(plans),
    seasonal_plan_import_batch=PLAN_BATCH,
    departure_window=dict(
        valid_from=DATE,
        valid_to=HORIZON,
        departures=sum(len(f["departures"]) for f in new),
        records_without_departures=sum(not f["departures"] for f in new),
    ),
    policy="核查日适用的有方向不停站客运班表；以现有航线资格为边界。官方资料优先，机型可因调度变化；起降时间不录入。为避免把夏季班表外推至冬季，新批次最多适用至10月24日。旧记录逐条保留，同方向已有本批次资料时不再重复显示旧班表。",
)
write(DATA / "flights.json", all_flights)
write(DATA / "catalog-metadata.json", catalog)
write(DATA / "routes.json", routes)
print(json.dumps(catalog["timetable_snapshot"], ensure_ascii=False, indent=2))
