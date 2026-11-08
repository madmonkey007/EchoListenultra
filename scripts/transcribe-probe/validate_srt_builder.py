"""Independent checks on exported SRT text and timestamp provenance."""
import json
from pathlib import Path
from probe import ROOT,save
from srt_builder import metrics
from build_existing import parse_srt
run=ROOT/'runs/20261022-srt-builder';rows=json.loads((run/'builder-metrics.json').read_text());errors=[]
assert len(rows)==34 and sum(r['group']=='main24' for r in rows)==24
for r in rows:
 raw=json.loads(Path(r['source']).read_text());cues=parse_srt(Path(r['output']));actual=metrics(cues)
 if actual!=r['after']:errors.append(r['output']+' metric mismatch')
 source=' '.join(''.join(w['word'] for s in raw for w in s.get('words') or []).split())
 target=' '.join(' '.join(c['text'] for c in cues).split())
 if source!=target:errors.append(r['output']+' word mismatch')
 endpoints={round(float(w[k])*1000) for s in raw for w in s.get('words') or [] for k in ['start','end']}
 for c in cues:
  if any(round(c[k]*1000) not in endpoints for k in ['start','end']):errors.append(r['output']+' invented time')
 if any(c['end']>n['start']+.001 for c,n in zip(cues,cues[1:])):errors.append(r['output']+' overlap')
 if any(actual[k] for k in ['over_7_seconds','over_42_chars','over_2_lines','zero_duration']):errors.append(r['output']+' hard violation')
params=json.loads((run/'parameters/summary.json').read_text());assert len(params)==13
save(run/'validation.json',dict(builder_count=34,main_count=24,parameter_count=13,errors=errors,remaining_cps=sum(r['after']['over_20_cps'] for r in rows),remaining_short=sum(r['after']['under_5_6_seconds'] for r in rows),note='Validation verifies accurate exceptions; 20CPS is not universally satisfied.'))
print('builder34 + parameters13; errors:',errors)
if errors:raise SystemExit(1)
