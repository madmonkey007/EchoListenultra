> 2026-10-27：效果扩展为 8 种，已在独立生产站逐一完成 30 秒有声 MP4 导出验证。详见 [模板测试报告](templates/REPORT.md)。

# Audio Visualizer 技术 Spike

第二阶段（2026-10-26）：独立生产地址 **https://audio-visualizer-spike-20261026.vercel.app** 已通过桌面 Chrome 线上上传/播放/15秒及30秒有声 MP4 导出测试。见 [线上与支付验证报告](phase2/REPORT.md)。Android 真机仍未验证；支付只有本地服务端合同测试，真实 Stripe 沙盒创建受邮箱缺失阻塞，未启用真实收款。原始 `evidence/` 保持不变，新证据位于 `phase2/evidence/`。

独立实验工程；未修改 EchoListenultra 业务代码。支持本地 MP3/WAV、真实 PCM FFT 频谱、Bars/Circular、背景图片、固定 9:16。将前 30 秒在浏览器内逐帧导出为 **720×1280 / 30fps / H.264 + AAC / 真 MP4**。短音频按原长度输出；“保留原音乐”指音乐内容经 AAC 重编码保留，并非压缩码流逐字节复制。

## 本地运行

需要 Node.js 22 或 24、npm，以及支持 H.264/AAC WebCodecs 编解码器的 Chrome。使用 localhost 或 HTTPS；不能直接双击 HTML，也不要用 HTTP 局域网地址测试 WebCodecs。

```sh
cd experiments/audio-visualizer-spike
npm ci
npm run dev
```

打开 http://127.0.0.1:5178 。上传 MP3/WAV 或点击自制测试音乐按钮，选视觉效果、上传背景图片，播放预览，然后导出并点击下载。导出不需要实时播放。页面显示编码器能力、导出时间、帧数和 AAC 延迟校准结果。不支持所需编码器时明确报错，不会把 WebM 改名为 MP4。

`npm ci` 的 ffmpeg-static 下载可能较慢，它只用于本地验证。仅运行/构建网页可用 `npm ci --ignore-scripts` 避免该下载；这时媒体分析前需要另装 FFmpeg 或正常重装验证工具。所有依赖独立于根工程。

## 交付和结果

- 测试视频：[Bars MP4](evidence/export-1.mp4)、[Circular MP4](evidence/export-2.mp4)、[MP3 输入生成的 MP4](evidence/mp3-input.mp4)。均由浏览器生成，FFmpeg 只做测试素材转码/导出文件解码检查。
- 完整技术结论、通过/失败/未验证、成本和风险：[REPORT.md](REPORT.md)。
- 上游源码核查：[Web Audio Visualizer](research/web-audio-visualizer.md)、[phase-viz 与 cymatic](research/alternatives.md)。
- 许可、通知和源码提供：[LICENSES.md](LICENSES.md)。原型原创代码 MIT；测试音乐、背景为原创 CC0。
- 原始证据：`evidence/browser-results.json`、`media-validation.json`、五个 `*.ffprobe.json`、截图及失败日志。

## 重现测试

测试假定当前目录为本工程，端口 5178 的开发服务器持续运行；浏览器脚本使用本机安装的 **Google Chrome**（Playwright 的 `channel: 'chrome'`）。Linux CI 需自行安装 Google Chrome，不能把无专有编解码器的 Chromium 结果视作相同环境。

```sh
npm test
npm run typecheck
npm run build
npm run verify:browser
```

最后一条会上传 WAV/SVG、播放真实音频、检查频谱随时间变化，并在同一页面连续导出五次，下载并用 ffprobe 检查每份文件，再测试 MP3 解码与播放。图像测试还检查真实背景像素变化和已处理的错误。浏览器录制为 headless 模式，未做人工听音。

独立解码验证（运行在五次导出之后）：

```sh
python3 -m venv .venv
.venv/bin/pip install numpy
.venv/bin/python scripts/verify-media.py
```

此脚本对原始 WAV 与导出 AAC 的头、中、尾做互相关，检查延迟、漂移、相关系数；解码视频帧，用独立 NumPy FFT 计算 Bars/Circular 的预期几何，检查帧同步。需要正常安装的 `ffmpeg-static`。图形及声音都实际来自文件，不靠页面状态判断。

生产构建验证需另开终端运行 `npm run preview -- --port 5179`，然后 `node scripts/production-smoke.mjs`：上传实际 MP3 和 PNG，通过导出按钮生成视频，再用 Chrome 解码播放及 ffprobe 验证。

重新生成原创素材：`python3 scripts/generate-fixture.py`、`node scripts/generate-mp3.mjs`。PNG 在 production-smoke 中由原创 SVG 栅格化生成。`public/FIXTURE-LICENSE.md` 说明音乐和同步标记。

单独检查任意输出：

```sh
ffprobe -v error -show_streams -show_format -of json evidence/export-1.mp4
```

没有系统 ffprobe 时：`node -p "require('ffprobe-static').path"` 获取本机工具路径。

## Vercel

建立一个独立项目，Root Directory 设为 `experiments/audio-visualizer-spike`，使用本目录 `vercel.json`：Install `npm ci --ignore-scripts`、Build `npm run build`、Output `dist`，Node 22/24。已在干净目录验证同样的安装/构建步骤；第一阶段未实际部署；第二阶段已新建独立项目并完成线上验证，详见 [DEPLOYMENT.md](phase2/DEPLOYMENT.md)。本轮 CLI 从 Spike 目录上传，因此新项目 Root Directory 显示为 `.`；若通过 Git 导入整仓才使用前述子目录设置。Android 真机仍未验证。

这是静态站点：媒体不上传服务器，编码发生在客户端，不占用 Vercel Function 时长。没有 FFmpeg wasm、SharedArrayBuffer、CDN 运行时依赖，当前方案不要求 COOP/COEP。需保留 `public/THIRD-PARTY-NOTICES.txt`、`public/licenses/`；构建会自动复制。手机必须通过 HTTPS 访问，浏览器编码器/内存不足依然会失败，静态部署不会改变设备能力。

## 工程结构

`src/main.ts` 负责上传/播放/交互；`spectrum.mjs` 负责 FFT；`render.ts` 负责两个 Canvas 效果；`export.ts` 管理固定帧时间与 MP4 输出；`audio.ts` 使用浏览器实际编码器测量 AAC priming，并通过负时间戳和 MP4 edit list 消除延迟、裁掉尾部填充。`delay.mjs` 的校准算法有已知延迟与失败用例测试。

原工程只被临时克隆到 `/tmp` 做源码核查、启动及原始导出；没有复制其业务或模板代码。基于首选项目的实现审查后采用独立 Canvas/Web Audio 原型，避免继承其横屏、实时录制和共享音轨生命周期问题。

## 第二阶段验证入口

```sh
node --test phase2/tests/*.test.mjs
node phase2/scripts/payment-contract-smoke.mjs
node phase2/scripts/production-url.mjs
```

最后一条在上述真实生产URL测试并只写入新证据目录。支付脚本明确使用内存fake provider，不会联系Stripe/产生真实扣款，不能当作Stripe Sandbox通过。独立解码：`.venv/bin/python phase2/scripts/verify-production-media.py`（需numpy及正常安装的ffmpeg-static）。支付接口与私密环境注入见 [payment/README.md](phase2/payment/README.md)，真机未验证及待运行协议见 [ANDROID.md](phase2/ANDROID.md)。
