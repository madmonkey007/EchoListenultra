# 一次性转录验证

不导入网站代码；全部脚本、独立 Python 环境、模型和输出均在本目录。复用 8 条 `scripts/ig-probe` 无 Cookie 组 WAV，加 4 条之前浏览器实测的既有 WAV；输入绝对路径和 SHA256 在 `samples.json`，源音频不修改。

## 环境与模型

Python 3.11 + faster-whisper，CPU int8、4 线程。准确安装版本见 `requirements.lock.txt`，不是网站依赖。`run.sh` 和 Python 入口设置 `HF_ENDPOINT=https://hf-mirror.com`。本次镜像返回到 HF/CDN 的正常重定向，日志原样保留。small/medium 为完整 multilingual 模型，固定 revision 见 `*-model-api.json`；分段下载校验 Content-Range、字节数和 HF 提供的 SHA256。

```sh
cd scripts/transcribe-probe
# 本次已创建独立 .venv；全新机器可使用 Python3.11 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
sh run.sh --model small --model-dir models/small --round all --output runs/new-comparison
sh run.sh --model medium --model-dir models/medium --round all --output runs/new-comparison
.venv/bin/python summarize.py runs/new-comparison
```

默认可以由 faster-whisper 自动从指定 endpoint 下载；省略 `--model-dir` 即可。手工下载辅助程序 `download_models.py`（单流）、`download_ranges.py`（正常公开 HTTP Range；8 连接/模型）是本次网络过慢时的恢复工具，不使用代理、账户或关闭 TLS 校验。`run_matrix.py` 为本次完整实测的顺序驱动器，等待已验证模型后分别启动两个模型进程，输出到 `runs/20261021-small-medium`。实际运行中不得并发加载两个模型争抢 CPU/内存。

## 两轮

- quality：3 个候选。英文慢速口播的原音 0–45s 裁切作为 baseline candidate；Miley Cyrus 舞台讲话作为 noise candidate；104.7 秒英文口播作为 long。前两者的“没有音乐 / 明显噪音”标签未由代理听审确认，不能当作已满足声学分类。裁切 WAV 与原音路径均保留，固定 45 秒窗口的末句截断需要与模型错误区分。
- hallucination：12 个完整原音，不裁切；关闭 VAD，以便检查音乐/静音段行为。质量组开启 VAD，因此不可直接将两轮当作相同配置重复基准。
- 两轮均 beam=5、temperature=0、语言自动检测、condition_on_previous_text=False、word_timestamps=True；保留默认 no-speech/logprob 门限。

每例生成纯文本、SRT、segments.json、raw-segments.json（含词时间戳及模型置信指标）、metrics.json、review.json、boundaries.json。SRT 优先标点句末，跨模型窗口合并；不按停顿硬切已有句子；仅未带句末标点的尾部文本超过12s时在词边界拆开并标记 `forced_duration`，全部非句末边界和超长句均进入断句候选。初版按停顿/时长切段造成的缺陷与原始导出均保留为 `.initial` 文件，最终统一重导出。模型返回零时长句子时，保留文字并入相邻有效cue，标记 `merged_zero_duration`，不编造独立时长。它不是声学意义上的“已确认正确分句”。

RTF 时间包含转写生成器的完整消费及词级对齐，不含模型下载/加载、静音检测、导出。峰值内存是每例 50ms 采样的进程 RSS（含常驻模型，标 MiB），同时保存基线 RSS；非 Python 堆、非整个系统内存，极短峰值可能漏采。模型加载另计时间和 RSS。首次推理未人为热身，可能包含初始化成本。

## 审阅和字幕

`review.json` / 汇总 `REVIEW.md` 明确区分启发式候选和人工确认错误。FFmpeg silencedetect 自适应门限 min(-40, peak dBFS - 35)、最低 -90dB、至少0.5s 的低能量区间不必然为真正无声；纯音乐标签来自作者描述，尚未人工听审。词错率、人名/数字正确文本、配乐分类和真实幻觉需要听原音确认；当前工具没有可让代理听音的输入能力，不能伪造已确认错误或“零幻觉”结论。

`captions.py` 只使用 yt-dlp 无登录探测原生/自动字幕，不下载媒体；取不到则 N/A，不将烧录字幕当作字幕轨。最终12条字幕日志索引在 `runs/caption-final/captions/summary.json`。

```sh
.venv/bin/python -m unittest discover -s . -p 'test_*.py' -v
.venv/bin/python -m compileall -q . -x '/\.venv/'
```

官方参数说明：https://github.com/SYSTRAN/faster-whisper 。本目录实验不下“能用/不能用”的结论。

## 2026-10-22 VAD A/B/C 独立实验

运行：`.venv/bin/python run_vad_matrix.py`（在本目录运行）。输出为
`runs/20261022-vad/REPORT.md` 和每例 TXT / SRT / JSON / 内存原始快照。
两个模型各三组、每组四样本；Dbg 固定前45秒，舞台讲话用于检查旧超长cue。
A 为用户指定的新对照，不能称为上次完全相同的参数。
A/B没有词时间戳，SRT按模型段导出；C复用原按句导出器，不强制7秒/42字符。
`vad_experiment.py`仅依赖本目录工具与独立venv，不导入应用代码。
重复统计按连续规范化词序列匹配，1–50词，至少3次；约简周期性短语并去重。
统计脚本修复过一次 NumPy 整数 JSON 导出兼容问题；small C访谈因此重跑，
失败尝试不计入最终表，日志保留。仅统计重算不改变原始转写及计时。
macOS没有free命令，其失败实录以及sysctl/vm_stat原文保留；MiB表使用psutil。
系统换页计数属于整机，无法单独归因到ASR进程。
9段听审WAV及已找到的视频路径见 `runs/20261022-vad/MEDIA_PATHS.md`。

## 2026-10-22 SRT builder / D/E / VAD微调

默认限制与按词时间取点切分器：`srt_builder.py`（`Limits`可配置）。
离线重建：`.venv/bin/python build_existing.py`；验证：`.venv/bin/python validate_srt_builder.py`。
参数运行：`.venv/bin/python followup_parameters.py`（small CPU，顺序执行13例）。
总报告：`runs/20261022-srt-builder/REPORT.md`；34份before/after表：
`BUILDER_REPORT.md`及`before-after.csv`。主表24份来自旧幻觉轮，
因为最近A/B组没有词级时间；另补8份C及2份旧舞台精测，不虚构词对齐。
硬超限为0，但保留11条CPS超限及5条短cue，exceptions.json逐条记录。
切分只使用词级时间，必要时尾部静音延至下一词已有start；不插值、不均分、
不截字、不删词。带异常输出不宣称全部合规，调用者应检查exceptions。
