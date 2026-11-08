# 180 秒时长上限变更记录

状态：代码与文案已部署，验收未完成；按用户明确的 1.5 倍耗时停止条件停止后续实测。未回滚、未继续发起 ASR 请求。
生产部署：dpl_F42zwq6LhbxbFWTKZTZufbEY2r7T，READY。生产站 https://reelstranscript.com/

## 原始回归结果与停止原因

| ID | 实际音频秒数 | 原耗时 | 本次 HTTP | 本次耗时 | 倍数 | cues | limit_seconds |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dewkwa1DWS- | 31.852 | 7.491 | 200 | 8.512 | 1.136 | 9 | 180 |
| DViYRZnETJr | 89.886 | 10.413 | 200 | 19.029 | 1.827 | 24 | 180 |
| DcI7Ly7DKew | 148.119 | 28.187 | 未执行 | — | — | — | — |

第二条超过 10.413 × 1.5 = 15.6195 秒，因此立即停止。没有通过重复测试挑选更快结果，没有修改超时或时间戳来通过验收。单次测量不能归因于网络、冷启动、ASR 波动或 cue 处理，未作归因结论。
原始响应分别见 Dewkwa1DWS--body.json、DViYRZnETJr-body.json；计时、请求 ID 见 regression.json 和 STOP-REGRESSION.json。

新增约 175 秒候选：https://www.instagram.com/reel/DUlR9HKkhny/ ，完整音轨解码实测 177.00712 秒、1096464 字节，未截断。候选搜索/测长在停止条件触发之前完成。该条未运行线上转录。
超过 180 秒样本未运行，因此没有可交付的真实线上超限 body，也未声称实测 422 通过。

## 改动范围

- lib/transcription-config.json：唯一生产时长值 max_audio_seconds=180。
- lib/transcription-limit.ts：前端读取共享配置并换算分钟；不硬编码上限分钟数。
- server/transcription/turbo.py：读取共享配置，原始 ASR 时长校验与输入校验沿用原规则，仅更新阈值来源和错误文字。
- server/transcription/reel_probe.py：元数据/容器时长阈值引用共享常量；超限内部标签改成不包含固定秒数的名称。
- api/reel-transcribe.py：所有前端 JSON 响应追加 limit_seconds；原 422/502 状态码映射保留，too_long 从原始 ASR/容器/元数据取可用实际时长，round(...,1)，缺省则不附字段。明确不可访问的错误归入独立 error 分类，未改变判断是否允许处理的校验或状态码。
- lib/reel-client.ts：依据 error 字段区分超限、链接/公开访问、服务失败；解析失败、网络失败和不完整响应也进入服务失败提示。读取接口 limit_seconds；时长缺失使用共享上限配置兜底。
- components/ReelTranscriber.tsx：显示动态上限；保留提交禁用、实时秒数与原请求生命周期；等待超过 90 秒追加仍在处理的提示；错误动作独立换行。
- views/LandingView.tsx、views/HelpView.tsx：仅更新时长相关文案为配置换算值。
- vercel.json：只把共享 JSON 配置纳入 includeFiles；maxDuration 仍为 300。
- server/transcription/README.md：更新当前时长配置说明。
- tests/duration-limit.test.cjs：新增 10 项测试。
- server/transcription/test_limit_responses.py：新增 8 项离线响应契约测试。
- server/transcription/test_turbo.py：既有边界测试改为引用当前配置。
- tests/website.test.cjs、tests/reel-client.test.cjs：既有文案断言跟随新要求，其余测试保留。

## 时长相关文案清单

