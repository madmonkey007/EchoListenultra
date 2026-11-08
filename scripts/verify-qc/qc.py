#!/usr/bin/env python3
"""Local-only multi-model listening review. Python stdlib + optional FFmpeg."""
import argparse,base64,csv,hashlib,json,os,re,shutil,subprocess,sys,wave
from pathlib import Path
from qc_core import align_models,auto_flags,conflict_rows,load_segments,parse_srt,wer
ROOT=Path(__file__).resolve().parent

def save(path,obj):Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def csv_write(path,fields,rows):
 with Path(path).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
  for row in rows:
   safe={k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in row.items() if k in fields}
   safe={k:("'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@')) else v) for k,v in safe.items()}
   w.writerow(safe)
def local_path(value,parent):
 p=Path(value).expanduser();p=p if p.is_absolute() else parent/p
 if not p.is_file():raise ValueError(f'Local input file missing: {p}')
 return p.resolve()
def ffmpeg_binary(explicit=None):
 if explicit:
  p=shutil.which(explicit) or (str(Path(explicit).resolve()) if Path(explicit).is_file() else None)
  if not p:raise ValueError('FFmpeg executable does not exist')
  return p
 if shutil.which('ffmpeg'):return shutil.which('ffmpeg')
 try:
  import imageio_ffmpeg
  return imageio_ffmpeg.get_ffmpeg_exe()
 except ImportError:raise ValueError('Video/non-PCM input needs FFmpeg. Use --ffmpeg /absolute/path or the existing transcribe-probe .venv.')
def normalize_audio(source,target,ffmpeg=None):
 try:
  with wave.open(str(source),'rb') as w:
   okay=w.getnchannels()==1 and w.getsampwidth()==2 and w.getcomptype()=='NONE'
  if okay:
   if source!=target.resolve():shutil.copyfile(source,target)
   return
 except (wave.Error,EOFError):pass
 cmd=[ffmpeg_binary(ffmpeg),'-nostdin','-hide_banner','-loglevel','error','-y','-i',str(source),'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',str(target)]
 r=subprocess.run(cmd,capture_output=True,text=True)
 if r.returncode:raise ValueError('FFmpeg audio extraction failed: '+r.stderr[-3000:])
def cut_clip(source,target,start,end):
 with wave.open(str(source),'rb') as w:
  rate=w.getframerate();count=w.getnframes();a=max(0,min(count,round(start*rate)));z=max(a,min(count,round(end*rate)));params=w.getparams();w.setpos(a);frames=w.readframes(z-a)
 with wave.open(str(target),'wb') as w:w.setparams(params);w.writeframes(frames)
 return a/rate,z/rate

def build(manifest_path,out,ffmpeg=None):
 manifest_path=Path(manifest_path).resolve();config=json.loads(manifest_path.read_text());parent=manifest_path.parent
 model_config=config.get('models',{})
 if not isinstance(model_config,dict) or len(model_config)<2:raise ValueError('Manifest needs at least two named model outputs')
 if any(not isinstance(k,str) or not k.strip() or k in {'__proto__','prototype','constructor'} for k in model_config):raise ValueError('Nonempty model names required')
 models=list(model_config);reference=config.get('reference_model',models[0])
 if reference not in models:raise ValueError('reference_model must name one input model')
 models=[reference]+[x for x in models if x!=reference]
 audio=local_path(config['audio'],parent);sources={};words={};cues={};hashes={}
 for name in models:
  paths={k:local_path(model_config[name][k],parent) for k in ['segments','srt']}
  words[name]=load_segments(paths['segments']);cues[name]=parse_srt(paths['srt']);sources[name]={k:str(p) for k,p in paths.items()};hashes[name]={k:digest(p) for k,p in paths.items()}
 out=Path(out).resolve();out.mkdir(parents=True,exist_ok=True);(out/'clips').mkdir(exist_ok=True)
 normalized=out/'audio.wav';normalize_audio(audio,normalized,ffmpeg)
 with wave.open(str(normalized)) as w:duration=w.getnframes()/w.getframerate()
 if duration<=0:raise ValueError('Empty source audio')
 for name in models:
  if any(w['end']>duration+5 for w in words[name]):raise ValueError(f'{name}: word times exceed audio by >5s. Check source/crop match.')
 fingerprint=dict(core_sha256=digest(ROOT/'qc_core.py'),audio_sha256=digest(audio),input_sha256=hashes,models=models,reference=reference,padding=1.5,tool_version=1)
 dataset_id=hashlib.sha256(json.dumps(fingerprint,sort_keys=True).encode()).hexdigest()[:24]
 cols=align_models(words);rows=conflict_rows(cols,cues[reference],models)
 flags=[f for name in models for f in auto_flags(name,cues[name])]
 clip_index=[]
 for row in rows:
  a=max(0,row['start']-1.5);z=min(duration,row['end']+1.5)
  if z<=a:raise ValueError('Review row has no audio interval: '+str(row['segment_index']))
  filename=f"segment_{row['segment_index']:04d}_{a:09.3f}-{z:09.3f}.wav";clip=out/'clips'/filename;a,z=cut_clip(normalized,clip,a,z)
  row['audio']=dict(src='data:audio/wav;base64,'+base64.b64encode(clip.read_bytes()).decode(),start=a,end=z)
  row['flags']=sorted({f['kind'] for f in flags if f['start']<=row['end'] and f['end']>=row['start']})
  row['disagreement_clip_paths']=[]
  for di,span in enumerate(row['disagreement_spans'],1):
   da=max(0,span['start']-1.5);dz=min(duration,span['end']+1.5)
   point=out/'clips'/f"segment_{row['segment_index']:04d}_diff_{di:02d}_{da:09.3f}-{dz:09.3f}.wav"
   da,dz=cut_clip(normalized,point,da,dz);row['disagreement_clip_paths'].append(str(point))
   clip_index.append(dict(kind='disagreement',segment_index=row['segment_index'],disagreement_index=di,core_start=span['start'],core_end=span['end'],clip_start=da,clip_end=dz,path=str(point),conflict=True))
  clip_index.append(dict(kind='cue',segment_index=row['segment_index'],core_start=row['start'],core_end=row['end'],clip_start=a,clip_end=z,path=str(clip),conflict=row['conflict']))
 data=dict(version=1,dataset_id=dataset_id,models=models,sample_id=config.get('sample_id',manifest_path.stem),source=dict(audio_path=str(audio),models=sources),rows=rows,flags=flags,meta=dict(duration=duration,reference_model=reference,padding_seconds=1.5,alignment='progressive word edit alignment; time breaks lexical ties; first model anchors cues',fingerprint=fingerprint,ground_truth_provided=False,notes=['capitalized differing tokens are possible names, not confirmed errors','WER compares manually filled core text; do not include the 1.5s padding','SRT automatic flags are heuristics; gaps do not prove omitted speech']))
 save(out/'qc-data.json',data);save(out/'clips-index.json',clip_index)
 template=(ROOT/'page.html').read_text();assert template.count('__QC_DATA__')==1
 embedded=json.dumps(data,ensure_ascii=False,allow_nan=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
 (out/'review.html').write_text(template.replace('__QC_DATA__',embedded),encoding='utf-8')
 fields=['segment_index','reference_cue_index','start','end','suspicion_score','reasons','disagreement_spans','disagreement_clip_paths']+[name+suffix for name in models for suffix in ['_text','_disagreement_words','_highlighted']]
 conflicts=[]
 for row in sorted((r for r in rows if r['conflict']),key=lambda r:(-r['suspicion_score'],r['start'])):
  item={k:row[k] for k in fields if k in row}
  for name in models:
   ts=row['tokens'][name];item[name+'_text']=row['texts'][name];item[name+'_disagreement_words']=[t['text'].strip() for t in ts if t['diff']];item[name+'_highlighted']=''.join(re.sub(r'^(\s*)(.*?)(\s*)$',lambda m:m[1]+'**'+m[2]+'**'+m[3],t['text'],flags=re.S) if t['diff'] else t['text'] for t in ts).strip()
  conflicts.append(item)
 csv_write(out/'conflicts.csv',fields,conflicts)
 csv_write(out/'auto-flags.csv',['model','cue_index','start','end','kind','details'],flags)
 cm=[]
 for name in models:
  for i,c in enumerate(cues[name],1):
   d=c['end']-c['start'];chars=len(c['text'].replace('\n',' '));cm.append(dict(model=name,cue_index=i,start=c['start'],end=c['end'],chars=chars,cps=chars/d if d>0 else None,text=c['text'],flags=[f['kind'] for f in flags if f['model']==name and f['cue_index']==i]))
 csv_write(out/'cue-metrics.csv',['model','cue_index','start','end','chars','cps','text','flags'],cm)
 save(out/'summary.json',dict(sample_id=data['sample_id'],dataset_id=dataset_id,models=models,row_count=len(rows),conflict_rows=len(conflicts),auto_flags=len(flags),clips=len(clip_index),duration=duration,review_html=str(out/'review.html'),ground_truth_count=0,wer=None))
 return data

def score_reviews(data_path,reviews_path,out):
 data=json.loads(Path(data_path).read_text());reviews=json.loads(Path(reviews_path).read_text())
 if reviews.get('dataset_id')!=data['dataset_id']:raise ValueError('Review dataset_id does not match this dataset')
 stored=reviews.get('reviews',{});results=[];totals={name:dict(reference_words=0,substitutions=0,deletions=0,insertions=0,reviewed_rows=0) for name in data['models']}
 for row in data['rows']:
  review=stored.get(str(row['segment_index']),{})
  if review.get('truth_provided') is not True:continue
  if not isinstance(review.get('truth'),str):raise ValueError('Reviewed truth must be a string (empty is allowed only when explicitly provided)')
  truth=review['truth']
  for name in data['models']:
   result=wer(truth,row['texts'][name]);result={k:v for k,v in result.items() if k!='operations'}
   results.append(dict(segment_index=row['segment_index'],start=row['start'],end=row['end'],model=name,status=review.get('models',{}).get(name,{}).get('status',''),truth=truth,hypothesis=row['texts'][name],**result))
   for key in ['reference_words','substitutions','deletions','insertions']:totals[name][key]+=result[key]
   totals[name]['reviewed_rows']+=1
 for t in totals.values():t['wer']=(t['substitutions']+t['deletions']+t['insertions'])/t['reference_words'] if t['reference_words'] else None
 out=Path(out);out.mkdir(parents=True,exist_ok=True);save(out/'wer.json',dict(dataset_id=data['dataset_id'],rows=results,totals=totals,normalization='NFKC, lowercase, curly apostrophe normalized, punctuation ignored; digits/currency retained; empty reference WER=N/A'))
 csv_write(out/'wer.csv',['segment_index','start','end','model','status','truth','hypothesis','reference_words','hypothesis_words','substitutions','deletions','insertions','distance','wer'],results)
 return dict(reviewed_rows=len(results)//len(data['models']),totals=totals)

def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
 b=sub.add_parser('build');b.add_argument('manifest');b.add_argument('--out',required=True);b.add_argument('--ffmpeg')
 w=sub.add_parser('wer');w.add_argument('data');w.add_argument('reviews');w.add_argument('--out',required=True)
 a=p.parse_args()
 try:
  if a.command=='build':
   d=build(a.manifest,a.out,a.ffmpeg);print(json.dumps({'rows':len(d['rows']),'conflicts':sum(r['conflict'] for r in d['rows']),'html':str(Path(a.out).resolve()/'review.html')},ensure_ascii=False))
  else:print(json.dumps(score_reviews(a.data,a.reviews,a.out),ensure_ascii=False))
 except (ValueError,TypeError,KeyError,OSError,wave.Error) as e:p.exit(1,f'QC error: {e}\n')
if __name__=='__main__':main()
