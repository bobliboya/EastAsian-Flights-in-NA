# 开发交接：从入口到一次修改

先看根目录 [README](../README.md) 启动网页和运行检查，再按这份指南找代码。不需要安装前端框架、数据库或打包工具。

## 1. 页面是怎么运行的

`index.html` 先加载 CDN 的 Bootstrap CSS / bundle 和 Leaflet，再通过 `type="module"` 加载 `src/js/app.js`。模块使用相对路径导入，没有全局自定义命名空间。

```text
index.html
  └─ app.js：读取数据、建立地图、管理筛选和详情
       ├─ display.js：生成文字和 HTML
       ├─ geometry.js：太平洋坐标、曲线采样、航线颜色
       ├─ multiselect.js：可复用的多选筛选控件
       ├─ controls.js：输入方式、Logo 提示、手机顶部菜单
       └─ place-labels.js：城市标签避让机场与航线
```

所有模块都有明确边界：

| 文件 | 入口／关键函数 | 不应该放进去的东西 |
| --- | --- | --- |
| `app.js` | `init()`、`applyFilters()`、`render()`、`showRoute()` | 通用的文字格式规则、CSS |
| `display.js` | `departureSummary()`、`catalogOptionHTML()`、`createAirlineRenderer()`、`createFlightRenderer()` | DOM 查询、网络请求、Leaflet 状态 |
| `geometry.js` | `pacific()`、`routeCurve()`、`routeColor()`、`ROUTE_CURVE` | 筛选和卡片逻辑 |
| `multiselect.js` | `createCatalogMultiselect(container, options)` | 地图状态；选项改变只通过 options.onChange 通知应用 |
| `controls.js` | `setupInputTracking()`、`setupBrandTooltips()`、`setupTopbarMenu()` | 航线计算 |
| `place-labels.js` | `setupPlaceLabels()`，返回重新排布函数 | 选中航线、筛选数据 |

`display.js` 和 `geometry.js` 不依赖浏览器，因此自动测试可直接 import。不要用测试脚本截取源码字符串执行。

## 2. 网站读取哪些数据

只读取 `src/data/` 下的机场、航司、航线、班表四份 JSON 和地理底图。

```text
admin/routes.csv ───────┐
                       ├─ manage-data.py apply ─→ routes.json / flights.json
admin/timetables.csv ───┘           │
                                   └─ 临时目录校验通过才替换输出

airports.json / airlines.json：直接维护的基础目录
reference/：仅参考资料，不参与生成和显示
```

新增航线时先保证机场和航司目录有相应代码，再增加 routes.csv 行，最后添加班表。详细字段见 [管理员说明](../admin/README.md) 和 [数据说明](../src/data/CATALOG.md)。

数据都属于显示内容。只要把自由文本放进 HTML，就必须先经过 `escapeHTML()`。备注不能直接拼进未转义的 HTML。

## 3. 理解 app.js 的状态

多选控件自己保存选中的代码，提供 `size`、`has()`、`values()`、`set()`。`values()` 用于生成稳定排序的筛选快照；判断是否为空用 `size`，避免反复排序。

- `applyFilters()` 比较前后筛选，必要时清空展开状态，再调用 `render()`。
- `render()` 回到列表模式，重建当前筛选的连线、机场圆点和航线列表。
- `showRoute(route)` 进入某一机场对的详情，返回时复用原筛选并保留展开状态。
- `selectedRoute` 为空表示列表模式，有值表示某条航线已选中。
- `hoveredRoute` 只管理临时悬停高亮，不应覆盖真实选择。
- `collapsedRoutes` 和 `collapsedCountries` 记录哪些项目被收起。

**两处统计不能混用：**顶部 `#stats` 是全站总量，只在加载时计算；右侧 `#flight-summary` 是当前筛选的记录数／机场对数，详情模式则显示该机场对的记录数和1条航线。

地图线条来源是 routes，不是 flights。一个机场对的不同航司和往返航班合并为一条线；不能用 `routes.json` 的行数当作地图线数，也不能把一条无班表航线虚构成一个航班。

## 4. 地图为什么这样写

`pacific()` 把负经度平移360°，让太平洋位于画面中心。`routeCurve()` 生成示意曲线，保持两端真实机场位置。绘制、取景和密集航线命中使用同一套点，避免“线画在这里、点击却在别处”。

鼠标、键盘和触屏走不同的预览路径。触屏会合成 mouseover，如果删掉输入追踪，手机第一次点击可能被悬停弹层吃掉。

机场信息卡允许鼠标从圆点移入卡片。延迟关闭和圆点到卡片之间的连接区域用于防止卡片闪退，不是多余代码。

