import json,csv
from pathlib import Path
from probe import ROOT
run=ROOT/'runs/20261022-vad'
rows=[json.loads(p.read_text()) for p in sorted(run.glob('*/*/*/metrics.json'))]
lines=['# VAD A/B/C 实验实测','', '本机 Intel CPU，8 GiB RAM，CPU int8 / 4线程。24例：两模型 × 三组 × 四样本。A: VAD=False, previous_text=True, word_timestamps=False；B: True/False/False；C: True/False/True。其余 beam=5,temperature=0，语言自动检测，VAD使用库默认参数。A与上一轮参数不同，是新跑的指定对照。每模型单独进程，按 A/B/C 顺序；每例单次，非隔离专机。耗时包含完整生成器与C的词对齐，排除模型加载和导出。','', 'A/B SRT 使用模型分段；C 使用上一轮相同的按标点及词时间戳导出器，不额外强制7秒或42字符，因此C的差异包括词对齐和导出粒度变化。raw-segments.json保留未经合并的结果。零时长统计按最终SRT，同时保留raw零时长数量。未听音，不下质量结论。','', '## 钢琴：完整输出与 Thank you 时间','', '|模型|组|Thank you for watching 时间|完整输出|','|---|---|---|---|']
for r in rows:
 if r['id']=='DdTrkOFgmiD':
  f=run/r['model']/r['group']/r['id'];t=(f/'transcript.txt').read_text().strip();hits='; '.join(f"{s['start']:.3f}–{s['end']:.3f}" for s in r['thank_you_hits']) or '未出现'
  lines.append(f"|{r['model']}|{r['group']}|{hits}|{t or '空（无音乐标记）'}|")
lines+=['','## 连续重复 ≥3次','', '忽略大小写、标点，以连续1–50词短语检测，最长重复跨度优先去重。位置为包含该短语的模型段时间范围；A/B无词时间戳，不能声称精确到词。不是语义重复检测。','', '|模型|组|样本|位置秒|短语|次数|','|---|---|---|---|---|---:|']
for r in rows:
 reps=r['repeats'] or [None]
 for x in reps:lines.append(f"|{r['model']}|{r['group']}|{r['id']}|"+(f"{x['start']:.3f}–{x['end']:.3f}|{x['phrase']}|{x['count']}|" if x else '—|未检测到|0|'))
lines+=['','## 访谈耗时与内存','', 'macOS 无原生 free -m，实际执行失败记录在每例 memory-before/after.json；以下使用 psutil 的 MiB 数值，同文件保存 sysctl vm.swapusage 和 vm_stat 原始输出。swap用量变化和系统累计换入/换出变化均是整机数据，不能独立归因到模型；swap used既有存量不代表本次触发。','', '|模型|组|耗时秒|RTF|swap前/后 MiB|available前/后 MiB|换入增量 MiB|换出增量 MiB|重复命中数|','|---|---|---:|---:|---|---|---:|---:|---:|']
for r in rows:
 if r['id']=='DbQzbzrAJ-V':
  a,b=r['memory_before'],r['memory_after'];lines.append(f"|{r['model']}|{r['group']}|{r['elapsed']:.3f}|{r['rtf']:.3f}|{a['swap_used_mib']:.1f}/{b['swap_used_mib']:.1f}|{a['available_mib']:.1f}/{b['available_mib']:.1f}|{(b['swap_in_bytes']-a['swap_in_bytes'])/2**20:.1f}|{(b['swap_out_bytes']-a['swap_out_bytes'])/2**20:.1f}|{len(r['repeats'])}|")
lines+=['','## 每份SRT指标','', '|模型|组|样本|耗时秒/RTF|最长cue秒|最长cue字符|>7秒数|>42字符数|零时长数|raw零时长段|RSS峰值MiB|','|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|']
for r in rows:
 m=r['cue_metrics'];raw=json.loads((run/r['model']/r['group']/r['id']/'raw-segments.json').read_text());lines.append(f"|{r['model']}|{r['group']}|{r['id']}|{r['elapsed']:.3f}/{r['rtf']:.3f}|{m['max_seconds']:.3f}|{m['max_chars']}|{m['over_7_seconds']}|{m['over_42_chars']}|{m['zero_duration']}|{sum(s['end']<=s['start'] for s in raw)}|{r['peak_rss_mib']:.1f}|")
lines+=['','## C组舞台讲话：与旧27–34秒cue对照','', '|模型|旧实验最长cue秒|本次C最长cue秒|最长cue文本|','|---|---:|---:|---|']
for r in rows:
 if r['group']=='C' and r['id']=='DeqblVZAh4m':
  cues=json.loads((run/r['model']/r['group']/r['id']/'segments.json').read_text());c=max(cues,key=lambda c:c['end']-c['start']);lines.append(f"|{r['model']}|{33.78 if r['model']=='small' else 27.54}|{c['end']-c['start']:.3f}|{c['text']}|")
lines+=['','## 本机内存问题','', '物理内存 8589934592 bytes = 8 GiB。上一轮只记录到整机 swap 已用7228.5 MiB，没有逐例前后记录，因此无法证明由medium新触发，也不能用1.3GiB进程RSS代替部署所需整机内存。本轮按前后快照给出变化；vm_stat含压缩/解压及pageout原始计数，系统后台未隔离，无法仅靠这些计数确定617秒慢例的因果。','', '原始音频保留；Dbg输入固定前45秒。9段听审音频与实际视频路径见 MEDIA_PATHS.md。']
(run/'REPORT.md').write_text('\n'.join(lines)+'\n')
(run/'all-metrics.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print('cases',len(rows))
