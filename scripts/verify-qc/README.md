# 本地人工转录核对

独立目录；不导入网站代码，不运行服务器，不调用识别服务。现有12条Reel各提供small/medium对照，入口为 [INDEX.md](INDEX.md)。

## 直接使用

用普通浏览器打开本目录 `review.html`，顶部“选择文件”可直接切换全部12条样本，已内嵌数据及音频，不需要逐份导入。也可从INDEX打开单独样本页面。

切换文件会暂停音频、切换独立判定和WER统计；即使localStorage被拒绝，本次打开期间切换也会保留输入。导出按钮针对当前选中文件；之前单样本页面的JSON可选中对应文件后恢复。
统一review.html内嵌12条完整音频及完整转录，可单独复制到其他目录离线使用；旧的单样本页面仍可保留片段模式。
黄色只表示模型间规范化词不同，不表示已确认错误。

1. 在统一页面点击“定位并播放”。右侧播放完整音频，从目标前1.5秒开始，默认继续播放前后文。蓝色时间区间和全文蓝框表示当前核对条目，黄色表示模型词分歧，绿色下划线表示播放位置所在条目。可点击全文任一段定位、拖动完整音频进度、从头播放，或用“回到当前目标”。A–B使用完整音频绝对秒数，须手动勾选才循环。
2. 顶部选择判定模型；每条的“对 / 错 / 漏句 / 听不清”只写到该模型，其他模型独立保存。
3. “原音实际说的是什么”是各模型共享的人工参考。只填蓝框核对目标的文字，不要把前后文一并填入；模型标注的时间可能重叠，全文和完整音频用于帮助人工判断。
4. 非空参考自动参与WER；确认没有文字时须明确勾选空参考。单独点击“错”但不填参考，不会凭空计算WER。
5. 页面保存到localStorage，可导出JSON/CSV。file协议下是否允许持久存储由浏览器决定；拒绝时页面有明确提示。导出的JSON可以恢复；只接受相同dataset_id，输入变更后不会误套旧判定。

当前内置浏览器工具禁止file://，所以未执行真实浏览器交互验收；已执行Python测试、纯Node完整页面模拟逻辑测试、音频帧和内嵌数据验证。未通过换协议/服务器绕过限制。

## 输入格式

清单中的路径可为绝对路径，或相对于清单文件。时间单位为秒，不能直接传毫秒。

```json
{
  "sample_id": "my-sample",
  "audio": "input.wav",
  "reference_model": "small",
  "models": {
    "small": {"segments": "small/segments.json", "srt": "small/transcript.srt"},
    "medium": {"segments": "medium/segments.json", "srt": "medium/transcript.srt"}
  }
}
```

`segments.json`须保留 `words: [{word, start, end}]`（`text`可代替`word`），可为分段数组或`{segments: [...]}`，也支持`{words: [...]}`。本地旧实验中真正有词时间的文件叫 `raw-segments.json`，并非每份 `segments.json` 都保留了词时间。非空分段缺词时间会明确报错，不根据整段均分出假时间。

可以在models加入第三项Cloudflare等；仅比较你提供的文件，不调用其服务。分段/词时间须与同一音频及裁切范围匹配。reference_model只决定对照行如何锚定，不当作正确答案。

## 生成

在项目根目录：

```sh
python3 scripts/verify-qc/qc.py build scripts/verify-qc/manifests/DbQzbzrAJ-V.json --out scripts/verify-qc/runs/DbQzbzrAJ-V
python3 scripts/verify-qc/build_examples.py
```

mono PCM16 WAV仅用Python标准库即可。原始视频/其他音频需FFmpeg；可传 `--ffmpeg /absolute/path/to/ffmpeg`，或使用已有实验venv的imageio-ffmpeg（本工具未新增依赖）：

```sh
scripts/transcribe-probe/.venv/bin/python scripts/verify-qc/qc.py build scripts/verify-qc/video-input-smoke.json --out scripts/verify-qc/runs/video-input-smoke
```

已用85.75秒访谈原MP4实际验证此入口，记录在runs/video-input-smoke。原文件保留；只在输出目录生成标准音频和片段。

每份输出：

- `conflicts.csv`：只列分歧行，分数降序；专名候选、数字（含常见英文数词）、单位、否定词靠前。每模型原文、分歧词和`**高亮标记**`分别保留；HTML用黄色显示。
- `clips/segment_...wav`：每cue完整上下文片段。
- `clips/segment_..._diff_...wav`：每个连续分歧词块的精确区间，前后各1.5秒（音频边缘截断）。名称带segment_index和实际片段时间。
- `clips-index.json`：本次片段清单、核心和扩展区间、实际绝对路径。重建后文件夹可能留下旧片段，以该清单为准。
- `review.html`：数据和audio data URI全部内嵌；无需fetch本地JSON或另开服务器。
- `auto-flags.csv`：独立自动候选表。
- `cue-metrics.csv`：每模型每条原始SRT的字符/秒、字符数、标记，即使没有异常也保留该条。
- `qc-data.json`：完整页面数据，供后续CLI算WER。
- `summary.json`：实际数量。未填人工参考时ground_truth_count=0、WER=N/A，不是假零错误率。