`constrainOverlay()` 在地图边界内调整整个浮层；`framePacific()` 负责视口变化后的缩放范围。不要用调整机场坐标来解决 UI 问题。

## 5. 修改后怎么验证

运行一条命令：

```powershell
node scripts/check-project.mjs
```

它检查所有 JS／Python 的语法、模块和 CSS 导入、页面资源、文档链接、数据关系、CSV 与正式 JSON 是否同步、生成流程、显示顺序、每周班表、国家／地区名称、注入转义和曲线端点。失败导入的测试会核对正式文件没被写坏。提示 JSON 未同步时运行 `python scripts/manage-data.py apply`，然后重跑检查。指定另一 Python 解释器可设置 `PYTHON` 环境变量。

然后做浏览器检查：

1. 初次加载：有地图、线条、机场、侧栏，无初始化报错；Logo 均能显示。
2. 选择一家航司：地图和右侧记录变化，顶部全站统计保持不变。
3. 同一区域选多个机场：取并集；亚太、北美、航司三个条件之间取交集。
4. 展开一条航线，进入“查看细节”，返回后保留筛选和展开状态；重置后清空选中标签。
5. 悬停和点击机场、密集线路；选中后移出仍保留端点标签，点空白取消选择。
6. 地图四个边缘的浮层不溢出；长列表只有内容区滚动，标题不滚动。
7. 在小于800px的窗口检查顶栏菜单、面板减半按钮、筛选和滚动；触屏点击不能需要点两次。
8. 新文字排版、联盟 Logo 靠右、每日航班不列星期、机型纯文字和无国旗。

自动检查不能证明 CSS 布局、真实触屏手感或外部航班事实正确。验证某项受环境限制时，应注明没测到的范围。

## 6. 怎么发布与回退

项目是静态站点，生产部署至少要有 `index.html` 及整个 `src/`。新增 JS 模块、Logo、CSS 导入文件都要一起部署，不能只上传 app.js。服务器应按 `.js` 的正常 JavaScript MIME 类型提供模块。

数据更新提交 CSV 和生成的 JSON；代码改动提交新增模块。先看 `git diff`，确认没有顺手混入无关变动，再使用自己的托管平台发布。仓库没有内置发布脚本。

回退时回退同一次修改中的完整文件组。不要只回退 flights.json 而保留更新后的 CSV，也不要只回退 app.js 而漏掉配套模块和页面入口。

Bootstrap 通用组件由官方 CSS / bundle 提供；`multiselect.js` 只衔接目录数据、多选状态与回调。地图命中、浮层边界与手机面板减半保留业务逻辑。新增通用控件优先复用 Bootstrap，避免另写基础控件样式。

结果与目录的分组使用 Bootstrap Collapse，折叠状态在 shown/hidden 事件中同步；重绘前 dispose 旧实例。保留 800px 业务断点，不套用 Bootstrap navbar 的不同断点。

Bootstrap 迁移验证：1440 / 768 / 390px 截图检查；390px 下无页面横向溢出，菜单、面板减半、机场多选可用；桌面航司筛选、详情返回、批量折叠和重置通过浏览器操作。真实触屏手感和地图四边浮层仍需设备回归。设计检查中的 Bootstrap Accordion 默认内阴影及边框保留官方组件外观；地图地名描边与地区色保留业务语义。

## Bootstrap 组件覆盖范围

筛选使用 Dropdown / Form Check，已选标签和操作使用 Button；结果与航班使用 Card / Accordion / Collapse；顶栏使用 Navbar / Collapse，Logo 使用 Tooltip，状态使用 Alert。机场卡片与附近航线共用 `controls.js` 的 `createMapChoiceCard()`，组合 Card / Card header / Card body / List group / Close button。关闭按钮通过回调通知地图控制器，不再使用 Leaflet 自带关闭链接。组件外观沿用原版主题。

Leaflet Popup 仅作为地图锚点和外壳；机场标签、城市标签、航线绘制／命中、边界约束、悬停连接区域及面板减半仍是地图业务逻辑，不以 Bootstrap Modal / Popover 代替，否则会改变原来的地图交互。

地图组件迁移浏览器回归：机场卡片打开／关闭、附近六条航线列表选择已验证；390px 手机机场卡片已验证位于地图边界内且内容可滚动。真实触屏和所有四边组合尚未完整设备回归。

附近机场选择由 `geometry.js` 的 `nearbyAirports()` 按真实经纬度计算：以当前机场为中心、同一区域内 200 公里为候选范围，当前机场优先，其余按距离排序。覆盖 LAX／ONT／SAN、HKG／SZX／CAN 等；不传递合并邻居，不随缩放变化，也不移动真实坐标。候选保留无当前班表的机场供进一步选择。
