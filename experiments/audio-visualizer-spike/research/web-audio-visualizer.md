# zijipia/web-audio-visualizer 源码核查

核查日期：2026-10-25。浅克隆目录 `/tmp/av-spike-upstream-primary`；固定源码提交 `4b8a0b08d157ecb069d8c9fd61ea93354c83c19d`。结论基于源码和 GitHub API，README 仅作交叉核对。

## 结论

适合作为 Web Audio / Canvas 的参考，但原样不能保证 720×1280、30 秒、30fps、H.264/AAC MP4，且存在第二次录制丢失音轨的源码风险。代码实现了 MP4 探测和 WebM 回退，没有将 WebM 改名为 MP4。不存在离线逐帧导出实现。仓库已经归档。

## 技术栈、依赖

`package.json`：Next.js 16.1.6、React/React DOM 19.2.4、TypeScript 5.7.3、Tailwind 4.2、Radix UI/shadcn 风格组件、Lucide、Recharts、React Hook Form/Zod；有 `pnpm-lock.yaml`。视觉与录制的核心不依赖图形或转码库：原生 Web Audio API、Canvas 2D、requestAnimationFrame、MediaRecorder、MediaStream。

实际音频路径：`HTMLAudioElement → MediaElementAudioSourceNode → AnalyserNode(fftSize=8192) → GainNode → speakers + MediaStreamAudioDestinationNode`。每次 requestAnimationFrame 通过 `getByteFrequencyData` 和 `getByteTimeDomainData` 获取真实频谱/波形。Bars 和 Circular 在 `components/visualization-canvas.tsx` 中有实际绘制函数；背景图片从本地上传到对象 URL。

## 录制实现与缺陷

