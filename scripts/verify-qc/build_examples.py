"""Rebuild the 12 existing local small/medium sample review packages."""
import argparse,csv,json
from pathlib import Path
from qc import ROOT,build,save,csv_write

def main():
 p=argparse.ArgumentParser();p.add_argument('--include-video',action='store_true');a=p.parse_args();rows=[]
 for manifest in sorted((ROOT/'manifests').glob('*.json')):
  build(manifest,ROOT/'runs'/manifest.stem);summary=json.loads((ROOT/'runs'/manifest.stem/'summary.json').read_text());rows.append(summary);print(summary['sample_id'],summary['conflict_rows'],flush=True)
 if a.include_video:build(ROOT/'video-input-smoke.json',ROOT/'runs/video-input-smoke')
 aggregate=[];all_flags=[];clip_index=[]
 for r in rows:
  folder=ROOT/'runs'/r['sample_id']
  with (folder/'conflicts.csv').open(encoding='utf-8-sig',newline='') as f:aggregate.extend(dict(sample_id=r['sample_id'],**x) for x in csv.DictReader(f))
  with (folder/'auto-flags.csv').open(encoding='utf-8-sig',newline='') as f:all_flags.extend(dict(sample_id=r['sample_id'],**x) for x in csv.DictReader(f))
  clip_index.extend(dict(sample_id=r['sample_id'],**x) for x in json.loads((folder/'clips-index.json').read_text()))
 aggregate.sort(key=lambda x:(-int(x['suspicion_score']),x['sample_id'],float(x['start'])))
 csv_write(ROOT/'runs/conflicts.csv',list(aggregate[0]) if aggregate else ['sample_id','segment_index'],aggregate)
 csv_write(ROOT/'runs/auto-flags.csv',['sample_id','model','cue_index','start','end','kind','details'],all_flags)
 save(ROOT/'runs/clips-index.json',clip_index)
 save(ROOT/'runs/summary.json',rows);csv_write(ROOT/'runs/summary.csv',['sample_id','row_count','conflict_rows','auto_flags','clips','duration','review_html'],rows)
 from bundle import make_bundle
 save(ROOT/'runs/bundle-validation.json',make_bundle([ROOT/'runs'/r['sample_id']/'qc-data.json' for r in rows],ROOT/'review.html'))
 lines=['# 本地人工核对入口','',f'统一入口：[打开含全部12条文件的核对网页]({ROOT/"review.html"})。在顶部选择文件即可切换，数据和音频已内嵌。', '', '12条真实样本，small/medium，ground truth均未填写。双击每个review.html可用普通浏览器离线打开。单页已内嵌片段，不需要服务器；本工具未部署。','', '|样本|对照条目|分歧条目|自动标记|页面|分歧CSV|','|---|---:|---:|---:|---|---|']
 for r in rows:
  sid=r['sample_id'];f=ROOT/'runs'/sid;lines.append(f"|{sid}|{r['row_count']}|{r['conflict_rows']}|{r['auto_flags']}|[打开核对页]({f/'review.html'})|[conflicts.csv]({f/'conflicts.csv'})|")
 lines+=['','## 自动检查范围','','差异按规范化词比对，忽略大小写/标点；专名仅大小写启发式。漏句候选为>2秒间隙+无句末标点+后文小写/连接词，不能证明漏句。共有错误不会被模型间diff自动发现。','', 'auto-flags.csv内over_42_chars是每cue总字符数>42；line_over_42_chars才是单行超限。cue-metrics.csv保留每条cue字符/秒。低CPS使用每份SRT中位数/MAD阈值，不是听音结论。','', 'CSV的*_highlighted列用**标记**表示分歧；HTML才显示黄色高亮。CSV为UTF-8 BOM，并对潜在公式前缀做转义。','', '每个cue有完整对照片段；每个连续分歧词块另有_diff_片段，均前后各加1.5秒并在音频边缘截断，路径见每条样本clips-index.json及conflicts.csv。文件夹可能有重建前的旧片段，以clips-index.json为本次清单。','', '当前内置浏览器拒绝file://，因此实际浏览器交互验收未完成。已执行纯Node页面逻辑测试，不将它冒充浏览器验收。']
 (ROOT/'INDEX.md').write_text('\n'.join(lines)+'\n')
 print('TOTAL',sum(r['row_count'] for r in rows),sum(r['conflict_rows'] for r in rows))
if __name__=='__main__':main()
