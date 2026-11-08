"""Rebuild actual stored word outputs, without rerunning ASR."""
import json,re,time,csv
from pathlib import Path
from srt_builder import build,metrics,srt_text
from probe import ROOT,save,PeakRSS
from vad_experiment import memory
RUN=ROOT/'runs/20261022-srt-builder';RUN.mkdir(parents=True,exist_ok=True)
def parse_srt(path):
 out=[]
 def t(s):
  h,m,v=s.split(':');return int(h)*3600+int(m)*60+float(v.replace(',','.'))
 text=path.read_text().strip()
 for b in text.split('\n\n') if text else []:
  ls=b.splitlines();a,z=ls[1].split(' --> ');out.append(dict(start=t(a),end=t(z),text='\n'.join(ls[2:])))
 return out

def main():
 paths=[('main24',p) for p in sorted((ROOT/'runs/20261021-small-medium').glob('*/hallucination/*/raw-segments.json'))]
 paths += [('stage_quality',p) for p in sorted((ROOT/'runs/20261021-small-medium').glob('*/quality/DeqblVZAh4m/raw-segments.json'))]
 paths += [('vad_C',p) for p in sorted((ROOT/'runs/20261022-vad').glob('*/C/*/raw-segments.json'))]
 rows=[];before_all=memory();started=time.perf_counter()
 for group,p in paths:
  model,roundname,id=p.parts[-4:-1];folder=RUN/'builder'/group/model/id;folder.mkdir(parents=True,exist_ok=True)
  raw=json.loads(p.read_text());before=parse_srt(p.parent/'transcript.srt');mem0=memory();start=time.perf_counter()
  with PeakRSS() as peak:cues,notes=build(raw)
  elapsed=time.perf_counter()-start
  (folder/'transcript.srt').write_text(srt_text(cues));save(folder/'segments.json',cues);save(folder/'exceptions.json',notes)
  after=parse_srt(folder/'transcript.srt')
  original=' '.join(''.join(w['word'] for s in raw for w in s.get('words') or []).split())
  rebuilt=' '.join(' '.join(c['text'] for c in after).split())
  if original!=rebuilt:raise AssertionError(f'Word text mismatch: {p}')
  starts={round(float(w['start'])*1000) for s in raw for w in s.get('words') or []};ends={round(float(w['end'])*1000) for s in raw for w in s.get('words') or []}
  assert all(round(c['start']*1000) in starts and round(c['end']*1000) in (starts|ends) for c in after)
  srcmetrics=json.loads((p.parent/'metrics.json').read_text());duration=srcmetrics.get('duration',srcmetrics.get('audio_duration_seconds',srcmetrics.get('duration_seconds')))
  if duration is None:raise ValueError('Unknown audio duration '+str(p))
  row=dict(group=group,model=model,id=id,source=str(p),source_metrics=str(p.parent/'metrics.json'),output=str(folder/'transcript.srt'),before=metrics(before),after=metrics(after),duration=duration,elapsed=elapsed,rtf=elapsed/duration,over_3x=elapsed>3*duration,peak_rss_mib=peak.peak/2**20,memory_before=mem0,memory_after=memory(),exception_count=len(notes),word_identity_verified=True,timestamp_provenance_verified=True)
  save(folder/'metrics.json',row);rows.append(row)
 save(RUN/'builder-metrics.json',rows);save(RUN/'builder-memory.json',dict(before=before_all,after=memory(),elapsed=time.perf_counter()-started))
 lines=['# 自定义 SRT builder 实验','','主表为上一轮12条×两模型共24份词级输出。另补2份原质量组舞台讲话和8份VAD C输出。上次VAD矩阵的A/B没有词级时间，因此未伪造重建。空转写保持空SRT。','', '默认：cue≤7秒、行≤42字符、最多2行、≤20 CPS、最短5/6秒。字符按Unicode码点计，空格计入；换行按一个空格计入CPS。时间取首词start/尾词end；仅阅读速度或最短时长不足时，可将尾部静音延至下一词的原始start（不超过7秒、不覆盖下一词），SRT按毫秒舍入。内容只规范空白，不删除词。','', '动态规划优先避免时长/行长硬超限，其次减少CPS超限和过短cue，再按句末→逗号/分号/冒号→词边界择点。无法同时满足的限制保留原文及词时间，记录exceptions.json，绝不伪造时长或均分时间。没有新增7秒/42字符以外的合成时间。','', '六项顺序：最长cue秒 / 最长行字符 / >7秒cue数 / >42字符行数 / >20CPS cue数 / <5/6秒cue数。前两项是长度，不应为零；对应目标为≤7和≤42，后续超限数目标为零。','', '|组|模型|样本|before 六项|after 六项|','|---|---|---|---|---|']
 keys=['max_seconds','max_line_chars','over_7_seconds','over_42_chars','over_20_cps','under_5_6_seconds']
 def fmt(m):return ' / '.join(f'{m[k]:.3f}' if k=='max_seconds' else str(m[k]) for k in keys)
 for r in rows:lines.append(f"|{r['group']}|{r['model']}|{r['id']}|{fmt(r['before'])}|{fmt(r['after'])}|")
 lines+=['','## 无法满足项（保留真实时间）','','|组|模型|样本|cue|时间秒|文字|违反项|','|---|---|---|---:|---|---|---|']
 for r in rows:
  for n in json.loads((Path(r['output']).parent/'exceptions.json').read_text()):lines.append(f"|{r['group']}|{r['model']}|{r['id']}|{n['cue']}|{n['start']:.3f}–{n['end']:.3f}|{n['text'].replace(chr(10),' / ')}|{', '.join(n['issues'])}|")
 lines+=['','## 运行记录','','builder是离线重切，不重新推理；每份耗时RTF、峰值RSS、swap/available前后保存在builder-metrics.json，每份目录内metrics.json也保留。ASR旧内存计时不冒充本轮重切数据。所有RTF>3条目统一列在最终REPORT.md。未听审、不下质量结论。']
 (RUN/'BUILDER_REPORT.md').write_text('\n'.join(lines)+'\n')
 with (RUN/'before-after.csv').open('w') as f:
  fields=['group','model','id']+[prefix+k for prefix in ['before_','after_'] for k in keys];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
  for r in rows:w.writerow({**{k:r[k] for k in ['group','model','id']},**{prefix+k:r[prefix[:-1]][k] for prefix in ['before_','after_'] for k in keys}})
 print('Built',len(rows),'main',sum(r['group']=='main24' for r in rows));print('hard violations',sum(r['after']['over_7_seconds']+r['after']['over_42_chars']+r['after']['over_2_lines'] for r in rows));print('CPS',sum(r['after']['over_20_cps'] for r in rows),'short',sum(r['after']['under_5_6_seconds'] for r in rows))
if __name__=='__main__':main()
