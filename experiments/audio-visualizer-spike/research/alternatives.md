# 备选项目源代码审查：phase-viz / cymatic

审查日期：2026-10-25。方法：真实 clone 默认分支，检查 package/lock、LICENSE、导出实现和渲染调用方；另查 GitHub Issues。以下是静态源码结论，不等于两个上游已经通过本机/Android 导出测试。没有在本任务分支修改或执行两个上游的应用代码。

## 结论

- **phase-viz 最接近完整的纯浏览器 MP4 参考实现**：存在真实 AVC/H.264 视频编码、AAC 音频编码、MP4 容器 mux、固定时间逐帧渲染。可参考其导出策略，但要避免直接引入完整大型 UI 和 GPL ffmpeg core。其 ffmpeg 后备允许 MPEG-4 Part 2，因此“成功下载 MP4”仍不能证明满足 H.264 验收条件。
- **cymatic 更适合作为确定性渲染/DSP 参考**：离线渲染存在，但导出模块只产生压缩视频 chunks 或 PNG；没有集成 MP4 mux、AAC 编码或原始音轨合成。README 所谓 in-browser export 不能视为已完成浏览器端有声 MP4。还需要自己接 Mediabunny/WebCodecs 或另一套 mux 管线。

## 1. 7g3n/phase-viz

源代码快照：`6f50cdd9054861459af1ca9228a9df0d119d4c9e`，提交时间 `2026-07-01T18:17:46+09:00`，提交标题为合并 export-preset-speedups PR。审查时 GitHub 页面显示 55 commits、6 open issues、1 open PR。最近提交约四个月前；规模较小，不能以 star 或提交次数推断稳定性。

### 技术栈及依赖

以 [package.json](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/package.json) 和 [package-lock.json](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/package-lock.json) 为准：React 19.2.4、TypeScript 5.9、Vite 8、Three.js 0.184、React Three Fiber 9.6、Drei 10.7、WebGL/Canvas2D/Web Audio、MUI/Emotion、Zustand。导出依赖 mp4-muxer 5.2.2、@ffmpeg/ffmpeg 0.12.15、@ffmpeg/core 0.12.10、@ffmpeg/util 0.12.2。大型依赖及复杂场景增加 bundle、GPU 和内存压力，不是最低 Bars/Circular spike 必需。

### 实际 MP4、H.264、音轨及逐帧路径

[webcodecs.ts](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/src/export/webcodecs.ts)：

- `canUseWebCodecsMP4()` 检查 VideoEncoder/VideoFrame/AudioEncoder/AudioData；随后调用两个 `isConfigSupported` 检查 AVC 和 AAC，而非只检测 API 存在。
- `Muxer` 声明 video codec `avc`、audio codec `aac`；VideoEncoder 按 AVC 候选 codec 配置，AudioEncoder 用 `mp4a.40.2`、192 kbps。输出回调分别 `addVideoChunk` / `addAudioChunk`，最后 finalize 真正 MP4。
- 帧循环 `frame < ceil(duration * fps)`，`time = frame / fps`，调用 `renderFrame(time, frame)`，显式 VideoFrame timestamp/duration；不是实时录屏换扩展名。
- AudioBuffer PCM 被分块交给 AudioEncoder；存在 flush、超时、空音轨检查、编码队列限制和 finally close。保留音乐内容但 AAC 有损重编码，并非原压缩码流逐字节保留。
- ArrayBufferTarget 仍在内存保存整个 MP4；移动设备和长音频需专门验证。

[WaveVisualizer.tsx](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/src/ui/WaveVisualizer.tsx) 的 `renderExportFrames` 在约 190 行以后，设置导出 canvas 宽高、加载背景图片，`drawFrame` 使用 `sampleAudioBufferFrameInto(..., time, ...)` 取音频数据后绘图；失败时转 ffmpeg。另有 VisualizerCanvas/ImageFX 的导出调用。音频分析有真实 FFT：[analyze.ts](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/src/audio/analyze.ts) / [fft.ts](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/src/audio/fft.ts)。这证明存在离线音频采样和逐帧实现，不证明视觉和原音频已经人工比对同步。

[ffmpeg.ts](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/src/export/ffmpeg.ts) 的后备先生成 JPEG 序列、PCM WAV，再执行 ffmpeg。`encodeMP4WithFallbacks` 先用 `libx264`，失败后尝试 `mpeg4`；音频 `-c:a aac`，`yuv420p` 和 `+faststart`。第二个成功结果为 MP4 容器但不是 H.264。若复用，必须移除该后备或明确报告实际 codec。

