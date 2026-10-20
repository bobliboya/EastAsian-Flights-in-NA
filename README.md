# EastAsian-Flights-in-NA
亚太—北美不停站定期客运航线地图，支持按航司及两端机场多选筛选，查看航班号、机型和有适用日期的班表。

## License

本项目原创代码与文档采用 [MIT License](LICENSE)，允许修改、分发和商用，使用时须保留版权与许可声明。

第三方依赖、航司／联盟 Logo、地图数据及外部来源资料沿用各自的权利与许可，不包含在本项目的 MIT 授权中，详见 [第三方素材与许可说明](THIRD_PARTY_NOTICES.md)。

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
- `src/data/catalog-metadata.json`：目录及航线／班表各批次的核查日期、来源、计数和排除原因。
- `src/data/CATALOG.md`：字段说明、研究边界和维护方法。
- `src/data/routes.json`：194 条有来源的航司—机场对关系，含 188 条现役／季节性资格、6 条待开航计划；地图按机场对合并成 114 条连线。
- `src/data/flights.json`：602 条班表记录，含 146 条此前资料、446 条当前快照和 10 条下一季计划。航班号保留前导零；新批次保存来源分段、实际出发日期及对应机型。
- 旧 CSV 和独立坐标文件已移除，坐标直接存于 `airports.json`。
- `src/data/world-countries.geojson`：Natural Earth 国家边界，来源 https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson 。低分辨率底图不包含全部小岛细节。

机场与航司目录核查日为 2026-10-19，航线及新班表核查日为 2026-10-20。大陆—美加参考 [票帝直航表](https://piao.tips/uschinanonstop/)，并结合航司、机场资料核对。当前班表快照最晚适用至 2026-10-24，不能自动外推到下一航季；起降时间未录入。CI23／CI24 的部分机型及 MF806 的班期有来源分歧，界面明确提示待核实。
现收录 44 座机场（43 座现役／季节性，CTS 待开航）、26 家独立航司及 1 家承运关联公司。当前快照覆盖 185 条航司—机场对关系、112 对机场；地图仍展示有航线资格但暂无当前班表的机场对，因此地图连线数与班表覆盖数不同。历史资料保留，新批次优先显示；下一季计划不计入当前航班数。

运行 `node scripts/validate-data.mjs` 检查数据关联、区域、坐标、来源、待开航日期和代码格式。
离线重建本次班表：`python scripts/import-researched-timetables.py`。它读取 `scripts/data/` 中两份已核对的来源文件，保留原有记录，可重复运行。`expand-routes.py` 用于此前航线和日航／全日空批次的重建；不是实时抓取器，详情见 `src/data/CATALOG.md`。

需要重新采集时，先安装 `requests` 和 `beautifulsoup4`，再显式运行 `python scripts/research-timetables.py`；本轮脚本固定核查日为 2026-10-20，更新下一批次时须先调整日期与官方更正。`--audit` 单独采集复查证据，然后运行 `python scripts/audit-timetables.py` 生成报告。缓存、复查证据和报告均不提交。

## 致谢

特别感谢 **北美票帝**。他们整理的航班数据与[中美／中加直航表](https://piao.tips/uschinanonstop/)为本项目的航线收集、班表补充和资料核对提供了非常大的帮助，是本项目重要的参考来源。

## 前端文件

- `src/js/app.js`：地图、筛选、悬停卡片和航线交互。
- `src/css/style.css`：界面样式。
- `src/assets/flags/`：本地国旗／地区旗帜 SVG，按机场和航司的 `country_or_region` 映射。取自 [flag-icons](https://github.com/lipis/flag-icons)，MIT 许可证随文件保存；不依赖系统 emoji 或外部图片服务。
- `src/assets/airlines/`、`src/assets/alliances/`：航司及联盟标识，来源和使用说明随目录保存。

地图卡片与标签会在显示、缩放和窗口尺寸变化时向地图内侧调整，保留边缘间距；高卡片内部滚动，机场小标签始终单行。

航线列表默认折叠，展开后可进入“查看细节”。详情按航班分卡，返回按钮吸附在内容区顶部；机场和航司选中标签仅显示代码。移动端顶栏的统计与 GitHub 入口收进折叠菜单，航班面板高度为 `clamp(300px, 52dvh, 500px)`。
