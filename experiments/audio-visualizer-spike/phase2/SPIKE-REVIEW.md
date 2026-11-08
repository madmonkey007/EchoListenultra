# 原 Spike 只读复核

复核日期：2026-10-26。范围：原 README、REPORT、LICENSES、src、配置及旧 evidence。未重新运行会覆盖原 evidence 的浏览器/媒体验证入口，也未修改媒体实现或既有业务。此文件记录的是原 Spike 基线；Phase 2 新部署、支付和响应头变更应另看本阶段报告。

## 已重新核验的媒体事实

使用现有 `node_modules/ffprobe-static/bin/darwin/x64/ffprobe` 对五份旧 MP4 重新探测，而非只阅读 README。

五份全部为 MP4 容器（ffprobe format_name 为 `mov,mp4,m4a,3gp,3g2,mj2`），含 H.264/avc1 视频流与 AAC/mp4a 音频流。视频均 720×1280、30/1 fps、900 帧；音频均 48kHz、双声道；容器、视频流、音频流均 30.000000 秒。没有发现改 WebM 后缀的情况。

重新计算每份 SHA-256，均与旧 `evidence/media-validation.json` 的分析对象匹配：

| 文件 | SHA-256 |
|---|---|
| export-1.mp4 | 81f162339c84f6e3a2588344b2b2ce59747c47f99f8c1731a090055f7e162043 |
| export-2.mp4 | 17196e8216e241a9f6f9585f835d7f7b52644f5d17d285036e3d50a2e4404de8 |
| export-3.mp4 | 284c26a95232ed1c954340f38ea9047e98e3415f51169effa038c4f17af30fa6 |
| export-4.mp4 | 168f83815adf5eebbb21a3a8bea77943e5c5e74bc510df74777ca5bef4c111f4 |
| export-5.mp4 | 3032c508564061794267a9acc8c78188b829cb6c59bf6c7655653946afd4017a |

用 Python importlib 加载 `scripts/verify-media.py`，只调用 `decode`、`align_block`、`visual_check(save_pngs=False)`；未调用会写回 JSON/截图的 `main()`。已重新以 FFmpeg 解码原 WAV 及五份输出，在 0.1、13、26 秒的三个 3 秒区块互相关，并重新分析每份的 25 个视频采样帧：

| 文件 | 三段音频偏移 samples | 最低相关系数 | 最佳画面偏移 | 几何平均误差 px |
|---|---|---:|---:|---:|
| export-1.mp4 | 0 / 0 / 0 | 0.9996899819 | 0 帧 | 0.14299048 |
| export-2.mp4 | 0 / 0 / 0 | 0.9996899819 | 0 帧 | 0.88271926 |
| export-3.mp4 | 0 / 0 / 0 | 0.9996899819 | 0 帧 | 0.14299048 |
| export-4.mp4 | 0 / 0 / 0 | 0.9996899819 | 0 帧 | 0.88271926 |
| export-5.mp4 | 0 / 0 / 0 | 0.9996899819 | 0 帧 | 0.14299048 |

这支持旧报告针对自制 48kHz 双声道测试素材的音频 0ms 偏移/漂移及画面同步结论。Circular 测量排除了可能超出画布的近水平线；并非完整全帧视觉质量评价。原始 AAC 解码仍含尾部 14.667ms 包填充，30 秒指 MP4 呈现时长。未人工听音，也未覆盖第三方播放器和 Android。

旧 `browser-results.json` 记录同页五次导出、无 page/console 错误、6.1307–6.3725 秒、真实播放中频谱变化；本轮没有重跑这五次计时，不能视作新的稳定性测试。旧 `production-smoke.json` 仅证明 localhost preview 生产包上传 MP3/PNG、导出及 video 解码，不能证明 Vercel 上线。旧内存结果、失败日志及修复历史应继续原样保留。

## 实现与许可核对

- `main.ts` 将上传音频通过 `decodeAudioData` 完整解码为 PCM；AudioBufferSource 播放，预览按播放时间读取同一 PCM 作 FFT。Bars/Circular 和图片加载路径确实存在。
- `export.ts` 使用 Mediabunny `Mp4OutputFormat`、`CanvasSource(codec:'avc')` 与 AAC 已编码包音轨；逐帧时间为 frame/30，不是实时录屏。`BufferTarget` 在内存形成最终 MP4。
- `audio.ts` 对当前采样率/声道数缓存编码器校准 Promise，实际编码/解码脉冲测量 AAC priming，调整包时间戳并保留负时间戳解码前置包，交由 MP4 edit list 控制呈现。旧环境的 2112 samples 校准并非硬编码常量。仍需要目标手机 AudioDecoder 能工作。
- 原型代码独立原创，未拷贝首选上游源码；依赖确为 Mediabunny 1.62.1、Vite 6.4.5、TS 5.8.3。FFmpeg/ffprobe/Playwright 属本地验证工具，不被 src 导入。
- `LICENSES.md`、浏览器公开 THIRD-PARTY-NOTICES 及 MPL-2.0 全文存在。商业化应保留 Mediabunny 对应源码获取途径和 MPL 通知。包元数据清单不是逐文件法律审计；FFmpeg 工具许可及 H.264/AAC 专利地域问题仍是原报告已声明的待复核事项。本轮未重新做上游仓库维护情况和法律审查。

## 静态 Vercel 与响应头判断

以下是对现有代码的工程判断，不是生产 URL 实测结果：

- 原 `vercel.json` 已指定 `npm ci --ignore-scripts`、`npm run build`、`dist`、Vite；应使用独立项目 Root Directory，保留许可文件。上传和编码都发生浏览器，不需要 Function 处理媒体。
- src 无 Worker、SharedArrayBuffer、FFmpeg wasm 或运行时跨域 CDN。现方案不依赖 crossOriginIsolated，不需要为了编码强加 COOP/COEP；开启跨域隔离反而需要重新验证未来支付跳转/外部资源行为。
- WebCodecs 需 HTTPS/localhost；Vercel HTTPS 解决安全上下文传输条件，不能给设备增加 AAC/H.264 编码器。
- 安全响应头可以在独立项目中加入，例如 nosniff、Referrer-Policy、frame-ancestors；这不等于已有线上返回这些头。若加 CSP，需允许同源 JS、当前内联 style、图片 Blob URL，以及下载/视频校验的 Blob URL。示例策略应从 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` 起验证，不能直接视作已测兼容。
- 当前无 Worker 配置需求。以后把 OffscreenCanvas/WebCodecs 移入 Worker 时再检查 Worker 打包 URL、CSP worker-src 和设备支持，不能据此宣称当前移动内存问题已经解决。

## 支付商业化边界

原 Spike 没有订单、服务端、回调、权限或支付服务。`window.spike.export()` 还公开真实导出入口，代码无付费检查；目前不能声明任何真实或沙盒支付闭环。

即使未来隐藏按钮、删除诊断入口，已经送达用户浏览器的渲染和模板代码仍可由开发者工具、修改本地 JS 或直接调用底层模块绕过。服务端订单/回调验签、Webhook 幂等、退款状态和权限 token 能保护服务端交付权益，但无法让纯客户端渲染成为可靠的计次收费边界。该商业风险需要产品决策明确接受，或另设实际由服务端控制的资产/渲染交付。

## 本轮限制

未进行 Vercel 账号/线上 URL 检查、Android 真机接入、支付商户资格核查或支付沙盒。本轮没有重建应用，也没有新导出媒体。上述结果供主任务集成，不能替代其生产构建、部署与支付验收。
