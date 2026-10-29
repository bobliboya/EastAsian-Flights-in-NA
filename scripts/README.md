# 脚本入口

在项目根目录运行。需要 Python 3 和 Node.js，没有第三方 Python／npm 依赖，也没有实时抓取和发布动作。

| 命令 | 用途 | 会写正式数据吗 |
| --- | --- | --- |
| `node scripts/check-project.mjs` | 完整检查：语法、资源路径、数据、显示和生成流程 | 否 |
| `python scripts/manage-data.py check` | 读取两张 CSV，在临时目录生成并校验 | 否 |
| `python scripts/manage-data.py apply` | 校验通过后替换 routes.json 和 flights.json | 是 |
| `node scripts/validate-data.mjs` | 检查已有正式 JSON 的字段、重复和关联 | 否 |
| `python scripts/test-manage-data.py` | 测试 CSV 转换、无效输入和失败时不写入 | 否 |
| `node scripts/test-weekly-display.mjs` | 测试真实显示函数、Logo 顺序、地区名、地图几何和附近机场分组 | 否 |
| `node scripts/test-round-trip-audit.mjs` | 测试漏返程、错航班号、频次不一致与跨日返程 | 否 |

`manage-data.py` 的 `build()` 只返回内存数据，`main()` 才负责临时文件、校验和替换。临时目录在已被 Git 忽略的 `artifacts/` 下，退出时自动清理。

数据校验只有一个实现：`validate-data.mjs`。生成器通过 `FLIGHT_DATA_DIR` 环境变量让它读取临时目录，正式文件和待生成文件共用规则。

往返结构检查由 `round-trip-audit.mjs` 执行，明确核实的航班号关联见 `data/round-trip-pairs.json`。检查双向总量和频次分布，不要求同一运营星期，不自动生成返程。真实例外应先核实模型和有效期，不能为通过校验捏造班表。

往返回归测试从当前记录构造必然不同的班数，避免换季后测试注入值恰好等于真实班数；既有加航常规航班对检查双向频次和星期长度，不将夏季每日班表固定为全年要求。事实有效期及完整周模式须由研究证据单独核实。

旧固定日期采集、导入和审计脚本已退出当前维护流程；研究资料放在 [reference](../reference/README.md)，不应该运行旧流程覆盖当前表格。
