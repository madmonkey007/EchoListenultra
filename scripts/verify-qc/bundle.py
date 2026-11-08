"""Embed existing review datasets and audio into one offline sample-switching HTML."""
import argparse,base64,hashlib,io,json,re,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LABELS={'DbQzbzrAJ-V':'访谈 · DbQzbzrAJ-V','DdTrkOFgmiD':'钢琴 · DdTrkOFgmiD','DbgNy0XxMZH':'基线口播（完整音频） · DbgNy0XxMZH','DNZKRiUvpc9':'长口播 · DNZKRiUvpc9','DeqblVZAh4m':'舞台讲话 · DeqblVZAh4m'}

def wav_duration(source):
 if not source.startswith('data:audio/wav;base64,'):raise ValueError('Audio must be embedded WAV')
 raw=base64.b64decode(source.split(',',1)[1],validate=True)
 if raw[:4]!=b'RIFF' or raw[8:12]!=b'WAVE':raise ValueError('Invalid embedded WAV')
 with wave.open(io.BytesIO(raw),'rb') as audio:
  return audio.getnframes()/audio.getframerate()

def validate_bundle(path):
 path=Path(path);html=path.read_text(encoding='utf-8');match=re.search(r'<script id="qc-data" type="application/json">(.*?)</script>',html,re.S)
 if not match:raise ValueError('Missing embedded dataset')
 payload=json.loads(match[1]);datasets=payload['datasets'];ids=[d['dataset_id'] for d in datasets]
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate dataset IDs')
 clip_count=0;full_count=0
 for d in datasets:
  if 'full_audio' in d:
   audio=d['full_audio'];duration=wav_duration(audio['src'])
   if abs(duration-audio['duration'])>0.001:raise ValueError('Full audio duration mismatch')
   full_count+=1
   for model in d['models']:
    transcript=d['full_transcripts'][model]
    expected=[dict(segment_index=r['segment_index'],start=r['start'],end=r['end'],text=r['texts'].get(model,''),tokens=r.get('tokens',{}).get(model,[])) for r in sorted(d['rows'],key=lambda r:(r['start'],r['segment_index']))]
    if transcript!=expected:raise ValueError('Full transcript text or row mapping mismatch')
  else:
   for row in d['rows']:
    wav_duration(row['audio']['src']);clip_count+=1
 if '__QC_DATA__' in html:raise ValueError('Unsubstituted template')
 return dict(sample_count=len(datasets),sample_ids=[d['sample_id'] for d in datasets],review_rows=sum(len(d['rows']) for d in datasets),embedded_audio_clips=clip_count,embedded_full_audio=full_count,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),html=str(path.resolve()),errors=[])

def make_bundle(paths,out):
 datasets=[json.loads(Path(p).read_text(encoding='utf-8')) for p in paths]
 if not datasets:raise ValueError('No review datasets')
 ids=[d['dataset_id'] for d in datasets]
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate dataset IDs')
 for d,p in zip(datasets,paths):
  d['label']=LABELS.get(d['sample_id'],d['sample_id'])
  raw=(Path(p).parent/'audio.wav').read_bytes()
  source='data:audio/wav;base64,'+base64.b64encode(raw).decode('ascii')
  d['full_audio']=dict(src=source,duration=wav_duration(source))
  d['full_transcripts']={model:[dict(segment_index=r['segment_index'],start=r['start'],end=r['end'],text=r['texts'].get(model,''),tokens=r.get('tokens',{}).get(model,[])) for r in sorted(d['rows'],key=lambda r:(r['start'],r['segment_index']))] for model in d['models']}
  for row in d['rows']:
   row.get('audio',{}).pop('src',None)
 datasets.sort(key=lambda d:(d['sample_id']!='DbQzbzrAJ-V',d['sample_id']))
 payload=dict(version=1,kind='verify-qc-bundle',datasets=datasets)
 embedded=json.dumps(payload,ensure_ascii=False,allow_nan=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
 template=(ROOT/'page.html').read_text();assert template.count('__QC_DATA__')==1
 out=Path(out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(template.replace('__QC_DATA__',embedded),encoding='utf-8')
 return validate_bundle(out)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('datasets',nargs='*',type=Path);p.add_argument('--out',type=Path,default=ROOT/'review.html');a=p.parse_args()
 paths=a.datasets
 if not paths:
  summaries=json.loads((ROOT/'runs/summary.json').read_text());paths=[Path(s['review_html']).parent/'qc-data.json' for s in summaries]
 result=make_bundle(paths,a.out)
 (ROOT/'runs/bundle-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
