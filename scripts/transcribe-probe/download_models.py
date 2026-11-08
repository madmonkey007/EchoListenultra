"""Download chosen model snapshots through HF_ENDPOINT; preserve redirects and errors."""
import os
os.environ['HF_ENDPOINT']='https://hf-mirror.com'
import json,pathlib,subprocess,time,concurrent.futures
root=pathlib.Path(__file__).resolve().parent

def fetch(size):
 info=json.loads((root/f'{size}-model-api.json').read_text());dest=root/'models'/size;dest.mkdir(parents=True,exist_ok=True);rows=[]
 for name in ['config.json','tokenizer.json','vocabulary.txt','model.bin']:
  target=dest/name
  if target.exists() and (name!='model.bin' or target.stat().st_size>100000000):continue
  url=f"{os.environ['HF_ENDPOINT']}/Systran/faster-whisper-{size}/resolve/{info['sha']}/{name}"
  start=time.perf_counter()
  with (dest/(name+'.download.log')).open('w') as log:
   r=subprocess.run(['curl','--location','--fail','--connect-timeout','20','--max-time','1200','--retry','1','--output',str(target)+'.part','--write-out','\nfinal_url=%{url_effective}\nhttp_code=%{http_code}\nsize=%{size_download}\n',url],stdout=log,stderr=log)
  row=dict(model=size,file=name,exit=r.returncode,seconds=time.perf_counter()-start,url=url);rows.append(row)
  (dest/'download-status.json').write_text(json.dumps(rows,indent=2))
  print(row,flush=True)
  if r.returncode:raise RuntimeError(f'{size}/{name} failed, see log')
  pathlib.Path(str(target)+'.part').rename(target)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(fetch,['small','medium']))