### 许可证

[项目 LICENSE](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/LICENSE)：MIT，版权 2026 Nagisa Dozono，允许商业使用，须保留许可和版权声明。直接依赖 lock 声明：

| 依赖 | 锁定版本 | 声明许可 |
| --- | --- | --- |
| @ffmpeg/core | 0.12.10 | **GPL-2.0-or-later** |
| @ffmpeg/ffmpeg / util | 0.12.15 / 0.12.2 | MIT |
| mp4-muxer | 5.2.2 | MIT |
| postprocessing | 6.39.1 | Zlib |
| @fontsource/roboto | 5.2.10 | OFL-1.1 |
| React / React DOM / Three / R3F / Drei / MUI / Emotion / Zustand / @types/three | 见 lock | MIT |

整个 lock（包括开发、可选和非最终 bundle 包）的许可声明计数：MIT 256、Apache-2.0 20、ISC 14、MPL-2.0 12、BSD-2-Clause 6、BSD-3-Clause 6，其余含 GPL、OFL、BlueOak、Python、CC-BY、Zlib、0BSD；两项无声明（包括根条目，不能直接理解成两个未知生产依赖）。这是元数据盘点，并非最终 browser bundle 法律审计。**项目 MIT 不覆盖 wasm 编解码 core 的 GPL**；不能把 @ffmpeg 包装层 MIT 当成 core 许可。官方 [@ffmpeg/core package](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/core/package.json) 同样声明 GPL-2.0-or-later。商业使用本身不被 GPL 禁止，但实际分发 core 及其构建、源码提供等义务需单独处理。优先仅采用平台 WebCodecs + MIT muxer 路径，可减少这部分许可负担；H.264/AAC 专利不属于开源代码许可证所授予的权利。

### 维护与风险

