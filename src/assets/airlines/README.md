# 航司标识

27份PNG为网站展示资源，不是测试截图。按IATA代码命名；来自Google Flights公开的 `https://www.gstatic.com/flights/airline_logos/70px/{IATA}.png`，获取于2026-10-20。使用其简洁图形标识，不附加另一份航司字标。Logo商标属于各航司，仅用于识别航司，不表示授权或合作。

下拉选项依次显示国旗、IATA代码、中文名称、航司图标和联盟图标；选中标签只显示代码。航班列表与详情保留航司名称，图标不附加宽版字标。航司图标正文尺寸20px、联盟18px；悬停／键盘聚焦显示全称。无联盟不放联盟标识，其状态写在航司提示中。

联盟归属使用 `src/data/airlines.json` 的现有 `alliance` 字段；2026-10-20复核：

- 星空联盟（SA）：AC、BR、CA、NH、OZ、SQ、UA。https://www.evaair.com/en-global/plan-and-book/where-we-fly/star-alliance-networks/
- 寰宇一家（OW）：AA、AS、CX、JL。https://www.oneworld.com/members/american-airlines 、https://www.oneworld.com/members/alaska-airlines 、https://www.oneworld.com/members/cathay-pacific 、https://www.oneworld.com/members/japan-airlines
- 天合联盟（ST）：CI、DL、KE、MF、MU。https://www.delta.com/us/en/skymiles/medallion-program/international-partner-skyteam-benefits
- 其他记录的 `alliance: null` 在悬停时显示“无联盟”；代码共享或集团关系不等于联盟成员。

韩亚将于2026-12-16 23:59韩国时间退出星空联盟，此前仍是成员；不得提前改为天合联盟。公告：https://www.evaair.com/en-us/about-eva-air/news/star-alliance-press-releases/2026-06-23-oz-news.html

标识数量对应目录中的26家独立航司及1家承运关联公司。联盟归属按实际成员核对，不能从代码共享、集团归属或品牌图标推断。第三方权利边界见 [项目素材说明](../../../THIRD_PARTY_NOTICES.md)。
