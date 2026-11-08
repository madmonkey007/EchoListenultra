# 依赖和许可证说明

核查日期 2026-10-25。锁定版本见 package-lock.json。以下区分浏览器实际分发、构建工具和本地验证工具；包元数据盘点不等于逐文件法律意见。

| 层级 | 依赖 | 版本 | 许可证 / 用途 |
|---|---|---|---|
| 浏览器 | mediabunny | 1.62.1 | MPL-2.0；WebCodecs 管线及真正 MP4 mux |
| 类型声明 | @types/dom-webcodecs / dom-mediacapture-transform | 见 lock | MIT；不进入运行时代码 |
| 构建 | Vite / Rollup / esbuild | 见 lock | MIT；静态打包 |
| 类型检查 | TypeScript | 5.8.3 | Apache-2.0 |
| 浏览器验证 | Playwright / playwright-core | 1.64.1 | Apache-2.0；调用本机 Chrome |
| 本地媒体验证 | ffmpeg-static | 5.3.0 | 包声明 GPL-3.0-or-later；下载二进制许可取决于构建，未引入网页 |
| 本地媒体验证 | ffprobe-static | 3.1.0 | 包装层 MIT；内含 FFmpeg 派生二进制，不能视为二进制也是 MIT |
| 本地分析（单独 Python 环境） | NumPy | 2.0.2（本次） | BSD-3-Clause；不参与网站运行 |

完整 npm lock 元数据清单见 `research/dependency-licenses.json`，包括可选平台依赖。其余主要为 MIT、ISC、Apache-2.0、BSD-3-Clause；`parse-cache-control@1.0.1` 缺单一 license 字段，package.json 的 licenses 数组写 BSD，不能把元数据缺失当作已完成实物许可审查。

Mediabunny 未修改。已经提供完整 MPL 文本 `public/licenses/mediabunny-MPL-2.0.txt`、浏览器可访问通知 `public/THIRD-PARTY-NOTICES.txt`，及对应 1.62.1 npm 包源码地址；上线时必须继续保留通知与源码获取途径。MPL 是文件级义务，不等于把独立原创应用全部改成 MPL；实际分发义务以 [Mozilla 的 MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) 与完整许可为准。浏览器包不包含 FFmpeg、GPL wasm、Playwright 或本地探针二进制。

本原型原创部分使用 MIT（本目录 LICENSE），素材和测试乐谱/合成为 CC0。MP3/PNG 是这些原创素材的派生。没有使用外部商业音乐、图片、字体或模型生成资产。

首选项目 README 声明 MIT，但缺完整 LICENSE，且仓库已归档；没有复制它的源码。phase-viz 为 MIT，不过 ffmpeg core 的 GPL 许可与包装层 MIT 分开；cymatic 为 MIT，尚缺浏览器端有声 MP4 链路。详见两个上游核查报告。

H.264/AAC 编解码器来自浏览器/操作系统。开源代码许可证与编解码器专利权是不同问题，本 Spike 未作商业专利授权结论。正式商用前需按实际分发地域、部署方式和依赖构建完成许可复核。此处不提供“一切可无条件商用”的保证。
