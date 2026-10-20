# EastAsian-Flights-in-NA
An interactive webpage to show Flights between North America and East Asian cities, operated by some Eastern Asian Airlines.

## 本地运行

在仓库根目录运行 `python -m http.server 8000`，然后访问 http://localhost:8000 。
也可以使用任意静态 HTTP 服务。由于页面通过 fetch 读取 JSON，不能直接双击 HTML 打开。

## 地图

使用开源 Leaflet 1.9.4 与本地 Natural Earth 1:110m 国家边界底图，无需 API key。页面需要联网加载 Leaflet；底图数据随项目保存，使用深色陆地与浅色海洋。
地图以太平洋为中心，以按平均纬度上下分流的示意弧线连接机场；往返和同一机场对的多班航班合并显示为一条航线。
默认只显示机场圆点，悬停显示机场信息卡，移开后收起；点击“查看细节”进入航线详情。LAX/ONT、HND/NRT、JFK/EWR、HKG/SZX 按预设分组展示。也可通过下拉框筛选，点击曲线或侧栏航线查看已录入航班号、运营日和机型。

弧线参数集中在 `src/js/app.js` 顶部 `ROUTE_CURVE`：两端机场平均纬度低于35°向下弯，其余向上弯；`bendFactor` 和 `maxBendDegrees` 控制弯曲程度。机场位置不变，绘制、悬停判定与取景使用同一几何。

航线按亚太端机场所属地区配色：大中华区蓝、日本紫红、韩国深绿、新加坡橙棕；悬停和选中使用各自更深的颜色，其他航线保留原来的粗细与透明度。普通色和深色集中在 `src/css/theme.css` 的 `--route-*`、`--route-*-highlight` 变量中。

## 数据

- `src/data/airports.json`：正式机场资料，按亚太区／北美区分类，合并名称、代码、坐标、时区、服务状态及来源。
- `src/data/airlines.json`：正式航司资料，包括现役独立航司及单列的承运关联公司。
- `src/data/catalog-metadata.json`：2026-10-19 核查范围、来源、计数和排除原因。
- `src/data/CATALOG.md`：字段说明、研究边界和维护方法。
- `src/data/routes.json`：194 条有来源的航司／机场对记录，含 191 条现役或季节性服务、3 条待开航计划；地图按机场对合并成 114 条连线。
- `src/data/flights.json`：76 条保留的历史记录与 70 条新增日航／全日空官方班表。运营日用字符串 0/1，航班号保留前导零；新增班表保存有效期和来源。
- 旧 CSV 和独立坐标文件已移除，坐标直接存于 `airports.json`。
- `src/data/world-countries.geojson`：Natural Earth 国家边界，来源 https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson 。低分辨率底图不包含全部小岛细节。

机场、航司和航线均为 2026-10-19 人工核查快照。大陆—美加参考 [票帝直航表](https://piao.tips/uschinanonstop/)，并结合航司、机场资料核对。日航／全日空新增班表有效至 2026-10-24；缺少的机型、起降时间显示为未录入，历史资料单独标明。
现收录 44 座机场（43 座现役／季节性，CTS 待开航）、26 家独立航司及 1 家承运关联公司。地图连接 43 座机场、114 对航线，显示 142 条关联班表记录；另四条原记录因关岛不在范围或航线已无现役资格而保留但不展示。没有具体班表的航线仍显示承运航司，不捏造航班或频次。机场筛选支持每区多选。

运行 `node scripts/validate-data.mjs` 检查数据关联、区域、坐标、来源、待开航日期和代码格式。
本轮航线和官方班表可通过 `python scripts/expand-routes.py` 重建；它是人工核查快照的导入脚本，不是实时抓取器，详情见 `src/data/CATALOG.md`。

## 前端文件

- `src/js/app.js`：地图、筛选、悬停卡片和航线交互。
- `src/css/style.css`：界面样式。
- `src/assets/flags/`：本地国旗／地区旗帜 SVG，按机场和航司的 `country_or_region` 映射。取自 [flag-icons](https://github.com/lipis/flag-icons)，MIT 许可证随文件保存；不依赖系统 emoji 或外部图片服务。

地图卡片与标签会在显示、缩放和窗口尺寸变化时向地图内侧调整，保留边缘间距；高卡片内部滚动，机场小标签始终单行。