## 对齐与自动标记的边界

按词编辑距离进行多模型渐进对齐，词匹配优先、时间只用于同成本对齐的择优；插入和缺词均保留。数字如`1`+`,000`会先在原词时间范围内重组成完整数字；没有凭空插入对齐时间。segment_index是按时间排列的新核对行号，另保留reference_cue_index。每个词只分配到一个核对行。

规范化忽略大小写和标点，保留数字、货币、百分号和词内撇号。大小写/标点本身不同不会成为词分歧。专名用不同词的首字母大写启发式，不能声称完成了实体识别。所有模型共同漏掉/写错的内容，单靠diff无法发现。

漏句候选：相邻SRT cue间隙>2秒、前文无句末标点、后文以小写或常见连接词开头。这里只是文本连贯代理条件，间隙也可能是正常停顿。

语速：CPS为扁平化cue字符数÷时长；低/高离群阈值基于每份SRT的中位数/MAD，极低值也会列出。`over_42_chars`是每cue总字符数>42，`line_over_42_chars`是单行>42，不能将前者直接当作“两行字幕不合规”。超7秒、超20CPS与零时长单独列出。

CSV使用UTF-8 BOM，对可能被表格软件执行的公式前缀加apostrophe；原文仍保留于JSON和页面。所有候选均不构成质量结论。

## 人工参考之后计算WER

页面会即时给出各模型S/D/I和WER，也可对导出JSON离线计算：

```sh
python3 scripts/verify-qc/qc.py wer scripts/verify-qc/runs/DbQzbzrAJ-V/qc-data.json /path/to/DbQzbzrAJ-V-reviews.json --out scripts/verify-qc/runs/DbQzbzrAJ-V/human-wer
```

输出 `wer.json`（逐条及各模型加权汇总）和`wer.csv`。只统计truth_provided=true的片段；不能把某模型输出当ground truth。S=替换，D=参考有而模型没有，I=模型有而参考没有；分类相对人工参考，不自动推断音频原因。

WER=(S+D+I)/参考词数，可超过100%。空参考会记录插入数，单条WER为N/A；汇总时插入计入分子。NFKC、小写、规范撇号，忽略其他标点；单位/数字作为词保留。英文式词切分，不是所有语言的专用分词器。Python与页面JS已用250组固定随机合成输入交叉核验，合成测试从未写入真实样本参考。

## 验证

```sh
python3 -m unittest discover -s scripts/verify-qc -p 'test_*.py'
node scripts/verify-qc/test_page.cjs
python3 scripts/verify-qc/validate_outputs.py
```

验证涵盖二/三模型对齐、数词/单位/否定、重复词择时、输入拒绝、精确PCM裁切及padding、分歧排序、内嵌音频一致性、无词增删、无虚构参考。页面模拟覆盖判定、存储拒绝提示、恢复导出、WER与A–B循环；不冒充浏览器实测。

批量运行还会在 `runs/` 顶层生成汇总 `conflicts.csv`（54条，跨样本按分数排序）、
`auto-flags.csv`（177条）、`clips-index.json`（295片段，其中64段为分歧点片段）。
本次没有人工参考，未生成任何真实样本WER数值。

新增实现文件为 `qc.py`（CLI/媒体/导出）、`qc_core.py`（对齐/自动标记/WER）、
`page.html`（离线模板）、`build_examples.py`（现有样本入口）、`validate_outputs.py`；
测试为 `test_qc.py`、`test_integration.py`、`test_page.cjs`。所有实现隔离于本目录，
未添加Python依赖，未修改其他目录主代码。

## 重建统一入口

`python3 scripts/verify-qc/bundle.py` 将已有12份qc-data.json整合到本目录review.html。`build_examples.py`也会自动更新该入口。该文件内含12条完整PCM音频及全文，不再重复嵌入所有小片段；可单独复制离线使用，不依赖相邻文件。样本选择和标注隔离已通过Node模拟测试，当前浏览器工具仍禁止file://，未声称浏览器实测。

## 完整上下文模式（2026-10-22更新）

统一入口现在显示完整音频+small/medium完整转录，蓝框与蓝色时间条固定当前核对目标，播放位置用绿色下划线另行标示。全文展示不受左侧“仅分歧”筛选影响。切换目标不重新加载音频，也不在目标结束处自动停止；只在手动启用A–B时循环。

完整音频来自每份数据旁的audio.wav；每个样本只嵌入一次。保留原dataset_id和segment_index，兼容已保存的人工标注/导出文件；没有生成任何ground truth。测试覆盖绝对时间跳转、完整文本上下文、目标高亮、持续播放与切换标注隔离。浏览器工具对file协议的限制仍在，未声称进行浏览器实测。