| 位置（页面+区块）/文件 | 改动前原文 | 改动后原文 |
|---|---|---|
| 首页输入框限制 / components/ReelTranscriber.tsx | Public Reels up to 60 seconds. | Public Reels up to 3 minutes.（从接口/共享配置读取） |
| 首页 FAQ / views/LandingView.tsx | Up to 60 seconds. | Up to 3 minutes.（共享配置） |
| 帮助页 Troubleshooting / views/HelpView.tsx | The current duration limit is 60 seconds. | The current duration limit is 3 minutes.（共享配置） |
| 超限错误 / lib/reel-client.ts | This Reel exceeds the current 60-second limit. Try a shorter Reel. | 已知时长：This Reel is M:SS long — longer than the 3-minute limit.；未知：This Reel is longer than our 3-minute limit.；两者下一行均为 Try a shorter Reel. |
| 等待状态 / components/ReelTranscriber.tsx | Fetching audio and creating your transcript… / Usually around 6–10 seconds in our tests. Some Reels take longer. | Transcribing… usually 10–30s / Some Reels take longer.；超过 90 秒追加 This one is taking longer than usual, still working…；保留实时 Ns elapsed |
| 内部 ASR 超限 / server/transcription/turbo.py | provider original duration exceeds 60 seconds | provider original duration exceeds 180 seconds（配置插值） |
| 内部输入上限 / server/transcription/turbo.py | Audio duration must be verified and within 60 seconds | Audio duration must be verified and within 180 seconds（配置插值） |
| 内部容器超限 / server/transcription/reel_probe.py | Full audio exceeds unchanged 60-second limit | too_long: full audio exceeds 180-second limit（配置插值） |
| 开发说明 / server/transcription/README.md | longer than 60 seconds / unchanged 60-second cap | shared configured limit (currently 180 seconds) / shared configured duration cap |

其它两套错误文字：
- invalid_url / 明确无法公开访问：This link is invalid or the Reel is not publicly accessible. 下一行 Try a public Instagram Reel link.
- 上游、传输、响应异常：There is a problem on our side, not with your link. 下一行 Please try again later.

首页 meta description、og:description、其余 meta、结构化数据、页脚、/about 没有需要替换的旧时长承诺，保持原文。

## 本地验证原始输出

```
# 改前
ℹ tests 111
ℹ pass 111
ℹ fail 0

# 改后：保留原 111 项，新增 10 项
ℹ tests 121
ℹ pass 121
ℹ fail 0

# Python：新增 8 项，既有 11 项
Ran 19 tests in 0.098s
OK

# 类型检查
> tsc --noEmit

# 构建
✓ 60 modules transformed.
dist/index.html                   2.90 kB
dist/assets/index-CNwKCBbq.css   52.94 kB
dist/assets/index-C-YZZzzI.js   293.66 kB
✓ built in 2.18s
```

新增测试覆盖 179/180 通过、181 拒绝、只看原始时长而不看 VAD 时长、422/下载502 的实际时长字段、实际时长缺省、成功及早期错误也携带 limit_seconds、三套错误文案及独立换行、网络/异常响应、等待 45 秒与 91 秒提示。没有调用模型或伪造线上验证。

## 静态壳与冻结检查

```
PRODUCTION static bytes 2897 -> 2897
Protected whole-shell comparison excluding asset filenames: True
All meta diff: EMPTY
Assets: /assets/index-C-YZZzzI.js /assets/index-CNwKCBbq.css
Frozen protected hashes: PASS; download90/ASR120/payload2500000: unchanged
```

原始 static.diff 只有 JS 产物文件名变化。CSS 文件名与内容保持不变。首页全部受保护字段值详见 protected-fields-after.json；首页 H1、副标题、示例三段、noscript、canonical 与改前一致。/about、/contact、/privacy、/settings 源文件及 sitemap/robots/manifest、词级 cue 引擎哈希未变；/tiktok-transcript 未编辑。

## 剩余 60 / one minute / 1-minute 搜索

代码修改后全仓默认 rg 搜索（遵循仓库忽略规则，不遍历 .git/node_modules/.venv/忽略的实验输出），原始输出共 199 行，见 remaining-60-full.txt，每条带文件、行号、原文。活动源码条目另列 remaining-60-active.txt。
残留为秒/分钟换算、认证过期缓冲、旧独立导入/配额/学习功能的时长、CSS 600 色阶/透明度、图标坐标、图像 ID、历史测试与报告、依赖锁文件数字等；不是当前 Reel API 的旧 60 秒上限承诺。未为消灭数字而改动无关功能。历史报告保持当时的真实记录。

## 未完成验收（停止条件触发）

- 148 秒旧样本复测。
- 177 秒新样本线上 HTTP 200 / cues / 等待状态浏览器核对。
- 超过 180 秒的真实线上完整错误 body 和具体时长提示。
- 浏览器正常样本 Copy text / Download SRT 回归。

这些项目均不得标记通过。生产上限已为 180 秒，但本次发布未完成全部实测验收。
