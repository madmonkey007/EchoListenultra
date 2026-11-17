# 视觉改版（paper and ink）源码移植记录

日期：2026-11-17。正式站：https://reelstranscript.com/
**状态：已移植到源码并本地验证，未部署。** 设计交付仓库
`madmonkey007/instagram-reel-transcript`（私有，main，HEAD `54e77c7`），
设计侧最后回复（缺口 1/2/3 + 四项确认）已全部落实到本次移植。

## 设计交付 → 源码移植映射

| 设计侧产物（打补丁构建产物） | 源码层落点 |
| --- | --- |
| `redesign.css`（视觉层，2359 行） | `public/assets/redesign.css`，index.html 在 tailwind.css 之后加载 |
| 自托管字体 ×4（Newsreader + Plus Jakarta Sans） | `public/assets/fonts/`，首页 2 个 preload |
| Google Fonts CDN + Material Symbols 字体 | 全部移除；图标改为 `lib/icons.ts` 运行时内联 SVG（46 映射 + 3 别名 + 加固兜底） |
| bundle 补丁 `theme:"dark"→"light"` | `App.tsx` DEFAULT_CONFIG；`index.html` class="light" + pre-paint 引导脚本 |
| bundle 补丁 FAQ 4→6（details→h3/p）+ JSON-LD | `lib/home-faq.ts` 单一来源；`static-seo.ts` 构建时注入 shell + JSON-LD（仅首页）；LandingView 同源渲染 |
| bundle 补丁时间码整秒化 | `components/ReelResult.tsx` `timestamp()`（结尾进位衔接，SRT 导出毫秒不动） |
| bundle 补丁阅读提示文案 | `components/ReelResult.tsx` |
| bundle 补丁信封图标 ×2 | `SiteHeader.tsx`（help_outline→mail）、`App.tsx`（chat_bubble_outline→mail） |
| 英雄区 br 前补空格 ×3 + h1 | `LandingView.tsx`、`ReelTranscriber.tsx` JSX 直改 |
| 首页 shell 示例时间码 | `index.html` 与 `ReelTranscriber.tsx` EXAMPLE 同步为整秒（测试锁定一致） |
| `icons.js` 独立脚本 | 并入应用 bundle（`initIconLayer()`），MutationObserver 语义保留 |
| （设计侧未做）SW 缓存 | `sw.js` CACHE_NAME v1→v2；redesign.css 放 `/assets/` 下以命中预缓存规则 |

## 与设计稿的有意偏差

1. redesign.css 独立成文件（设计稿把它并进 bundle css）——为了 SW
   `/assets/` 预缓存正则能捕获，加载顺序不变。
2. FAQ 3 分钟数值从 `limitMinutes()` 推导，不写死（设计稿注释里自己标注
   "change one, change the other" 的漂移风险，源码层可以根治）。
3. 图标兜底加固：未映射字形清空文本而不是保留字面量（设计侧建议，已实现）；
   另补了 3 个设计侧 42 清单之外的源码在用字形：`format_quote`、
   `graphic_eq`、`upload_file`（均取官方 24px SVG）。

## 验证

- `npm test`：**153/153**（原基线 146 + 新增 redesign-layer 7 项；网站测试
  的 FAQ 断言从旧契约〈4 details/4 h3〉更新为新契约〈0 details/10 h3〉）。
- `tsc --noEmit` 干净；`vite build` 成功。
- 构建产物核对：首页 6 faq-item + 6 Question JSON-LD；8 个内页 faq/jsonld
  均为 0（JSON-LD 不外泄）；bundle 无 `theme:"dark"`、无毫秒时间码、新旧
  文案替换到位；字体与 redesign.css 落位 dist/assets/。
- 与设计目标产物结构对比 11 项：10 项一致，1 项为上述有意偏差。
- `vite preview` 冒烟：/、/about、/instagram-reel-transcript、/settings、
  redesign.css、字体全部 200（两次 000 为本机 fake-ip 代理抖动，重试即过）。
- 环境注：本轮 `node_modules` 缺 typescript（website 等测试因此挂），
  `npm install`（清代理环境变量）后恢复。

## 设计侧明确没做、移植后仍欠的测试（归本仓后续）

- 真后端链路：真音频、>3 分钟拒绝、27s 超时、5xx、断网。
- 浏览器矩阵：仅 Chromium 验证过；Safari/iOS 真机、Firefox 未测。
- 强制颜色模式、200% 缩放、打印样式、屏幕阅读器未测。
- 6 个非预渲染路由（about/help/privacy/contact/settings + player 相关）
  只有"不会破坏一致性"的判断，未逐页视觉走查。

## 设计侧建议、待用户拍板（本次未动）

- `/tiktok-transcript` 是三段字 noindex 占位页，设计侧建议直接删除
  （涉及下线一个已部署 URL，需用户决定）。
- md 导出实为纯文本（mime text/markdown 但内容无 markdown 结构），设计侧
  建议源码层顺手修正（改变导出产物，需用户确认）。

## 部署

未部署。按本仓惯例部署是独立步骤，等待用户明确指令后执行
`vercel --prod --yes` 并回填 dpl_ ID 与线上验收。
