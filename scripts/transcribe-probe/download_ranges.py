"""Public HTTP Range download, pinned revision, checked byte ranges and SHA256."""
import os
os.environ['HF_ENDPOINT']='https://hf-mirror.com'
import concurrent.futures,hashlib,json,pathlib,re,subprocess,time
root=pathlib.Path(__file__).resolve().parent

def model(size):
 info=json.loads((root/f'{size}-model-api.json').read_text());dest=root/'models'/size
 url=f"{os.environ['HF_ENDPOINT']}/Systran/faster-whisper-{size}/resolve/{info['sha']}/model.bin"
 headers=dest/'range-probe.headers';probe=dest/'range-probe.bin'
 if not headers.exists() or not re.search(r'content-range: bytes 0-0/(\d+)',headers.read_text(),re.I):
  r=subprocess.run(['curl','-sSL','--fail','--range','0-0','--max-time','40','--dump-header',str(headers),'-o',str(probe),url])
  if r.returncode:raise RuntimeError(f'{size} HTTP probe failed')
 head=headers.read_text();total=int(re.findall(r'content-range: bytes 0-0/(\d+)',head,re.I)[-1]);sha=re.findall(r'x-linked-etag: "([a-f0-9]+)"',head,re.I)[-1]
 # Reuse the unmodified public CDN Location returned by the mirror redirect chain.
 locations=re.findall(r'^location: (.+)$',head,re.I|re.M)
 media_url=locations[-1].strip() if locations else url
 chunks=dest/'chunks';chunks.mkdir(exist_ok=True);n=8;span=(total+n-1)//n
 def part(i):
  start=i*span;end=min(total-1,(i+1)*span-1);dst=chunks/f'{i:02}.bin';h=chunks/f'{i:02}.headers'
  if dst.exists() and dst.stat().st_size==end-start+1:return dst
  tmp=pathlib.Path(str(dst)+'.part')
  attempts=0
  while not tmp.exists() or tmp.stat().st_size<end-start+1:
   offset=tmp.stat().st_size if tmp.exists() else 0
   a=start+offset;b=min(end,a+4*1024*1024-1);tail=chunks/f'{i:02}.tail'
   with (chunks/f'{i:02}.log').open('a') as log:
    rc=subprocess.run(['curl','-sSL','--fail','--range',f'{a}-{b}','--connect-timeout','20','--max-time','90','--dump-header',str(h),'-o',str(tail),media_url],stdout=log,stderr=log).returncode
   valid=h.exists() and bool(re.search(rf'content-range: bytes {a}-{b}/{total}',h.read_text(),re.I))
   if valid and tail.exists() and 0<tail.stat().st_size<=b-a+1:
    with tmp.open('ab') as out,tail.open('rb') as inp:out.write(inp.read())
   if rc and rc not in (18,28,35,56,92):raise RuntimeError(f'{size} range {i}: curl {rc}')
   attempts=attempts+1 if rc else 0
   if attempts>=8:raise RuntimeError(f'{size} range {i}: eight consecutive transport failures')
   if not rc and (not valid or not tail.exists() or tail.stat().st_size!=b-a+1):raise RuntimeError('Unexpected byte range')
  if tmp.stat().st_size!=end-start+1:raise RuntimeError('Unexpected byte count')
  tmp.rename(dst);print(size,'range',i,'done',flush=True);return dst
 started=time.perf_counter()
 with concurrent.futures.ThreadPoolExecutor(max_workers=n) as pool:parts=list(pool.map(part,range(n)))
 target=dest/'model.bin';hasher=hashlib.sha256()
 with target.open('wb') as out:
  for f in parts:
   with f.open('rb') as inp:
    for block in iter(lambda:inp.read(1024*1024),b''):hasher.update(block);out.write(block)
 actual=hasher.hexdigest()
 if actual!=sha:raise RuntimeError('SHA256 mismatch')
 (dest/'range-download.json').write_text(json.dumps(dict(model=size,url=url,revision=info['sha'],bytes=total,sha256=actual,verified=True,seconds=time.perf_counter()-started,connections=n),indent=2));print(size,'VERIFIED',total,flush=True)
if __name__ == '__main__':
 import sys
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(model,sys.argv[1:] or ['small','medium']))
