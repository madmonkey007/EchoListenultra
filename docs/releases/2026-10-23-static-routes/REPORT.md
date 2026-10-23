# 独立静态路由 HTML 发布验收

日期：2026-10-23（北京时间）。正式站：https://reelstranscript.com/

部署：`dpl_39SBqUABCsVZpDfrRxmxf5Dove5h`，READY，Production。

## 不执行 JavaScript 的线上验收

所有结果来自独立 curl HTTP GET 原始响应，并与本次本地构建文件逐字节比较。没有用浏览器执行 JS 后的 DOM 代替服务端 HTML。

| 路径 | HTTP 状态 | 原始 HTML title | H1 数量 | canonical |
| --- | --- | --- | --- | --- |
| / | 200 | Instagram Transcript & SRT — ReelTranscript | 1 | https://reelstranscript.com/ |
| /about | 200 | About ReelTranscript | 1 | https://reelstranscript.com/about |
| /help | 200 | Listening guide — ReelTranscript | 1 | https://reelstranscript.com/help |
| /privacy | 200 | Data and privacy — ReelTranscript | 1 | https://reelstranscript.com/privacy |
| /contact | 200 | Contact and feedback — ReelTranscript | 1 | https://reelstranscript.com/contact |
| /tiktok-transcript | 200 | TikTok Transcript — Coming Soon \| ReelTranscript | 1 | https://reelstranscript.com/tiktok-transcript |
| /nonexistent-x9 | 404 |  | 0 |  |

六份 title 两两不同，description 也两两不同。完整描述与 H1 文字见 `production-checks.json`，每条路径原始 HTML 保存在同目录。

`/nonexistent-x9` 是真实 HTTP 404，不是 200 状态的首页或前端错误页。缺失静态资源与未知 API 路径也不再被通用 SPA 规则改写为首页。

## 改动

- `lib/static-seo.ts`：构建时用已有 React 信息页组件预渲染五份独立 HTML，沿用已构建的脚本和 CSS；没有增加常驻 SSR 后端。
- `lib/render-public-pages.tsx`：复用信息页组件和现有导航、页脚；按路径注入共享元信息，替换首页静态正文；首页输入原样返回。
- `lib/site-meta.ts`：公开路径元信息为静态生成与客户端共用；新增未来 TikTok 页的独立标题、描述。
- `views/AboutView.tsx`、`HelpView.tsx`、`PrivacyView.tsx`、`ContactView.tsx`：各自 H1 明确对应页面主题；原有正文组件继续复用。
- `views/TikTokTranscriptView.tsx`：如实说明 TikTok 转录“即将推出、尚未可用”。返回 200、独立 canonical，并设置 noindex；暂不加入 sitemap，不宣称现有功能支持 TikTok。
- `App.tsx`：加入对应客户端路由，并保持这个已知未来页面的 canonical 与静态 HTML 一致。首页元信息取值不变。
- `vercel.json`：删除所有未知路径都回首页的通用规则；五个信息页精确指向各自 HTML。仅已有工具、登录与播放器路径保留 SPA 回退。函数配置和已有响应头保持原值。
- `tests/prerender.test.cjs`：检查六页原始 HTML、唯一 H1、独立元信息、首页原样返回与未知路径不回退。
- `tests/import-release.test.mjs`：保留缺失静态资源不可回退的原断言，适配精确路由规则。

## 首页与冻结范围

`index.html`、首页组件、`website.css` 和转录后端／时间戳引擎源码校验值均未改变。首页构建后的 HTML 仅应用脚本文件名随新增路由而变化，原 TDK、canonical、H1、示例区 HTML 与全部其他内容均相同。CSS 文件名和内容仍为 `index-rBboKxPm.css`。

本轮未调用转录模型或重跑转录实验。没有修改下载、模型、字节阈值、时间戳、SRT、接口契约或平台环境变量设置。

## 验证

- 先运行新增测试，捕获缺失预渲染与通用回退两项失败，再实现修复。
- 生产构建、类型检查通过；109 项测试全部通过。
- curl 检查六个已知路径与一个未知路径全部通过。
- 未重新引入旧平台默认域名或浏览器端 Tailwind CDN。

构建时的 React Router ESM 解析与 Node 24 的 module-sync 条件保持一致；只在构建期启用，并关闭临时渲染器的依赖扫描，渲染结束即释放它。

原有其他未提交功能／实验文件保留，不纳入本轮代码修改。上一轮转录链路 502 的诊断不在本轮范围，未以本次静态路由验收替代转录功能验收。
