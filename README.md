# 亚太—北美直飞航线地图

一个没有构建步骤的静态网站。使用原生 JavaScript、原生 CSS 和 Leaflet，按航司、亚太机场、北美机场筛选直飞航线，并显示每周班数、运营星期和备注。

## 第一次接手，先做这三件事

1. 安装／准备 Python 3 和 Node.js。本项目没有 npm 依赖，不用运行 `npm install`。
2. 在项目根目录启动网页：
   ```powershell
   python -m http.server 8000 --bind 127.0.0.1
   ```
   浏览器打开 [本地预览](http://127.0.0.1:8000)。不能双击 HTML：页面需要通过 HTTP 加载 JSON 和 JS 模块。
3. 修改前后都运行完整检查：
   ```powershell
   node scripts/check-project.mjs
   ```
   它检查 JS／Python 语法、数据关联、CSV、显示规则和地图几何；不会发布网站或重写正式数据。它不能代替浏览器里的交互检查。

Leaflet 和字体通过 CDN 加载，预览时需要联网。底图和 Logo 已放在项目里，无需地图 API key。

## 想改什么，就去哪里

| 想做的事 | 编辑位置 | 说明 |
| --- | --- | --- |
| 修改航班、班数、星期、机型、备注 | `admin/timetables.csv` | 一行一个单向航班 |
| 增加／删除航司与机场的连接关系 | `admin/routes.csv` | 一行一家航司的一对机场 |
| 修改机场基本资料 | `src/data/airports.json` | 只保留9个基础字段 |
| 修改航司名字或联盟 | `src/data/airlines.json` | 只保留5个基础字段 |
| 改航班卡片、中英排版、Logo 顺序 | `src/js/display.js` | 纯显示函数 |
| 改国家／地区名称和分组顺序 | `src/js/display.js` 的 `REGION_NAMES` | 无旗帜图标 |
| 改地图曲线与地区颜色映射 | `src/js/geometry.js` | 绘制与命中判断共用几何 |
| 改筛选、详情切换或地图交互 | `src/js/app.js` | 应用控制器 |
| 改颜色、字体、间距、侧栏宽度 | `src/css/theme.css` | 修改变量即可 |
| 改桌面／手机布局 | `src/css/layout.css` | 800px 是桌面分界 |
| 改卡片、按钮、下拉框样式 | `src/css/components.css` | 没有 CSS 组件库 |

## 日常更新数据，只有两步

1. 修改 `admin/` 的 CSV，保存为 **CSV UTF-8（逗号分隔）**。
2. 运行：
   ```powershell
   python scripts/manage-data.py apply
   ```

命令会先在临时目录生成并校验，成功后才替换 `src/data/routes.json` 和 `flights.json`。只想检查时，用 `python scripts/manage-data.py check`。

**不要直接改生成的 routes.json 和 flights.json**：下次生成会覆盖。机场和航司 JSON 则直接编辑。提交时把 CSV 和生成的 JSON 一起提交，再按自己的静态网站部署方式发布。项目没有自动发布流程。

详细填写示例见 [管理员维护说明](admin/README.md)，字段说明见 [数据说明](src/data/CATALOG.md)。

## 需要保留的显示规则

- 顶部统计显示全站航线网络的总量，不随筛选变化；航班面板右侧的记录／航线统计才随筛选变化。
- 一条地图连线代表一对机场，不等于一条实际航班；没有录入班表的航线也能画线。
- 航班按实际方向显示；机场对和航线表统一亚太端在前。
- 班表显示两行，例如“每周3班 / 3 Flights per week”和“一 三 五 / MON WED FRI”；每周7班不列星期。
- 航司选项：Logo → 代码 → 中英文两行名称 → 右侧联盟 Logo。航班卡片中代码换成航班号。
- 机型用 `B747`、`B77W`、`A359` 等四位代码，纯文字展示。
- 国家／地区只用文字：`CHN` 为“中国大陆 / Mainland China”，`TWN` 为“台湾地区 / Taiwan”。

## 项目目录

```text
index.html             页面结构；加载 Leaflet、CSS 和 JS 模块入口
src/js/                网站 JS：控制器、显示、筛选、输入、几何、城市标签
src/css/               主题、布局、组件、Leaflet 覆盖样式
src/data/              网站实际读取的四份 JSON 和地理底图
src/assets/            航司和联盟 Logo，附来源及许可说明
admin/                 管理员编辑的两张 CSV 和填写指南
scripts/               CSV 生成器、数据校验、自动测试、统一检查入口
reference/             历史研究证据；网站和生成器都不读取
docs/                  开发交接和检查方法
```

代码调用关系、状态说明及浏览器检查清单见 [开发交接指南](docs/DEVELOPMENT.md)。样式修改方法见 [CSS 指南](src/css/README.md)。

## 资料时效、许可与致谢

资料时效以各航班备注为准。格式转换、检查通过不代表重新核实过航班事实，实际安排以航司公布为准。

原创代码与文档采用 [MIT License](LICENSE)。第三方依赖、底图和 Logo 的权利说明见 [第三方素材与许可](THIRD_PARTY_NOTICES.md)。

感谢北美票帝，其[中美／中加直航表](https://piao.tips/uschinanonstop/)为本项目提供了重要参考。
