# Audio Visualizer 技术可行性验证报告

核查/运行日期：2026-10-25。结论：**纯 Web 的 30 秒 720×1280、30fps、H.264/AAC 有声 MP4 已在本机 Chrome 实际跑通，满足 Spike 的核心媒体链路；Android、真实 Vercel 部署和长音频资源边界仍未验证。** 实验与业务工程隔离，没有登录、支付、SEO、服务端渲染或正式产品界面。

## 选型与上游实际能力

| 项目 | 源码证据与维护 | 真 MP4 / H.264 / 音频 | 离线逐帧 | 本次取舍 |
|---|---|---|---|---|
| zijipia/web-audio-visualizer | Next16/React19/Web Audio/Canvas；2026-03 最新代码，2026-10-24归档；README声明MIT但缺完整LICENSE | MediaRecorder按MIME检测；本机实测H.264+AAC成功，其他环境可能回退WebM | 无；实时播放/录制 | 先真实启动/导出；横屏/帧率/音轨生命周期不符，未复制源码 |
| 7g3n/phase-viz | React/Vite/Three.js/mp4-muxer/ffmpeg.wasm；2026-07最近提交，6个开放Issues含导出测试/资源保护 | 源码有AVC+AAC+MP4；FFmpeg失败后可能回退MPEG-4 Part2 | 有 | 最接近完整参考，但UI/GPU依赖多；ffmpeg core为GPL，未引入 |
| coreyepstein/cymatic | TS/pnpm/Turbo/WebGPU/WebGL；2026-06最近提交，审查时0开放Issues | 默认视频AVC编码chunks，缺mux/AAC，文档要求外部FFmpeg合成 | 有 | 适合作渲染参考，不是现成有声MP4方案 |

每个仓库固定 SHA、实际依赖、源码链接、Issues、许可证边界、Chrome/Android/Vercel风险见 [首选项目核查](research/web-audio-visualizer.md) 与 [备选核查](research/alternatives.md)。phase-viz/cymatic未实际构建导出，表中不将源码路径当作实测成功。

首选项目的本次运行证据：原样克隆、安装、启动127.0.0.1:3001并HTTP200。pnpm因sharp构建脚本策略退出1，转npm启动成功。WAV上传被它明确拒绝；使用本次原创音乐的MP3版本再导出，生成真实 `upstream-original.mp4`，27.02MB，耗时30.868秒。ffprobe视频为1920×1080 H.264，平均帧率约26.77fps，视频29.700200秒、音频AAC29.992021秒，轨道结束时间相差约291.8ms。没有验证首选项目自身第二次导出；停止共享音轨的风险仍是源码推断，不伪称已重现。

因此没有采用“改后缀”的方案，也没有把上游的条件性MP4支持误写为完全不支持MP4。选择独立实现其通用Web Audio/Canvas思路，换用显式固定时间逐帧导出。

## 实验工程方案

Vite + TypeScript + Canvas2D + 原生 Web Audio / WebCodecs + Mediabunny 1.62.1。唯一浏览器媒体库为Mediabunny，未使用FFmpeg wasm，也没有服务端转码。

1. 用户MP3/WAV通过`decodeAudioData`转为原始PCM。播放使用AudioBufferSource连接扬声器；实时预览根据AudioContext当前播放时间提取同一PCM，做2048点Hann窗FFT。频谱由音频数据决定，没有随机/伪造动画。
2. Bars/Circular共享64个对数频带，背景cover裁切到720×1280；界面固定9:16，未开发多个尺寸/模板系统。
3. 导出时间显式`frame / 30`，30秒恰好900帧；每帧从PCM对应位置分析频谱，CanvasSource编码AVC。await每帧加入以尊重backpressure；与真实播放和墙上时钟无关，不靠captureStream录屏。
4. 原音乐PCM经浏览器AAC编码后写入MP4音轨。发现原始AAC链路有44ms固定priming，所以添加**当前编码器实测校准**：短原创宽带脉冲经相同AAC编码/解码，互相关找到延迟；保留负时间戳priming包供解码，Mediabunny生成MP4 edit list在呈现时跳过，并限制最后包呈现时长。无浏览器/OS写死常量；校准失败明确报错。
5. H.264/AAC能力先探测，校准还需要AudioDecoder。编码完成提供真实video/mp4 Blob下载。对象URL在下一次导出时释放；编码源在成功/失败路径关闭/取消；图片替换释放旧ImageBitmap。

本次校准测得2112 samples/48kHz =44ms，最终解码验证为0ms偏移。该校准已覆盖本机fixture，尚不能代表所有设备上的AAC实现。

