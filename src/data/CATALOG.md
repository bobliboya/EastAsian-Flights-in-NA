# 当前航线与每周班表

管理员只编辑 `admin/routes.csv` 和 `admin/timetables.csv`，运行 `python scripts/manage-data.py apply` 同步生成本目录的 `routes.json` 和 `flights.json`。

## 航线

一条记录对应一家航司的一对机场，`origin` 为亚太端，`destination` 为北美端。字段为 `id`、`airline`、`origin`、`destination`、`note`。

地图以航线表为准，没有班表的航线仍显示承运航司。

## 班表

一条记录对应一个真实方向的航班。字段为 `airline`、`flight_number`、`origin`、`destination`、`aircraft`、`weekly_flights`、`weekdays`、`note`。

`flight_number` 是4位字符串；`weekly_flights` 是每周班数；`weekdays` 使用1至7表示周一至周日，如 `26` 为周二六。每周班数应与星期数量一致，时效通过自由文本 `note` 说明。

页面先显示“每周3班 / 3 Flights per week”，下一行显示“一 三 五 / MON WED FRI”。每周7班只显示班数，不重复列星期。

## 基础目录与证据

`airports.json` 仅保留9个字段：`iata_code`、`name_en`、`name_cn`、`city`、`city_cn`、`country_or_region`、`region`、`latitude`、`longitude`，用于名称、国家／地区分组、筛选和地图定位。

`airlines.json` 仅保留5个字段：`iata_code`、`name_en`、`name_cn`、`country_or_region`、`alliance`，用于名称、国家／地区分组、航司标识和联盟标识；无联盟填 `null`。

国家／地区不显示旗帜，`CHN` 显示“中国大陆 / Mainland China”，`TWN` 显示“台湾地区 / Taiwan”；关联代码保持不变。

两份基础目录都直接编辑 JSON，添加记录时复制现有记录即可。无需填写资格示例、来源编号、核查日期、状态、票证代码或时区。修改后运行 `node scripts/validate-data.mjs`；不需要修改班表生成脚本。

历史来源索引和研究证据在 [reference](../../reference/README.md)，不在网站运行数据中，也不参与生成流程。正式航线及班表由两张管理员表生成。

当前有189条航司—机场对记录、448条单向班表。2026-10-29复核418条既有记录，补录已开航的UA成田—芝加哥双向2条，并替换8条旧航班号。日航与ANA以官方冬季班表为准；其余更新记录采用2026-11-02至11-08完整周作参照，非整个冬季固定模式。ANA成田—檀香山分期航班保留10月29日所处阶段，后续阶段见备注，系统不按日期自动切换。

28条旧记录仍有来源或运营模型缺口，保留旧字段、旧资料日期并增加待复核提示，不能视作冬季已确认记录。技术经停分歧包括3U3838和MF850，尚未按相同航班号推断为不停站返程。完整来源、逐项变更与缺口见 [冬航季复核](../../reference/winter-review-20261029.json)，此前修复见 [往返复核](../../reference/round-trip-review-20261021.json)。全量一致性校验不等于外部事实全部核实。

校验同航司机场对的双向周班总数、单航班频次分布及明确声明的航班对。跨日返程可以有不同的运营星期，不按相邻号码自动补造返程；无班表航线仍然有效。

完整编辑步骤见 [管理员说明](../../admin/README.md)。运行 `node scripts/validate-data.mjs` 检查机场、航司、航线和班表关联及每周班数；校验不会联网判断航班事实。
