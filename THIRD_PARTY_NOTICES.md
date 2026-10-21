# 第三方素材与许可

根目录的 MIT 许可证适用于本项目原创代码与文档；不重新授权第三方依赖、品牌标识、地图数据或外部来源资料，也不授予任何第三方商标权。

## 依赖与底图

| 内容 | 来源与许可 |
| --- | --- |
| Leaflet 1.9.4（通过 CDN 加载） | Copyright 2010–2023 Volodymyr Agafonkin、2010–2011 CloudMade；[BSD-2-Clause 原始许可](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE) |
| Natural Earth 国家边界 | [公共领域数据及使用说明](https://www.naturalearthdata.com/about/terms-of-use/)；文件为 `src/data/world-countries.geojson` |
| Open Sans（通过 Google Fonts 加载） | [SIL Open Font License 1.1](https://github.com/googlefonts/opensans/blob/main/OFL.txt) |

## 航司和联盟标识

`src/assets/airlines/` 与 `src/assets/alliances/` 中的品牌标识不属于本项目的 MIT 授权范围。其商标及其他相关权利属于各自权利人；公开可访问或已收录于本仓库不代表可自由再授权，也不表示航司、联盟或 Google 对本项目提供赞助或认可。

素材来源与修改记录见 [航司标识说明](src/assets/airlines/README.md) 和 [联盟标识说明](src/assets/alliances/README.md)。再分发或另作他用时，应按相应素材的原始条款确认使用权。

## 航班资料

机场、航司、航线和班表中的外部来源资料不因加入本仓库而获得 MIT 再授权；当前字段说明见 [数据说明](src/data/CATALOG.md)，历史来源及核查记录见 [参考资料](reference/README.md)。本项目不主张对客观航班事实享有排他权，也不对来源网站、表格或数据库中第三方享有的权利作出授权。

班表是带日期的资料快照，可能变化；使用时应结合相应来源及航司当前公布的信息。

特别感谢[北美票帝的中美／中加直航资料](https://piao.tips/uschinanonstop/)对航线收集及班表核对提供的帮助。项目保留具体来源引用；致谢不改变原始资料的权利归属。
