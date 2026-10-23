# ReelTranscript 域名、品牌与静态 SEO 发布记录

日期：2026-10-23（北京时间）。正式站：https://reelstranscript.com/

最终生产部署：`dpl_9oJYAmHMAVj24MngAeoW5ZEDxXVP`，READY。

## 逐项改前／改后

| 文件／位置 | 改前 | 改后 |
| --- | --- | --- |
| `lib/site-config.json`（新增） | 正式 origin 分散维护 | 唯一生产 origin 配置；任何 Host、Preview 或平台环境均不改变 canonical |
| `lib/static-seo.ts`（新增）、`vite.config.ts` | 静态 URL 多处手写 | 开发和构建从同一配置替换模板；发布文件无模板残留 |
| `index.html` canonical、og:url | 旧平台默认域名 | 正式裸域根 URL，保留根路径必须的 `/` |
| `public/robots.txt` | 旧平台 sitemap | 正式域名 sitemap，由配置生成 |
| `public/sitemap.xml` | 旧平台的五条地址 | 正式域名的 `/`、`/about`、`/help`、`/privacy`、`/contact`，不新增路由 |
| `public/manifest.json` | 旧品牌与旧简介 | ReelTranscript 与转录简介；`start_url=/library`、`scope=/` 原本为相对路径，保持原行为 |
| `index.html` title、og:title；`lib/site-meta.ts` 首页元信息 | 复数关键词＋旧品牌 | `Instagram Transcript & SRT — ReelTranscript`，43 字符，品牌在尾部 |
| `index.html` description、og:description；`lib/site-meta.ts` 首页简介 | 含旧听力产品推广句 | `Get an Instagram transcript from a public Reel link. Copy the text or download timestamped SRT subtitles. No Instagram login or account is required.`，148 字符 |
| `index.html` noscript | 旧听力练习说明，另有一个 H1 | 保留 noscript；仅说明启用 JavaScript 后粘贴公开 Reel 链接生成转录；无 H1 |
| `index.html`、`components/ReelTranscriber.tsx` H1 | `Instagram Reels, ready to read.` | `Instagram Transcript from Any Reel`；静态与渲染后仅换行不同，关键词完整；页面唯一 H1 |
| `index.html`、`tailwind.config.js`、`postcss.config.js`、`tailwind.css`、包与锁文件 | CDN 浏览器运行时编译与内联配置 | Tailwind 3.4.17 构建期生成 CSS；原六种颜色、两组字体、class 深色模式逐值保留 |
| `tests/sync-harness.html` | 测试夹具也使用运行时 CDN | 复用同一构建 CSS |
| `components/SiteHeader.tsx` | 页头／页脚旧品牌 | ReelTranscript；SVG、类名、外观设置不变 |
| `views/AboutView.tsx`、`AuthView.tsx`、`ContactView.tsx`、`HelpView.tsx`、`PrivacyView.tsx`、`SettingsView.tsx` | 正文、提示的旧品牌 | 仅统一品牌字样；页面结构不变 |
| `lib/support.ts`、`tests/support.test.cjs` | 邮件主题旧品牌 | 邮件主题使用 ReelTranscript |
| `lib/import-draft.ts`、`views/AddSessionView.tsx`、`PlayerView.tsx` | 源码存储名称包含旧品牌 | 兼容命名空间按原值组装，实际 IndexedDB 数据库名称完全不变；避免旧库不可读；可见提示换品牌 |
| `README.md`、`DESIGN.md`、`PRODUCT.md`、`metadata.json`、两份既有设计／计划文档、`package.json`、锁文件 | 旧品牌名称 | 当前品牌；无部署项目改名 |
| `tests/site-info.test.cjs`、`seo-static.test.cjs`、`release-style.test.cjs` | 无静态 SEO／层叠与存储兼容保护 | 检查生产域名模板、单 H1、标题／简介、noscript、主题配置、CSS 顺序与原数据库名称 |
| `.gitignore` | 未跟踪的本机音频索引与旧运行日志混入源码扫描 | 标记为本地产物，仍原样保存在本机，不随提交／发布，也未改写历史证据 |

当前粘贴入口只接受 Instagram Reel，未在 description 宣称 TikTok 已实现。没有改变接口来扩展能力。

## 验收证据

