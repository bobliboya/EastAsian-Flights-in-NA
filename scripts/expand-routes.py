"""Rebuild the manually researched route snapshot; never invent timetable fields."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'src' / 'data'
DATE = '2026-10-19'
catalog = json.loads((DATA / 'catalog-metadata.json').read_text(encoding='utf-8'))

def source(key, title, url, kind='primary'):
    catalog['sources'][key] = dict(title=title, url=url, kind=kind, accessed_on=DATE)

source('piao_nonstop_202609', '票帝：中国—北美直航表（2026年9月更新，含后续计划）', 'https://piao.tips/uschinanonstop/', 'schedule_reference')
source('eva_network_202609', 'EVA Air passenger network as of September 2026', 'https://www.evaair.com/en-global/about-eva-air/about-us/market-and-sales-overview/main-business-and-services/')
source('eva_iad_2026', 'EVA Air ten nonstop North American gateways', 'https://www.evaair.com/en-sg/about-eva-air/news/news-releases/2026-02-11-evaair-new-route-taipei-to-washington-dc.html')
source('ana_routes_2026', 'ANA 2026 international operating routes and seasonal dates', 'https://www.ana.co.jp/en/us/plan-book/routes/international-route-information/')
source('ac_asia_2026', 'Air Canada published Asia operating schedule', 'https://vacations.aircanada.com/en/travel-info/where-we-fly/files/EN-ASIA-Asia.pdf')
source('zg_network_2026', 'ZIPAIR network and approval-pending routes', 'https://www.zipair.net/en/about')
source('zg_notices_2026', 'ZIPAIR 2026 route sales; Orlando and Las Vegas identified as charters', 'https://www.zipair.net/en/notification')
source('jx_network_2026', 'STARLUX five US destinations', 'https://www.starlux-airlines.com/flights/en-th/starlux-king-power-collab')
source('dl_tokyo_2026', 'Delta current Haneda network and March 2027 Narita launch', 'https://news.delta.com/new-way-tokyo-delta-launch-new-seattle-tokyo-narita-service-march-2027')
source('as_asia_2026', 'Alaska/Hawaiian Seattle Narita and Incheon services', 'https://news.alaskaair.com/destinations/more-seats-and-routes-as-alaska-and-hawaiian-scale-up-for-largest-spring-break-operation-ever/')
source('hu_network_2026', 'Hainan 2026–2027 North America business fare routes', 'https://www.hainanairlines.com/HUPortal/dyn/portal/DisplayPage?COUNTRY_SITE=CN&LANGUAGE=CN&PAGE=TPTU&SITE=CBHZCBHZ')
source('mu_network_2026', 'China Eastern June 2026 Pudong connecting network', 'https://globalgt.ceair.com/global/static/Announcement/AnnouncementMessage/chinaeasternnewstest/202606/t20260618_30045.html')
source('fc_sin', 'FlightConnections Singapore nonstop passenger routes', 'https://www.flightconnections.com/flights-from-singapore-sin', 'schedule_index')
source('fc_kix', 'FlightConnections Kansai nonstop passenger routes', 'https://www.flightconnections.com/flights-from-osaka-kix', 'schedule_index')

routes = {}

def add(airline, origin, destinations, sources, status='active', **extra):
    for destination in destinations.split():
        key = f'{airline}:{origin}-{destination}'
        assert key not in routes, key
        routes[key] = dict(id=key, airline=airline, origin=origin, destination=destination,
                           service_status=status, checked_on=DATE, source_ids=sources.split(), **extra)

# Mainland China: only the actual nonstop segment, never the connecting feeder.
add('CA', 'PEK', 'LAX SFO JFK IAD YYZ', 'piao_nonstop_202609')
add('CA', 'PEK', 'YVR', 'piao_nonstop_202609 yvr_network')
add('CA', 'SZX', 'LAX', 'piao_nonstop_202609')
add('MU', 'PVG', 'LAX SFO JFK YYZ', 'mu_network_2026 piao_nonstop_202609')
add('MU', 'PVG', 'YVR', 'mu_network_2026 yvr_network')
add('CZ', 'CAN', 'LAX SFO JFK YYZ', 'piao_nonstop_202609')
add('CZ', 'CAN', 'YVR', 'piao_nonstop_202609 yvr_network')
add('CZ', 'WUH', 'SFO', 'cz_wuh piao_nonstop_202609')
add('MF', 'XMN', 'LAX', 'piao_nonstop_202609')
add('MF', 'XMN', 'YVR', 'piao_nonstop_202609 yvr_network')
add('MF', 'FOC', 'JFK', 'piao_nonstop_202609 fc_foc')
add('HU', 'PEK', 'SEA BOS YYZ', 'hu_network_2026 piao_nonstop_202609')
add('HU', 'CKG', 'SEA', 'hu_network_2026 hu_ckg')
add('HU', 'SZX', 'YVR', 'hu_network_2026 yvr_network')
add('JD', 'TAO', 'YVR', 'jd_yvr piao_nonstop_202609', note='杭州始发航班经停青岛；地图仅连接青岛—温哥华不停站航段。')
add('3U', 'TFU', 'YVR', 'yvr_network piao_nonstop_202609')
add('3U', 'TFU', 'LAX', 'piao_nonstop_202609', service_end='2026-10-24', note='票帝注明10月25日起增加杭州技术经停；该日期后不再计作不停站航线，需再次核实。')
add('AA', 'PVG', 'DFW', 'piao_nonstop_202609')
add('UA', 'PEK', 'LAX SFO', 'piao_nonstop_202609')
add('UA', 'PVG', 'LAX SFO', 'piao_nonstop_202609')
add('DL', 'PVG', 'SEA DTW LAX', 'piao_nonstop_202609')
add('AC', 'PEK', 'YVR', 'yvr_network piao_nonstop_202609')
add('AC', 'PVG', 'YVR YYZ', 'ac_asia_2026 piao_nonstop_202609')

# Hong Kong, Taiwan and Singapore.
add('CX', 'HKG', 'LAX SFO JFK BOS ORD DFW SEA YYZ YVR', 'cx_network')
add('UA', 'HKG', 'LAX SFO', 'piao_nonstop_202609')
add('DL', 'HKG', 'LAX', 'piao_nonstop_202609')
add('AC', 'HKG', 'YVR', 'yvr_network ac_asia_2026')
add('HX', 'HKG', 'YVR', 'hx_yvr yvr_network')
add('BR', 'TPE', 'LAX SFO JFK ORD IAH SEA YYZ YVR DFW IAD', 'eva_network_202609 eva_iad_2026')
add('CI', 'TPE', 'LAX ONT SFO JFK SEA PHX YVR', 'ci_network')
add('JX', 'TPE', 'LAX ONT SFO SEA PHX', 'jx_network_2026')
add('UA', 'TPE', 'SFO', 'piao_nonstop_202609')
add('DL', 'TPE', 'SEA', 'piao_nonstop_202609')
add('SQ', 'SIN', 'LAX SFO SEA JFK EWR', 'fc_sin')
add('UA', 'SIN', 'SFO', 'fc_sin')
add('AC', 'SIN', 'YVR', 'yvr_network ac_asia_2026')

# Japan: separate Haneda and Narita; seasonal services stay explicitly marked.
add('JL', 'HND', 'JFK ORD DFW SFO LAX HNL', 'jal_schedule')
add('JL', 'NRT', 'BOS ORD SFO LAX SAN SEA YVR HNL', 'jal_schedule')
add('JL', 'KIX', 'LAX HNL', 'jal_schedule')
add('JL', 'NGO', 'HNL', 'jal_schedule')
add('NH', 'HND', 'LAX SFO SEA IAD JFK IAH ORD YVR HNL', 'ana_routes_2026')
add('NH', 'NRT', 'LAX SFO ORD HNL', 'ana_routes_2026')
add('NH', 'NRT', 'YVR', 'ana_routes_2026', 'seasonal', season_note='2026年公布运营期为6月5日至8月31日。', service_start='2026-06-05', service_end='2026-08-31')
add('UA', 'HND', 'ORD LAX EWR SFO IAD', 'fc_hnd')
add('UA', 'NRT', 'ORD DEN IAH LAX EWR SFO', 'fc_nrt')
add('UA', 'KIX', 'SFO', 'fc_kix')
add('UA', 'KIX', 'LAX', 'fc_kix', 'seasonal')
add('AA', 'HND', 'DFW LAX JFK', 'fc_hnd')
add('AA', 'NRT', 'DFW ORD', 'fc_nrt')
add('DL', 'HND', 'ATL DTW MSP LAX HNL SEA', 'dl_tokyo_2026')
add('AS', 'NRT', 'SEA', 'as_asia_2026')
add('AS', 'HND', 'HNL', 'fc_hnd')
add('AS', 'KIX', 'HNL', 'fc_kix')
add('SQ', 'NRT', 'LAX', 'fc_nrt')
add('AC', 'HND', 'YYZ', 'fc_hnd ac_asia_2026')
add('AC', 'NRT', 'YVR YYZ YUL', 'fc_nrt ac_asia_2026')
add('AC', 'KIX', 'YVR YYZ', 'fc_kix ac_asia_2026', 'seasonal')
add('WS', 'NRT', 'YYC', 'ws_asia')
add('ZG', 'NRT', 'LAX SFO IAH HNL', 'zg_network_2026 zg_notices_2026')
add('ZG', 'NRT', 'SJC YVR', 'zg_network_2026 zg_notices_2026', 'seasonal')

# Korea: do not duplicate marketed codeshares as operating airlines.
add('KE', 'ICN', 'LAX SFO JFK BOS ORD ATL DFW SEA IAD LAS HNL YYZ YVR', 'fc_icn')
add('OZ', 'ICN', 'LAX SFO JFK', 'fc_icn')
add('DL', 'ICN', 'ATL DTW MSP SEA SLC', 'fc_icn dl_slc')
add('AA', 'ICN', 'DFW', 'fc_icn')
add('UA', 'ICN', 'SFO', 'fc_icn')
add('AS', 'ICN', 'SEA', 'as_asia_2026')
add('YP', 'ICN', 'LAX SFO EWR IAD', 'yp_airports fc_icn')
add('YP', 'ICN', 'HNL', 'yp_airports fc_icn', 'seasonal')
add('AC', 'ICN', 'YVR YYZ', 'fc_icn ac_asia_2026')
add('AC', 'ICN', 'YUL', 'fc_icn ac_asia_2026', 'seasonal', season_note='夏季航线，2026年公布运营季至9月；不代表核查日仍执行。')
add('WS', 'ICN', 'YYC', 'ws_asia', 'seasonal', service_start='2026-03-29', service_end='2026-11-07')
add('TW', 'ICN', 'YVR', 'tw_yvr yvr_network')

# Announcements are retained for maintenance but not drawn as active services.
add('AC', 'CTS', 'YVR', 'ac_sapporo', 'announced', service_start='2026-12-17')
add('AC', 'CAN', 'YVR', 'ac_asia_2026 piao_nonstop_202609', 'announced', service_start='2027-05-04')
add('DL', 'NRT', 'SEA', 'dl_tokyo_2026', 'announced', service_start='2027-03-27')

result = sorted(routes.values(), key=lambda r: (r['origin'], r['destination'], r['airline']))
(DATA / 'routes.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
catalog['route_snapshot'] = dict(checked_on=DATE, records=len(result),
    airport_pairs=len({(r['origin'], r['destination']) for r in result if r['service_status'] != 'announced'}),
    policy='人工核查的定期客运不停站机场对，含季节性；未来开航不显示为现役。航线资格与历史班表独立，未核实的航班号、机型、时刻和班次不补造。')
(DATA / 'catalog-metadata.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(result)} airline/route records')

# Add actual flight numbers only where the carrier's dated operating table lists them.
# Existing historical records are retained verbatim; rerunning does not duplicate these additions.
flights = json.loads((DATA / 'flights.json').read_text(encoding='utf-8'))
flights = [f for f in flights if f.get('import_batch') != 'official_japan_20261019']
new_flights = []

def flight_pair(airline, origin, destination, outbound, inbound, source_id, out_days='1234567', in_days=None):
    for a, b, numbers, weekdays in [(origin, destination, outbound, out_days), (destination, origin, inbound, in_days or out_days)]:
        for number in numbers.split():
            new_flights.append(dict(airline=airline, flight_number=number.zfill(4), origin=a, destination=b,
                dept_time='', arri_time='', aircraft='',
                **{day: '1' if str(i + 1) in weekdays else '0' for i, day in enumerate(['MON','TUE','WED','THU','FRI','SAT','SUN'])},
                valid_from='2026-10-19', valid_to='2026-10-24', checked_on=DATE,
                source_ids=[source_id], import_batch='official_japan_20261019'))

for origin, destination, outbound, inbound in [
    ('HND','JFK','4 6','3 5'), ('NRT','BOS','8','7'),
    ('HND','ORD','10','9'), ('NRT','ORD','56','55'), ('HND','DFW','12','11'),
    ('HND','SFO','2','1'), ('NRT','SFO','58','57'),
    ('HND','LAX','16','15'), ('NRT','LAX','62','61'),
    ('NRT','SAN','66','65'), ('NRT','SEA','68','67'), ('NRT','YVR','18','17'),
    ('HND','HNL','72 74','71 73'), ('NRT','HNL','786','785')]:
    flight_pair('JL', origin, destination, outbound, inbound, 'jal_schedule')
flight_pair('JL','KIX','LAX','60','69','jal_schedule','13467')
flight_pair('JL','KIX','HNL','790','799','jal_schedule','12457','23567')
flight_pair('JL','NGO','HNL','798','797','jal_schedule','2356','1245')
for origin, destination, outbound, inbound in [
    ('NRT','LAX','6','5'), ('HND','LAX','126 106','125 105'),
    ('NRT','SFO','8','7'), ('HND','SFO','108','107'), ('HND','SEA','118','117'),
    ('HND','IAD','102','101'), ('HND','JFK','110 160','109 159'),
    ('HND','IAH','114','113'), ('NRT','ORD','12','11'), ('HND','ORD','112','111'),
    ('HND','YVR','116','115'), ('NRT','HNL','184','183'), ('HND','HNL','186','185')]:
    flight_pair('NH', origin, destination, outbound, inbound, 'ana_routes_2026')
flight_pair('NH','NRT','HNL','182','181','ana_routes_2026','257')
(DATA / 'flights.json').write_text(json.dumps(flights + new_flights, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Added {len(new_flights)} dated official Japan timetable records; preserved {len(flights)} prior records')
