"""Recompute displayed metrics from actual SRT files; verify all 24 cases."""
import json,re,hashlib
from pathlib import Path
from probe import ROOT,save
from vad_experiment import cue_metrics,repeats
root=ROOT/'runs/20261022-vad'
def seconds(s):
 h,m,v=s.split(':');return int(h)*3600+int(m)*60+float(v.replace(',','.'))
errors=[];paths=list(root.glob('*/*/*/metrics.json'))
for p in paths:
 d=json.loads(p.read_text());f=p.parent
 text=(f/'transcript.srt').read_text();cues=[]
 for b in text.strip().split('\n\n') if text.strip() else []:
  lines=b.splitlines();a,z=lines[1].split(' --> ');cues.append(dict(start=seconds(a),end=seconds(z),text='\n'.join(lines[2:])))
 raw=json.loads((f/'raw-segments.json').read_text());d['cue_metrics']=cue_metrics(cues);d['repeats']=repeats(raw)
 save(p,d);save(f/'repeats.json',d['repeats'])
 assert d['options']==dict(vad_filter=d['group']!='A',condition_on_previous_text=d['group']=='A',word_timestamps=d['group']=='C',beam_size=5,temperature=0)
 assert abs(d['rtf']-d['elapsed']/d['duration'])<1e-10
 assert Path(d['source']).exists()
 assert len(cues)==len(json.loads((f/'segments.json').read_text()))
 for c in cues:
  if c['end']<c['start']:errors.append(str(f)+' negative cue')
 for name in ['memory-before.json','memory-after.json','transcript.txt','raw-segments.json']:
  assert (f/name).exists()
expected={(m,g,s) for m in ['small','medium'] for g in 'ABC' for s in ['DdTrkOFgmiD','DbQzbzrAJ-V','DbgNy0XxMZH','DeqblVZAh4m']}
actual={(p.parts[-4],p.parts[-3],p.parts[-2]) for p in paths}
if actual!=expected:errors.append('missing expected cases: '+repr(expected-actual))
save(root/'validation.json',dict(case_count=len(paths),expected=24,errors=errors))
print('validated',len(paths),'errors',errors)
if errors:raise SystemExit(1)
