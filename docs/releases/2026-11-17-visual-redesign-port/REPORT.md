# 视觉改版（paper and ink）源码移植记录

日期：2026-11-17。正式站：https://reelstranscript.com/
**状态：已上线（2026-11-17 生产部署）。** 移植提交 `bccd7ba`，随后随批准追加 `77732a6`（删 TikTok 占位页 + md 导出改真 markdown）一并部署。 设计交付仓库
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

## 二轮改动（2026-11-17 用户批准）

- **删 `/tiktok-transcript`**：noindex "coming soon" 占位页（唯一按钮回主页），
  从路由/预渲染集/site-meta/vercel.json 全部移除，`/tiktok-transcript` 与
  `/tiktok-transcript/` 均 301 → `/`（即占位页自己送用户去的终点）。
  `video-url.ts` 的 TikTok 链接解析是视频导入功能，与本页无关，保留。
- **md 导出改真 markdown**：`# Reel transcript` 标题 + 每段时间码段
  （`**[mm:ss]** 文本`，与页面同款整秒格式化器 `formatTimestamp`，现由
  `lib/reel-result.ts` 导出共享）；SRT 毫秒不动、txt 不变。

## 上线验收（2026-11-17，正式站 curl 实测）

| 检查 | 结果 |
| --- | --- |
| 既有 10 条斜杠变体 | **10/10 = 301**，Location 均为对应无斜杠路径 |
| `/tiktok-transcript` 与 `/tiktok-transcript/` | 均 **301 → `https://reelstranscript.com/`** |
| 10 个裸路径 + 根 | 全部 200 |
| `/assets/redesign.css`、字体 woff2 | 200 |
| 首页内容 | faq-item=**6**、FAQPage JSON-LD=**1**、Google Fonts 引用=**0**、主题引导脚本=**1**、`class="light"` |
| FAQ 不外泄 | `/about` faq-item=0、FAQPage=0、自有 title |
| `/settings` | 200 + `x-robots-tag: noindex, follow` |
| 线上 bundle | `/assets/index-DO5KLz…js` 与本地构建**同哈希**（334,938B），含 `theme:"light"`、`# Reel transcript`（md 导出）、图标层 |

部署执行注：本机 Clash TUN 对 vercel 上传持续瞬断（`fetch failed`），重试后
部署成功并晋升；CLI 因网络抖动未能返回 dpl_ ID，以上线内容与本地构建
bundle 同哈希作为部署确认（这是比部署 ID 更强的逐字节证据）。

## 三轮修正（2026-11-18）：级联顺序 bug + 线上文件清理（提交 a4b2167）

**用户报告"线上样式根本没变"——根因是我的一级部署缺陷**：vite 把根目录
website.css/tailwind.css 的 <link> 编译成 hash bundle（index-D4CTsMpg.css）
并注入在 redesign.css 链接**之后**——旧深色样式最后加载，把新视觉层整层
盖掉。curl 验收只查了 200 没查级联顺序，属于验收盲区（已补：产物内
字节位置断言）。

修正：三个样式表改由 `index.tsx` 按序 import（website → tailwind →
redesign），vite 合并为单一级联正确的 `/assets/index-lpVMlu_g.css`
（dist 内 navy pos 29 < paper pos 57916）；SW CACHE_NAME v2→v3 作废旧缓存。

同轮清理线上文件：
- `/logo-512.png` 恢复 200（本地误删被上轮部署带走，目录提交链接曾 404）
- `/reels transcript-logo-512.png` 与 `…_副本.png` 两个带空格文件从
  public/ 移出（存档到 vercelignored 的 docs/brand-submissions/，未提交），
  线上 404
- 旧 `/assets/redesign.css` 404（已并入 bundle，属预期）

复验（2026-11-18 线上）：上表全部绿灯；首页 faq-item=6、class="light"、
线上 css 与本地同哈希、级联顺序正确。

**部署位置确认（回应"部署在哪里"）**：生产 = Vercel 项目
`ponymads-projects/echo-listenultra-ebre`（CLI 账号 dihou008-7465），域名
reelstranscript.com 以 A 记录 216.198.79.1（Vercel anycast）指向该项目。
归属证据 = 线上 bundle/css 与本地构建逐字节同哈希（两次部署均验证）。