[官方Mediabunny格式说明](https://mediabunny.dev/guide/supported-formats-and-codecs)明确区分容器支持与浏览器实际编码器可用性；运行时检测不能省略。Remotion Web Renderer没有进入实现/安装/实测：本路径已通过，无需升级复杂度。查询的[Remotion官方文档](https://www.remotion.dev/docs/client-side-rendering/)也说明其浏览器编码依赖WebCodecs/Mediabunny，因此引入它并不能自动解决设备编码器缺失。

## 测试方法与结果

硬件：Intel Core i5-8257U 1.40GHz、8GiB RAM、macOS15.4.1 x86_64。浏览器为本机安装的Google Chrome155（Playwright headless，未做人工听音）。使用独立原创30秒、48kHz双声道PCM16音乐及其MP3版本，原创背景SVG/PNG，CC0授权与重现脚本随工程交付。

| 验收项 | 结果 | 证据/边界 |
|---|---|---|
| 本地启动 | 通过 | Vite开发服务器5178、生产preview5179均成功 |
| MP3/WAV上传与播放 | 通过 | WAV实时播放/频谱；生产页面从全新上下文上传MP3并通过按钮导出、解码播放 |
| 真实频谱 | 通过 | 440Hz/2kHz峰值单元测试；播放中频谱数组非零且随时间改变；独立视频几何比对 |
| Bars/Circular与图片 | 通过 | 两模式交替导出，SVG/PNG上传；背景像素发生变化，解码帧可见背景 |
| 9:16 / 720×1280 / 30fps | 通过 | 每份ffprobe：720×1280、30/1、900帧 |
| MP4 / H.264 / AAC | 通过 | 文件ftyp签名；ffprobe `mov,mp4,m4a,3gp,3g2,mj2`、h264/avc1、aac/mp4a |
| 呈现时长 | 通过 | 最终五份的容器、视频流、音频流均30.000000秒 |
| 原音乐保留 | 通过 | AAC与WAV头/中/尾独立互相关≥0.99968998，SNR32.07–32.50dB；双声道且非静音 |
| MP3输入保留原音乐 | 通过 | 原MP3解码与额外MP4音轨互相关≥0.9999775，SNR43.47–47.55dB |
| 音频同步/漂移 | 通过（测试素材） | 头/中/尾全部0采样偏移、0ms首尾漂移；不代表全部第三方播放器/设备 |
| 画面同步 | 通过（测试素材） | 独立NumPy FFT，25个采样帧×频带；±5帧搜索最佳偏移0帧；Bars柱高MAE0.143px，Circular完整可见径向线MAE0.883px |
| 连续五次 | 通过 | 同一页面连续Bars/Circular交替，五个文件均用ffprobe及独立解码检查，无崩溃 |
| 生产构建/播放 | 通过 | TypeScript、Vite build；MP3+PNG通过UI按钮导出，Chrome video解码视频帧和音频字节，时长30秒 |
| 静态部署构建 | 通过 | 干净目录npm ci --ignore-scripts + npm run build，实际Vercel未部署 |
| Android Chrome | 未验证 | 无Android真机/ADB；没有用桌面移动UA模拟冒充真机测试 |
| Safari / Firefox | 未验证 | 未运行，不能从Chrome结论外推 |

输入素材本次只覆盖48kHz双声道自制音乐；任意VBR MP3、单声道、多种WAV位深、极短音频和超大图片尚未做完整矩阵。

AAC原始解码到裸PCM时，最后一个编码包可能保留14.667ms填充；MP4 edit list/包呈现时长是30.000秒。不能把裸包解码长度误写为容器时长，也不保证每个绕过edit list的第三方解码器正确裁剪。

### 五次导出与内存

<!-- FINAL_RUN_TABLE_START -->
| 次序 | 效果 | 编码+封装耗时（秒） | 文件MB | 采样JS heap峰值MiB |
|---|---|---:|---:|---:|
| 1 | bars | 6.251 | 5.999 | 9.02 |
| 2 | circular | 6.372 | 8.010 | 8.75 |
| 3 | bars | 6.167 | 5.999 | 10.50 |
| 4 | circular | 6.237 | 8.010 | 11.06 |
| 5 | bars | 6.131 | 5.999 | 12.68 |
<!-- FINAL_RUN_TABLE_END -->

JS heap为CDP每500ms采样，仅覆盖JS堆，未包含AudioBuffer外部内存、视频帧、编码器、GPU或整个浏览器。JS堆在多次导出后有增长，五次未崩溃**不能**证明无内存泄漏。

额外独立OS RSS采样见 `memory-profile.json`：只统计该次启动的Chrome CDP进程清单（browser/renderer/GPU/utility），峰值合计约776.85MiB；RSS相加可能重复统计共享页，采样也可能漏瞬时峰值，不能作为精确分配峰值或Android预算。此项为无背景Bars单次导出，不等于所有模式/设备的最大内存。

## 失败日志与修复

- `upstream-install.txt` / `upstream-start.txt`：首选pnpm安装脚本检查失败及npm成功回退。
- `upstream-export.txt`：首选拒绝WAV，随后等待MP4超时；`upstream-export-mp3.txt`记录实际MP3成功。
- `background-red.txt`：SVG Blob直接createImageBitmap解码失败；改为HTMLImageElement.decode后创建位图，`background-green.txt`通过。早期浏览器测试只监听pageerror漏掉handled console.error，已加入错误和像素断言；`browser-results-before-background-fix.json`明确标为失败。
- `media-validation-before-priming-fix.json`：AAC音乐正确但固定44ms延迟，音画检查未通过；`priming-red.txt`、`unit-green.txt`及最终`media-validation.json`记录校正算法和最终结果。失败文件/日志没有删除或粉饰。
- `final-check-before-media-refresh.txt`：最终媒体哈希校验发现重跑导出后的文件与先前分析快照不同；对最终文件重新执行完整独立分析后再核验，未直接复用旧成功结论。
- `raf-red.txt`：播放中切换模式会积累多个RAF；修复为取消待处理帧再调度，`raf-green.txt`确认只剩一个循环。
- ffprobe初次从evermeet下载返回HTTP410，转npm ffprobe-static成功；FFmpeg首次安装下载约3分钟。Python备选imageio-ffmpeg也曾成功安装，只用于准备测试MP3，后续复现不依赖它。
- `unit-red.txt`：FFT实现前的失败；最终5个核心测试、严格类型检查和Vite构建通过。没有安装额外ESLint工具；静态检查用tsc、脚本语法检查及npm audit（本次0已知漏洞），不冒称跑过不存在的lint任务。

## Vercel和兼容性风险

[官方Vercel Vite说明](https://vercel.com/docs/frameworks/frontend/vite)支持此静态模式。本目录vercel.json设置独立Root Directory后的安装/构建/输出；本地干净构建已验证，不等于Vercel实际发布成功。无服务器编码，故不受Function执行时限约束。默认npm ci下载仅验证用FFmpeg可能慢/受网络阻碍，部署用npm ci --ignore-scripts避免下载，且已验证能构建。

没有FFmpeg wasm、多线程共享内存或运行时外部字体/CDN，故当前链路不依赖COOP/COEP。WebCodecs需安全上下文（localhost或HTTPS）。Android风险是AAC/H.264实际encoder/decoder配置支持、硬件限制、内存、温控、后台暂停和下载保存；当前探测失败会阻止导出。浏览器有API不等于设备有指定编码器。

“离线逐帧”指不按实时录制，可以快于实时；没有承诺网页首次加载后断网/缓存离线启动。没有实现PWA或后台持续渲染。

## 下一阶段成本与主要风险判断

以下为工程量估计，非已验证工期。以一名熟悉Web Audio/WebCodecs的工程师为例：

| 下一阶段范围 | 估计 |
|---|---|
| 当前Chrome桌面链路加固：上传尺寸/时长/图片像素限制、取消与超时、失败资源回收、播放seek、测试纳入CI | 3–5工程日 |
| Android至少3档真机：AAC校准、温控、后台恢复/明确中止、下载保存、五次压力测试 | 3–6工程日 |
| 内存优化：Worker/OffscreenCanvas、分块PCM/编码、文件流写入兼容方案 | 3–5工程日 |
| 许可/实际Vercel预览/部署检查、播放器兼容回归 | 1–3工程日 |

范围可重叠，实用的简单版本约2–4周；不包含账号、支付、商业模板或服务端兜底。不具备AAC/H.264能力的设备若必须支持，可能需要另评估wasm编码或服务端渲染，增加依赖许可、资源和运营成本；当前不承诺该范围。

主要风险依次为：移动设备编码器和AAC校准差异；约数百MiB以上的进程内存；大文件先完整解码的资源压力；当前导出仍在主线程、不可取消、缺看门狗；只做五轮测试不足以证明长期稳定；MPL/GPL工具及编解码器专利的正式分发复核。格式和有声导出核心可行，但尚未到全设备产品化完成。

## 交付文件与简化

新增文件全部在本独立目录。核心为 `src/{main,render,export,audio}.ts`、`src/{spectrum,delay}.mjs`，以及独立package/lock/Vite/TS/Vercel配置、测试和复现脚本。README给出启动/验证步骤；LICENSES与research提供许可/技术来源；evidence保留五个最终MP4、MP3额外输出、首选原始MP4、ffprobe、同步分析、截图和失败日志。

简化掉上游Next/React/UI组件树、Three/WebGPU、FFmpeg wasm、实时MediaRecorder导出和共享音轨依赖。没有修改既有业务文件，也没有创建账号/支付/SEO；没有执行提交、推送或部署生产环境。
