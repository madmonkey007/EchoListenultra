"""One-off VAD matrix; imports no website code."""
import os
os.environ['HF_ENDPOINT']='https://hf-mirror.com'
import argparse,json,re,subprocess,time,wave
from pathlib import Path
from dataclasses import asdict
from probe import ROOT,PeakRSS,save,sentence_cues,srt_text

def cue_metrics(cues):
 return dict(max_seconds=max((c['end']-c['start'] for c in cues),default=0),max_chars=max((len(c['text']) for c in cues),default=0),over_7_seconds=sum(int(c['end']-c['start']>7) for c in cues),over_42_chars=sum(len(c['text'])>42 for c in cues),zero_duration=sum(int(c['end']<=c['start']) for c in cues))

def repeats(segments):
 tokens=[]
 for s in segments:
  for t in re.findall(r"\w+(?:['’]\w+)*",s['text'].lower()):tokens.append((t,s['start'],s['end']))
 out=[]; covered=set()
 for n in range(min(50,len(tokens)//3),0,-1):
  i=0
  while i+3*n<=len(tokens):
   phrase=[x[0] for x in tokens[i:i+n]]; count=1
   if any(n%d==0 and phrase==phrase[:d]*(n//d) for d in range(1,n)):
    i+=1;continue
   while i+(count+1)*n<=len(tokens) and [x[0] for x in tokens[i+count*n:i+(count+1)*n]]==phrase:count+=1
   if count>=3 and not all(k in covered for k in range(i,i+count*n)):
    out.append(dict(phrase=' '.join(phrase),count=count,start=tokens[i][1],end=tokens[i+count*n-1][2],token_start=i,token_end=i+count*n,time_precision='containing model segments; not exact word times'))
    covered.update(range(i,i+count*n));i+=count*n
   else:i+=1
 return sorted(out,key=lambda x:x['token_start'])

def memory():
 import psutil
 cmds=[['free','-m'],['sysctl','vm.swapusage'],['vm_stat']]
 raw={}
 for cmd in cmds:
  try:
   r=subprocess.run(cmd,capture_output=True,text=True);raw[' '.join(cmd)]={'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
  except FileNotFoundError as e:raw[' '.join(cmd)]={'error':str(e)}
 v=psutil.virtual_memory();s=psutil.swap_memory()
 return dict(time=time.time(),total_mib=v.total/2**20,available_mib=v.available/2**20,swap_used_mib=s.used/2**20,swap_total_mib=s.total/2**20,swap_in_bytes=s.sin,swap_out_bytes=s.sout,raw=raw)

def run(size,out):
 from faster_whisper import WhisperModel
 model=WhisperModel(str(ROOT/'models'/size),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1)
 samples={s['id']:s for s in json.loads((ROOT/'samples.json').read_text())}
 for group in 'ABC':
  for id in ['DdTrkOFgmiD','DbQzbzrAJ-V','DbgNy0XxMZH','DeqblVZAh4m']:
   folder=out/size/group/id;folder.mkdir(parents=True,exist_ok=True)
   if (folder/'metrics.json').exists():continue
   source=Path(samples[id]['audio_path']);audio=source
   if id=='DbgNy0XxMZH':
    audio=folder/'input-45s.wav'
    with wave.open(str(source)) as w:
     params=w.getparams();data=w.readframes(45*w.getframerate())
    with wave.open(str(audio),'wb') as w:w.setparams(params);w.writeframes(data)
   with wave.open(str(audio)) as w:duration=w.getnframes()/w.getframerate()
   opts=dict(vad_filter=group!='A',condition_on_previous_text=group=='A',word_timestamps=group=='C',beam_size=5,temperature=0)
   before=memory();save(folder/'memory-before.json',before)
   print(size,group,id,'START',flush=True)
   with PeakRSS() as rss:
    start=time.perf_counter();gen,info=model.transcribe(str(audio),**opts);segments=[asdict(s) for s in gen];elapsed=time.perf_counter()-start
   after=memory();save(folder/'memory-after.json',after)
   # Same exporter as prior probe. A/B use original model segments because no word times exist.
   cues=sentence_cues(segments) if group=='C' else [dict(start=s['start'],end=s['end'],text=s['text'].strip()) for s in segments if s['text'].strip()]
   save(folder/'raw-segments.json',segments);save(folder/'segments.json',cues)
   (folder/'transcript.txt').write_text(' '.join(s['text'].strip() for s in segments)+'\n')
   (folder/'transcript.srt').write_text(srt_text(cues))
   rep=repeats(segments);save(folder/'repeats.json',rep)
   hits=[dict(start=s['start'],end=s['end'],text=s['text']) for s in segments if re.search(r'thank\s+you\s+for\s+watching',s['text'],re.I)]
   save(folder/'metrics.json',dict(model=size,group=group,id=id,source=str(source),input=str(audio),duration=duration,elapsed=elapsed,rtf=elapsed/duration,peak_rss_mib=rss.peak/2**20,device='cpu',options=opts,word_count=len(re.findall(r'\b\w+\b',' '.join(s['text'] for s in segments))),cue_metrics=cue_metrics(cues),repeats=rep,thank_you_hits=hits,memory_before=before,memory_after=after))
   print(size,group,id,'DONE',round(elapsed,3),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--model',choices=['small','medium'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();run(a.model,a.output.resolve())
