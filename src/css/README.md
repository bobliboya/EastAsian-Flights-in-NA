# CSS 修改指南

`style.css` 仅负责按顺序加载其他文件，不在文件末尾叠加临时覆盖。

| 文件 | 修改内容 |
| --- | --- |
| `theme.css` | 全站颜色、字体、侧栏宽度、顶部高度、圆角、间距、地图颜色 |
| `layout.css` | 地图与右侧面板的位置、手机布局 |
| `components.css` | 筛选框、统计、航线卡片、机场信息卡、滚动条 |
| `map.css` | Leaflet 弹窗、机场标签、地图署名等覆盖样式 |

常用变量均在 `theme.css` 的 `:root` 中：

- `--color-background`：列表和右侧栏背景。
- `--color-surface`：航线卡片、机场卡片背景。
- `--color-heading`：标题栏背景。
- `--color-text`、`--color-muted`：正文、次要文字。
- `--color-accent`：按钮及航线选中的强调色。
- `--font-size-base`：普通文字 14px；`medium`、`large`、`xlarge`、`stat` 分别为 16、18、20、22px，统一控制全站字号。
- `--sidebar-width`：PC 右栏宽度。较小屏幕的覆盖在 `layout.css` 中。
- `--map-land`、`--map-ocean`、`--map-border`：陆地、海洋、国界。
- `--route-greater-china`、`--route-japan`、`--route-korea`、`--route-singapore`：各地区航线颜色；加 `-highlight` 后缀的变量控制悬停／选中的深色。`--route-color` 是未分类航线的后备色。

地图 SVG 使用相同的 CSS 变量，颜色不再写死于 JS。修改样式后刷新页面即可。全站字体只在 `theme.css` 指定，组件继承；修改时请在对应组件的原规则中调整，避免多次重复定义同一选择器。

滚动条统一由 `theme.css` 的 `--color-scroll-track`、`--color-scroll-thumb`、`--color-scroll-thumb-hover` 控制，使用深灰轨道和灰色滑块。

机场信息浮层和附近航线浮层共用 `components.css` 中的 `.map-choice-panel`、`.map-choice-heading`、`.map-choice-body`：标题固定，只有 body 滚动，滚动条与边框之间保留内侧间距。

当前界面采用深海蓝配色：`--color-accent` / `--color-on-accent` 控制主按钮，`--color-link` / `--color-link-hover` 控制深色面板内的链接与文字强调，`--color-map-link` 控制浅色地图署名链接。滚动条保持中性灰色。

返回按钮位于 `.panel-scroll` 内侧顶部的 `.panel-back`，只在进入“查看细节”后显示，并吸附在滚动区域顶部；不透明背景防止内容透出。标题栏、航线列表和筛选结果不显示返回按钮。返回详情前的列表时保留卡片展开状态。

## 航司标识

航线列表保留航司名称、简洁航司图形及联盟小标识；班次和适用日期只在详情展示。联盟全称通过悬停或键盘聚焦的小框显示，不在图标旁重复写出。Logo为正式资源，存放在 `src/assets/airlines/` 与 `src/assets/alliances/`。

移动端（799px及以下）顶栏右侧改为菜单按钮，统计与GitHub入口默认折叠；点击展开，点外部、按Escape或切换桌面断点时收起。桌面保持直接展示。手机顶栏沿用64px高度，标题不再与统计挤占同一行。

移动端整个下方面板展开时占最多60dvh，可降为原高度的一半；其中“航班”区域高 `clamp(300px, 52dvh, 500px)`，包含标题栏，内容独立滚动。外层侧栏仍可滚动以访问筛选与航班区域。