- `npm run build`、`npm run typecheck`：通过。
- `npm test`：107 / 107 通过。
- 冻结后端离线测试：11 / 11 通过。
- 工作树源码／文档的标准 `rg` 扫描：指定旧品牌、旧平台域名、旧简介句和 CDN 引用均零命中。发布产物也零命中。
- 扫描范围不包含 Git 元数据、依赖、被忽略的旧实验原始记录。它们仍可能含真实旧地址和机器路径，未为凑零命中而改写。原始音频与人工核对记录保留原位。
- 生产原始 HTTP HTML：canonical 与 og:url 均为正式根 URL；唯一 H1 含完整关键词；Title 43 字符、description 148 字符；noscript 无 H1。
- 生产原始 robots 与五条 sitemap URL：全部正式域名。
- 渲染后 DOM 的 H1、canonical、description、Title 与原始 HTML 一致（H1 仅排版换行不同）。原始响应存为 `live-index.html`；不是从渲染后 DOM 反序列化。
- 在前一候选生产部署实际完成真实 Reel → 可见等待进度 → 7 条 cue → 复制 → 下载。复制结果等于 cue 文本；控制台错误为零。最终构建只额外修正旧数据库名称的字面拼接，但最终部署回归未通过，见下节。
- 实际下载 SRT：7 cue、58 词、最长 cue 5.5 秒、最长行 39 字符、零时长 0、重叠 0。**与前次发布的实际下载文件逐字节相同**。产品下载名保持 `reel-transcript.srt`。
- 11 个冻结源码文件的本轮前／后哈希一致；实际部署使用的对应后端源码也一致。转录组件除了 H1 文案，提交请求、等待、复制与下载代码逐字相同。

证据文件：`live-seo-checks.json`、`browser-checks.json`、`srt-checks.json`、`browser-download.srt`、构建／测试日志。

## 改动 7 样式对比

已对照改前与部署后完整深色页面截图，覆盖首屏、示例转录、按钮、正文各区与页脚；另检查 390px 移动视口。

初次迁移发现旧 CDN 的 reset 最后注入，影响行高和标题字重；调整成原样层叠顺序（网站 CSS 在前、编译 Tailwind 在后）后解决。`website.css` 本轮校验值未变。

首页 222 个元素比较了 13 项计算样式：颜色、背景、字体、字号、字重、行高、内外边距、圆角、display、gap、边框色与阴影。唯一差异是较长品牌让导航的自动左外边距减少 36.023px；颜色、字体、行高、按钮与示例卡片样式均相同。桌面 H1 仍两行、高度 118.875px。移动端无水平溢出；新 H1 文案较长，正常换行为三行，未修改字号、间距或断点。视觉对照 98/100。

## 发布过程与保留事项

第一次通过 API 尝试继承旧部署环境，生产回归返回 503，已恢复旧服务，未计为验收通过。Preview 有现成部署保护，未更改保护设置。最终使用上一轮相同的三个运行变量值随 CLI 生产部署传递；项目级环境变量、DNS、Domains 均未修改。转录、复制和下载曾在上一候选生产部署完整通过；最终版本的回归结果见下节，不能算全部验收通过。

未添加重定向；www 与旧默认域名跳转问题按要求留待以后。旧默认域名仍可访问，但页面 canonical 恒为正式域名。

本轮开始前已有上一轮未提交的功能与实验文件，未撤销它们；冻结后端、主样式文件与平台配置没有本轮内容变化。提交按本轮所涉及文件收敛；仍未提交的既有文件保留在工作树。

## 未通过项：E 最终生产功能回归

最终部署共实际提交三次：DeejOF4AfBe 两次，DbgNy0XxMZH 一次。均为 HTTP 502；浏览器显示 `This Reel could not be retrieved. It may be unavailable or restricted. Try another public Reel.`。等待与错误状态正常恢复。原始请求日志存为 `final-runtime-logs.jsonl`。

前一候选生产部署的真实转录、复制、SRT 下载成功证据仍有效，但不能替代最终部署的 E 验收。因此本轮静态修复已上线，**整体验收尚未全部通过**。

冻结后端的代码与本轮开始前逐字节相同；现有错误被统一映射，日志没有足够细节区分 Instagram 获取失败、转录上游错误或其他链路异常，不能据此断言根因。没有为通过验收修改后端、模型、阈值、时间戳、接口或重试策略。
