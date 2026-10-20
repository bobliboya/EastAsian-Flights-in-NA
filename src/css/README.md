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
- `--color-accent`：按钮及航线选中的黄色。
- `--font-size-base`：普通文字 14px；`medium`、`large`、`xlarge`、`stat` 分别为 16、18、20、22px，统一控制全站字号。
- `--sidebar-width`：PC 右栏宽度。较小屏幕的覆盖在 `layout.css` 中。
- `--map-land`、`--map-ocean`、`--map-border`：陆地、海洋、国界。
- `--route-greater-china`、`--route-japan`、`--route-korea`、`--route-singapore`：各地区航线颜色；加 `-highlight` 后缀的变量控制悬停／选中的深色。`--route-color` 是未分类航线的后备色。

地图 SVG 使用相同的 CSS 变量，颜色不再写死于 JS。修改样式后刷新页面即可。全站字体只在 `theme.css` 指定，组件继承；修改时请在对应组件的原规则中调整，避免多次重复定义同一选择器。

滚动条统一由 `theme.css` 的 `--color-scroll-track`、`--color-scroll-thumb`、`--color-scroll-thumb-hover` 控制，使用深灰轨道和灰色滑块。

机场信息浮层和附近航线浮层共用 `components.css` 中的 `.map-choice-panel`、`.map-choice-heading`、`.map-choice-body`：标题固定，只有 body 滚动，滚动条与边框之间保留内侧间距。