源码定位：[`video-export.tsx`](https://github.com/zijipia/web-audio-visualizer/blob/4b8a0b08d157ecb069d8c9fd61ea93354c83c19d/components/video-export.tsx)、[`use-audio-context.ts`](https://github.com/zijipia/web-audio-visualizer/blob/4b8a0b08d157ecb069d8c9fd61ea93354c83c19d/hooks/use-audio-context.ts)、[`visualization-canvas.tsx`](https://github.com/zijipia/web-audio-visualizer/blob/4b8a0b08d157ecb069d8c9fd61ea93354c83c19d/components/visualization-canvas.tsx)。

- `pickRecorderType` 第 23–29 行先检测 `video/mp4;codecs=avc1.42E01E,mp4a.40.2`；支持才选择 `.mp4`；否则尝试 VP8/Opus WebM。源码支持“条件性请求” H.264/AAC，不能单凭 MIME 请求证明实际文件编码，必须浏览器录制并 ffprobe。
- 第 97–110 行通过 `canvas.captureStream(30)` 和 `renderAudioStream.getAudioTracks()` 组成流，MediaRecorder 目标视频码率 8 Mbps、音频码率 192 kbps。因此有音频轨道的实现路径，但音轨为空时也继续录制，没有强制校验。
- `audio-visualizer.tsx` 第 155–161 行开始录制时 seek(0) 并异步 play()，没有等待 play Promise；错误被静默捕获。计时器按整首 duration 运行，播放起始延迟可能影响同步和尾部。
- 结束时对合并流所有轨道调用 `stop()`；音频轨道直接取自长期存活的 `MediaStreamAudioDestinationNode.stream`，没有 clone 或重建。因此有下一次导出复用 ended 音轨的风险。这是源码推断，需要连续导出验证，不能报告已实际重现。
- 导出画布第 1021–1022 行和第 1132 行硬编码 1920×1080；没有输出尺寸或 9:16 设置。
- 以实时播放 + requestAnimationFrame + setTimeout 录制，没有 OfflineAudioContext、VideoEncoder、WebCodecs、Mediabunny 或离线时间轴。不能保证帧数量或后台标签页帧率，导出耗时至少接近歌曲时长。
- `MediaRecorder` 不存在时的回退分支仍访问 `MediaRecorder.isTypeSupported`，兼容性处理不完整。

## 维护与 Issues

[GitHub API](https://api.github.com/repos/zijipia/web-audio-visualizer) 当日返回 `archived:true`，`pushed_at:2026-03-01T18:26:55Z`，`open_issues_count:0`，`license:null`；GitHub 源码网页显示作者于 2026-10-24 归档。当前 HEAD 提交时间为 2026-03-02 01:26:52 +0700，即上述 UTC 日期。

[`issues?state=all&per_page=100`](https://api.github.com/repos/zijipia/web-audio-visualizer/issues?state=all&per_page=100) 返回的 23 条均为已关闭 PR，没有普通 Issue；不能将“零开放 Issue”解读为没有缺陷。PR #1/#25 的作者测试记录提到 lint 缺少 ESLint flat config、生产 build 获取 Google Fonts 的 TLS 失败；这是历史报告，和本次实际运行结果分开处理。

## 许可核查

README 第 119–121 行声明 `MIT © Ziji`，但仓库没有完整 `LICENSE` 文本，package.json 没有 license 字段且标记 `private:true`，GitHub 未识别许可证。应表述为“作者声明 MIT，许可文本打包不完整”，不能简单断言无许可，也不应把它当作商业许可审查已通过。若复制源码进入商用工程，应取得完整许可文本并保留版权/许可声明。

通过 npm registry 对所声明的直接依赖版本逐项查询：绝大多数为 MIT；`class-variance-authority` 和 `typescript` 为 Apache-2.0；`lucide-react` 为 ISC；`@vercel/analytics@1.6.1` 为 MPL-2.0（需要考虑文件级源码和通知义务）。`postcss@8.5.6`、`@types/node@22.19.3` 元数据为 MIT。该步骤是包元数据核查，不是全部传递依赖、图标素材或字体的完整法律审计；范围版本的实际解析以 lockfile 为准。核心录制不需要 analytics、整套 UI 依赖或 Recharts。

元数据示例：[Analytics](https://registry.npmjs.org/@vercel%2fanalytics/1.6.1)、[CVA](https://registry.npmjs.org/class-variance-authority/0.7.1)、[Lucide](https://registry.npmjs.org/lucide-react/0.564.0)。浏览器自带 H.264/AAC 实现不等于本仓库提供了编解码器的专利授权。

安装后进一步读取本机实际安装的 187 个独立 package.json（包含传递依赖和当前 macOS x64 平台包）：MIT 154、ISC 16、Apache-2.0 7、MPL-2.0 3、BSD-3-Clause 3、LGPL-3.0-or-later 1、CC-BY-4.0 1、0BSD 1、MIT AND ISC 1。需额外关注 `@img/sharp-libvips-darwin-x64@1.2.4` 的 LGPL-3.0-or-later（Next 服务端图像依赖）、`lightningcss@1.31.1` 与平台包的 MPL-2.0、`caniuse-lite@1.0.30001769` 的 CC-BY-4.0、`victory-vendor@36.9.2` 的 MIT AND ISC。这里只覆盖当前平台安装闭包，没有验证所有可选平台二进制或逐文件版权。`images.unoptimized:true` 不等于依赖树中不存在 sharp。

## Vercel 与浏览器风险

工程本身是标准 Next.js，录制发生在客户端，不需要 Vercel Serverless 运行 30 秒编码任务，从架构上可以部署。尚未证明真实部署成功。`app/layout.tsx` 使用 `next/font/google`，构建依赖字体下载；`next.config.mjs` 的 `typescript.ignoreBuildErrors:true` 会掩盖类型错误，不能将 build 成功当作类型检查通过。README 的 Node ≥18 与当前 Next 16 的版本要求也应独立核对。

Chrome / Android Chrome 必须逐 MIME 检测，MediaRecorder 对 MP4/H.264/AAC 的实际支持取决于浏览器版本、平台及编解码器。移动端还有内存、热降频、标签页后台节流、AudioContext 用户手势限制。30fps captureStream 是采样请求，不能保证每秒实际输出 30 帧。Android 真机未由本次源码审计测试。

## 本次实际运行

安装与启动的完整原始日志分别保留于 `../evidence/upstream-install.txt`、`../evidence/upstream-start.txt`。`pnpm install --frozen-lockfile` 完成包下载后，因为 pnpm 11 默认阻止未批准的 `sharp@0.34.5` 安装脚本，返回退出码 1。`pnpm dev` 触发相同安装检查再次失败。回退 `npm run dev -- --hostname 127.0.0.1 --port 3001` 后，Next.js 于 2.3 秒 Ready；实际请求 `http://127.0.0.1:3001` 返回 HTTP 200（首次编译 6.0 秒，完整请求 6.2 秒）。没有修改上游源码，也没有批准执行被阻止的安装脚本。本文件不将作者 PR 的测试陈述计作本次验证；导出实测由主验证记录负责。
