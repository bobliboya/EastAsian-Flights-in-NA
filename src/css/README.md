# CSS 修改指南

本项目没有 Bootstrap、Tailwind 或其他组件库。`index.html` 加载 Leaflet 自带样式和 `style.css`；后者依次导入四个本地文件。

| 文件 | 负责什么 | 修改示例 |
| --- | --- | --- |
| `theme.css` | 全局变量、字体、基础标签、滚动条 | 字号、颜色、圆角、侧栏宽度 |
| `layout.css` | 页面位置和响应式布局 | 地图与侧栏、手机面板高度、顶部菜单 |
| `components.css` | 网站组件外观 | 筛选框、Logo、统计、航线和航班卡、地图浮层内容 |
| `map.css` | 地图和 Leaflet 的样式覆盖 | 气泡外壳、提示标签、地名、署名 |

## 从哪里下手

颜色和尺寸先找 `theme.css` 中的变量；不要把颜色直接写进 JS。

- `--color-background`、`--color-surface`、`--color-heading`：页面、卡片、标题背景。
- `--color-text`、`--color-muted`：主要和次要文字。
- `--color-accent`、`--color-on-accent`：按钮背景和按钮文字。
- `--font-size-base`：普通正文；其余字号分别用于标题和统计。
- `--sidebar-width`、`--header-height`、`--panel-padding`：桌面侧栏、顶部高度和内部边距。
- `--route-*` 与 `--route-*-highlight`：航线普通色与悬停／选中色。
- `--map-land`、`--map-ocean`：陆地和海洋。
- `--color-scroll-*`：中性灰滚动条。

## 布局规则

桌面宽度从800px开始，地图在左、侧栏在右。799px及以下，地图在上、筛选与结果面板在下。手机顶栏高度为82px；折叠面板按钮将下面板高度减半。航班结果区域本身有独立滚动。

`.panel-heading` 左边是标题，`#flight-summary` 在右边分两行。不要把它和顶部全站统计混在一起。

`.catalog-option` 是筛选选项的横向布局；`.airline-identity` 是航班卡片中的航司标识；`.bilingual-lines` 保存中英文上下两行；`.alliance-mark` 负责联盟 Logo 靠右。国旗和 Badge 均不使用。

## 地图浮层

机场卡片和密集航线候选面板共用 `.map-choice-panel`、`.map-choice-heading`、`.map-choice-body`。标题不滚动，body 才滚动；一至两座机场的卡片允许完整展开。

边界位置由 app.js 的 `constrainOverlay()` 处理，使用元素实际尺寸整体向地图内侧调整。不要通过移动地图或移动机场坐标补救浮层溢出。

## 清理样式时注意

1. 在对应组件原规则上修改，避免在末尾不断追加覆盖。
2. HTML 中看不到的类不一定没用：JS 会创建浮层、选中状态和 Logo。
3. `leaflet-*` 类由第三方库生成，不能仅凭本地 HTML 搜索结果删除。
4. 航线高亮变量由 geometry.js 动态拼接引用，单次文本搜索会误报“未使用”。
5. 同一选择器在不同媒体查询里出现属于响应式覆盖，不要合并掉断点差异。

修改后运行 `node scripts/check-project.mjs`，并按 [开发交接指南](../../docs/DEVELOPMENT.md) 检查桌面、手机、长列表和地图四边浮层。自动测试不能证明 CSS 的实际视觉效果。
