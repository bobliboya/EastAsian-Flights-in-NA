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

当前446条班表由2026-10-20核查资料的星期标记转换，未重新联网核实。各条备注保留实际核查日与已知分歧；修改格式不代表刷新了航班事实。

完整编辑步骤见 [管理员说明](../../admin/README.md)。运行 `node scripts/validate-data.mjs` 检查机场、航司、航线和班表关联及每周班数；校验不会联网判断航班事实。
