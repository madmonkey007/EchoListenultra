# 尾斜杠 301 规则发布记录

日期：2026-11-09（北京时间）。正式站：https://reelstranscript.com/

**状态：规则已实现并通过本地验证；未部署。** 下一部署上线后，带尾斜杠
的页面 URL 才会从 404 变为 301。README 约定部署是独立步骤。

## 问题（部署前线上实测，curl 原始响应）

| 路径 | 实际状态 | 期望 |
| --- | --- | --- |
| /instagram-reel-transcript/ | 404 | 301 → /instagram-reel-transcript |
| /about/ | 404 | 301 → /about |
| /instagram-reel-transcript（无斜杠） | 200 | 不变，规范形 |

sitemap.xml 全部使用无尾斜杠 URL（规范形以此为准），但页面是平铺
`*.html` 加 `rewrites` 提供服务，`/about/` 这类带斜杠请求不命中任何
rewrite，直接 404。外部链接只要多带一个斜杠就是死链。

## 规则

**带尾斜杠的版本 301 永久跳转到无斜杠版本，绝不反向**；sitemap 无斜杠
形式是规范形。根路径 `/` 不参与重定向。

## 改动

- `vercel.json`：`redirects` 新增 10 条（about/help/privacy/contact/
  tiktok-transcript/instagram-reel-transcript/reels-transcript/
  instagram-reel-transcript-generator/instagram-video-transcript/settings），
  形如 `{"source": "/about/", "destination": "/about", "permanent": true}`。
  Vercel 中 `permanent: true` = 301（`false` 才是 302）。redirects 在
  rewrites 之前执行，所以链路是：`/about/` → 301 `/about` → rewrite 返回
  about.html。原有 `/index.html → /` 保持不变。
- `tests/trailing-slash.test.cjs`：新增 3 项测试——sitemap 每个页面都有
  斜杠→无斜杠的 301；不存在反向/自环重定向、根路径不重定向；每个重定向
  目标仍有对应 rewrite（先跳转后服务）。

## 无自环风险的平台级证据

用 Vercel 官方路由编译器 `@vercel/routing-utils` 的 `sourceToRegex` 编译
全部 10 个 source：`/about/` 编译为严格锚定正则 `^\/about\/$`（其余同
构）。因此带斜杠请求命中跳转；无斜杠请求**不命中**重定向，落到原有
rewrite 正常返回 200，不可能形成重定向环。目录型静态资源（`/assets/`、
`/demo/`）与 API 路径不在规则内，行为不变。

## 验证

- `npm test`：146/146 通过（全套件，含新增 3 项），8.7s。
- 线上部署前探针记录见上表（2026-11-09 实测）。
- 未部署：正式站此刻仍返回 404；本次改动进入下一部署后生效。

## 部署后验收清单（上线时执行）

```sh
curl -sI https://reelstranscript.com/about/                 # 期望 301, location: /about
curl -sI https://reelstranscript.com/instagram-reel-transcript/  # 期望 301
curl -sI https://reelstranscript.com/settings/              # 期望 301
curl -sI https://reelstranscript.com/about                  # 期望 200（不跳转）
curl -sI https://reelstranscript.com/                       # 期望 200（根不受影响）
```
