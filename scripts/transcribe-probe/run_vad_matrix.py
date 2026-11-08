"""Sequential small/medium VAD experiment; resume completed cases."""
import subprocess,sys
from probe import ROOT
out=ROOT/'runs/20261022-vad'
for size in ['small','medium']:
 with (out/f'{size}.log').open('a') as log:
  subprocess.run([sys.executable,str(ROOT/'vad_experiment.py'),'--model',size,'--output',str(out)],stdout=log,stderr=subprocess.STDOUT,check=True)
# Recompute only repeat detection using the final tested primitive-phrase rule.
import json
from vad_experiment import repeats
for p in out.glob('*/*/*/metrics.json'):
 m=json.loads(p.read_text());m['repeats']=repeats(json.loads((p.parent/'raw-segments.json').read_text()))
 p.write_text(json.dumps(m,ensure_ascii=False,indent=2));(p.parent/'repeats.json').write_text(json.dumps(m['repeats'],ensure_ascii=False,indent=2))
subprocess.run([sys.executable,str(ROOT/'validate_vad.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'vad_report.py')],check=True)
