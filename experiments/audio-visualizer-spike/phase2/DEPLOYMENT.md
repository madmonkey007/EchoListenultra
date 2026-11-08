# 独立 Vercel 部署记录

- 新项目：`ponymads-projects/audio-visualizer-spike-20261026`
- 生产别名：https://audio-visualizer-spike-20261026.vercel.app
- 本轮不可变部署：https://audio-visualizer-spike-20261026-1h0hw3kbt-ponymads-projects.vercel.app
- Deployment ID：`dpl_HMLW13gyscS2LZywrjo8JK4jE9Bg`
- 状态：READY，target=production；部署与浏览器检查2026-10-26。

本轮通过显式team/project链接到Spike目录，新建项目而非复用业务部署。没有执行业务域名绑定、业务项目设置或根vercel.json修改。`.vercel/project.json`仅本地忽略保存；Vercel CLI自动生成的`.env.local`含OIDC凭据，已被gitignore/vercelignore排除，不能上传或提交。

## 构建与上传

Install：`npm ci --ignore-scripts`；Build：`npm run build`；Output：`dist`；Framework：Vite。真实云构建下载21个部署文件，npm安装约4秒，Vite构建1.11秒，Build Completed约5秒，随后READY。保留CLI版本差异：本机58.4.4，云构建65.1.0。npm有cache-dir未知环境配置警告，但构建退出成功。

`.vercelignore`排除旧evidence、本阶段phase2、research、脚本、测试、.env*、本地数据库和node_modules/dist等。只发布渲染网页、必要public素材及许可证通知；浏览器请求`/evidence/export-1.mp4`、`/phase2/evidence/original-evidence-sha256.json`、`/.env.local`实际均404。支付server/测试与密钥没有部署。

初次指定personal username作scope被CLI拒绝；查询现有团队后使用用户已有团队ponymads-projects成功。失败与成功日志分别保留，未把失败当作权限不可用而停止。

## 隔离头、Worker与CSP

当前CanvasSource/AudioBufferSource逐帧链路不要求SharedArrayBuffer或cross-origin isolation。源码库存在其他路径的Worker/SAB helper，这不代表当前链路必须使用它们。生产实测`crossOriginIsolated=false`、COOP/COEP均未设置，15/30秒导出仍成功；脚本记录本轮观察到的Worker清单，不将可选能力当成强制部署要求。

独立项目设置：nosniff、X-Frame-Options DENY、Referrer-Policy no-referrer、camera/microphone/geolocation禁用，以及CSP：

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self';
worker-src 'self' blob:; object-src 'none'; base-uri 'none';
frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests
```

本轮源码有内联style，因此style-src允许它；没有开放unsafe-eval/内联script。blob允许本地图片、生成视频及库可能使用的Worker，不要求增加Worker入口/部署服务。支付后续若集成hosted Checkout导航，应单独核实跳转与CSP；不能把本轮renderer CSP当成所有未来支付集成的兼容证明。

真实线上上传、播放、频谱变化、PNG背景、导出、下载、ffprobe及Chrome内解码都已测试；脚本和结果在`phase2/scripts/production-url.mjs`及`evidence/production-results.json`。未发送媒体给服务端。

## 再部署注意

从本Spike目录运行Vercel，并先核对本地projectId/projectName仍是上述独立项目。不要在业务根目录运行link/deploy，也不要复用业务`.vercel`、环境变量或数据库。当前支付后端主动拒绝VERCEL环境，且被上传忽略；真实支付上线需单独设计独立持久数据库与API部署，不可以临时文件或进程内存伪造订单持久性。