[Issues](https://github.com/7g3n/phase-viz/issues) 审查时仍有 #6 长 MP4 资源估计/guardrails、#4 音频及导出自动测试、#3 窄屏响应式、#2 object URL 和 AudioContext 清理等未关闭问题，均于 2026-06-14 创建。它们直接关联本 spike 的移动端、重复导出及内存验收。没有声称“已有完整自动导出测试”。

### Vercel / Chrome / Android

- 源码是 Vite 静态客户端，理论上可用 Vercel static hosting：build `npm run build`，output `dist`。现有 [vite.config.ts](https://github.com/7g3n/phase-viz/blob/6f50cdd9054861459af1ca9228a9df0d119d4c9e/vite.config.ts) 和 wrangler 面向 Cloudflare，而非已有 Vercel 部署证明；需要选择满足 Vite 8 的 Node 版本。
- ffmpeg 先找 `/vendor/ffmpeg-core.js` / `.wasm`，找不到时用 jsDelivr；打包时生成 `.assetsignore` 排除 wasm（这是 Cloudflare 特定文件，不代表 Vercel 必然排除）。Vercel 上需要验证 wasm 资源是否实际上传、MIME、worker 路径和 CSP；资源未打包时依赖第三方 CDN，不能称为完全断网可用。
- 使用的是 single-thread @ffmpeg/core，不是 core-mt；不能不看实现就断言必须 SharedArrayBuffer/COOP/COEP。
- Chrome/Android Chrome：WebCodecs API 存在不保证设备支持 AVC encoder、AAC encoder 或指定分辨率。代码有能力检测和后备，后备 wasm 转码则 CPU/内存成本大；移动端 GPU、温控、后台标签暂停、保存下载和大文件解码都需实测。桌面固定 workspace 已有 #3。**本审查未进行上游 Chrome 或 Android 实机验证，也未部署 Vercel。**

## 2. coreyepstein/cymatic

源代码快照：`217f285645914866df7ca685a7194308a42fd430`，提交时间 `2026-06-02T19:54:09-06:00`，最近提交修复 WebGPU null adapter 时 WebGL fallback。GitHub 页面显示 35 commits，审查时 [open Issues](https://github.com/coreyepstein/cymatic/issues) 为 0。约五个月无新提交且项目样本很小；0 issues 不能推断无问题。导出 package 版本还是 `0.0.0`，应当按早期库对待。

### 技术栈及依赖

[根 package](https://github.com/coreyepstein/cymatic/blob/217f285645914866df7ca685a7194308a42fd430/package.json)：pnpm 9.15.4 workspace + Turbo 2.3.3、TS 5.7.3、ESM。`@cymatic/core` 为 WebGPU / WebGL + Web Audio 的无外部运行时依赖内核，另有 presets、React binding、export；gallery 为 React/React DOM 18.3.1、Vite 6.0.7。测试工具 Vitest、Playwright。库的包构建是 `tsc -b`，gallery 是 Vite，静态托管需要先构建 workspace 依赖。

### 实际导出能力：差距不能被 README 隐藏

[render-offline.ts](https://github.com/coreyepstein/cymatic/blob/217f285645914866df7ca685a7194308a42fd430/packages/export/src/render-offline.ts) 真实按 `round(duration * fps)` 帧执行：OfflineSampler 采音频特征、preset.update、frameSource.capture、sink.writeFrame；固定 `index/fps` 时间并可设 seed。库有 frame count / deterministic 测试，但测试通过与真实 MP4 合成是不同验收。

[webcodecs-encoder.ts](https://github.com/coreyepstein/cymatic/blob/217f285645914866df7ca685a7194308a42fd430/packages/export/src/webcodecs-encoder.ts) 默认 codec `avc1.42001f`、5 Mbps，用 VideoEncoder / VideoFrame 编码 RGBA。关键事实：

- `isWebCodecsAvailable` 只做 VideoEncoder/VideoFrame 存在检查，**没有** `VideoEncoder.isConfigSupported` 探测默认 H.264 配置。
- sink 将 EncodedVideoChunk 保存在 `chunks` 并回调 `onChunk`；没有 MP4 muxer、没有 AAC AudioEncoder，也没有可直接下载的完整 MP4 容器。
- 没有编码队列 backpressure，长任务还会一直保留 chunks；移动端需要补强。
- [AUDIO-MUX.md](https://github.com/coreyepstein/cymatic/blob/217f285645914866df7ca685a7194308a42fd430/packages/export/AUDIO-MUX.md) 明确把音轨合成委托给外部 ffmpeg CLI：PNG→H.264/AAC，或用户已 mux 的 silent.mp4 再 `-c:v copy -c:a aac`。这不是仓库已集成的纯浏览器有声 MP4。

因此，支持离线逐帧渲染 = 是；支持 H.264 编码调用 = 是（平台支持时）；内建可下载 MP4 + AAC + 原音轨 = **否**。`supportedFormats = [png-sequence, mp4, webm]` 是声明，不能替代容器和音频实现证据。

### 许可证

[根 LICENSE](https://github.com/coreyepstein/cymatic/blob/217f285645914866df7ca685a7194308a42fd430/LICENSE) 和所有内部包均 MIT（2026 Corey Epstein），可商用并保留版权和许可。core 无外部生产 dependencies；export/presets 依赖内部 core；react binding 有 React peer，gallery React/DOM 均 MIT。开发工具常见 MIT/Apache/ISC 不应混同最终分发代码。pnpm lock 不提供完整逐包许可字段，本审查**未完成所有开发/可选/传递依赖实物 LICENSE 审核**；若正式采用，应安装后输出实际 production bundle SBOM 和 notices。文档里的外部 ffmpeg 不是已随库分发的依赖；若增加 ffmpeg.wasm，必须另做 core 许可审查，不能沿用 cymatic MIT 结论。

### Vercel / Chrome / Android

- gallery 是纯 Vite 前端，多入口 HTML 及内部 workspace imports；可在 Vercel 设置 pnpm 安装、先构建库、gallery 构建、输出 `apps/gallery/dist`。没有发现必须后端视频服务的代码，但补齐 mux/audio 才能满足本任务。**未实际部署或执行其构建**。
- WebGPU 不可用时已有 WebGL fallback；WebGL 下 bloom/feedback 等 post-FX 不同，不能保证视觉一致。
- Android Chrome 设备的 WebGPU、纹理限制、读回 GPU 像素成本、H.264 encoder 支持都需探测；当前仅 typeof 的能力检测不足。不应宣称 Android 有声 MP4 可用。**本审查未实测 Android/Chrome。**

## 审查失败与限制记录

- 通过 web tool 读取 GitHub API issues URL 返回 Internal Error；curl API 尝试未获得 JSON，Python json.load 报 JSONDecodeError。已改查 GitHub HTML Issues 页面，未以 API 失败当作无 Issues。
- 两仓库均成功 clone 并检查 HEAD。这里只进行了源代码与公开页面审查，未生成它们各自的测试 MP4，未运行上游构建/测试，也未做完整供应链法律审计。实验工程导出验收应由 spike 自己的浏览器运行日志、ffprobe 和五次连续测试提供。
