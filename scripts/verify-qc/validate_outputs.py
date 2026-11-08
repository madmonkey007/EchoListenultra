"""Verify generated CSV, embedded audio, actual PCM clips and no fake references."""
import base64,csv,json,re,wave
from collections import Counter
from pathlib import Path
from qc import ROOT,save,digest
from qc_core import load_segments,tokenize

def main():
 summary=json.loads((ROOT/'runs/summary.json').read_text());errors=[];clip_total=0;point_total=0
 for s in summary:
  folder=Path(s['review_html']).parent;data=json.loads((folder/'qc-data.json').read_text());html=(folder/'review.html').read_text()
  embedded=json.loads(re.search(r'<script id="qc-data" type="application/json">(.*?)</script>',html,re.S)[1]);assert embedded==data
  assert '__QC_DATA__' not in html and not re.search(r'<(?:script|link)[^>]+(?:src|href)=["\']https?://',html)
  assert data['meta']['ground_truth_provided'] is False and s['ground_truth_count']==0 and s['wer'] is None
  assert digest(data['source']['audio_path'])==data['meta']['fingerprint']['audio_sha256']
  for model in data['models']:
   source=load_segments(data['source']['models'][model]['segments'])
   expected=Counter(x['norm'] for x in source if not x.get('marker'))
   actual=Counter(tokenize(' '.join(r['texts'][model] for r in data['rows'])))
   assert expected==actual,(s['sample_id'],model,'word loss/addition')
  with (folder/'conflicts.csv').open(encoding='utf-8-sig',newline='') as f:conflicts=list(csv.DictReader(f))
  assert {int(r['segment_index']) for r in conflicts}=={r['segment_index'] for r in data['rows'] if r['conflict']}
  assert [int(r['suspicion_score']) for r in conflicts]==sorted([r['suspicion_score'] for r in data['rows'] if r['conflict']],reverse=True)
  with wave.open(str(folder/'audio.wav'),'rb') as audio:
   rate=audio.getframerate();count=audio.getnframes();pcm=audio.readframes(count);width=audio.getsampwidth()*audio.getnchannels();duration=count/rate
  index=json.loads((folder/'clips-index.json').read_text());clip_total+=len(index);point_total+=sum(c['kind']=='disagreement' for c in index)
  cue_clips={c['segment_index']:c for c in index if c['kind']=='cue'}
  for c in index:
   a,z=round(c['clip_start']*rate),round(c['clip_end']*rate)
   assert abs(c['clip_start']-max(0,c['core_start']-1.5))<=1/rate
   assert abs(c['clip_end']-min(duration,c['core_end']+1.5))<=1/rate
   with wave.open(c['path'],'rb') as w:assert w.readframes(w.getnframes())==pcm[a*width:z*width]
  for r in data['rows']:
   assert base64.b64decode(r['audio']['src'].split(',',1)[1])==Path(cue_clips[r['segment_index']]['path']).read_bytes()
  with (folder/'auto-flags.csv').open(encoding='utf-8-sig',newline='') as f:assert len(list(csv.DictReader(f)))==len(data['flags'])
 result=dict(sample_count=len(summary),model_count_per_sample=2,review_rows=sum(s['row_count'] for s in summary),conflict_rows=sum(s['conflict_rows'] for s in summary),clips=clip_total,disagreement_clips=point_total,errors=errors,ground_truth_count=0,wer=None,browser_interaction='not verified; file:// blocked by tool policy',verified=['no word loss/addition','audio frame exactness and padding','embedded audio and JSON','conflict sorting','CSV coverage','source audio hashes'])
 save(ROOT/'runs/validation.json',result);print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
