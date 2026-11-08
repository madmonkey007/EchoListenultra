"""Wait for verified pinned models, then run small and medium in separate CPU processes."""
import json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parent
run=root/'runs/20261021-small-medium'
run.mkdir(parents=True,exist_ok=True)

def ready(size):
 return (root/'models'/size/'range-download.json').exists()

for size in ['small','medium']:
 started=time.monotonic()
 while not ready(size):
  if time.monotonic()-started>3600:raise TimeoutError(f'Model {size} not ready after 1 hour')
  time.sleep(5)
 print('Model ready:',size,flush=True)
 with (run/f'{size}.stdout.log').open('a') as out,(run/f'{size}.stderr.log').open('a') as err:
  rc=subprocess.run([sys.executable,str(root/'probe.py'),'--model',size,'--model-dir',str(root/'models'/size),'--round','all','--output',str(run)],stdout=out,stderr=err).returncode
 print('Model complete:',size,'exit',rc,flush=True)
 (run/f'{size}-exit.json').write_text(json.dumps({'exit':rc}))
 if rc:raise RuntimeError(f'{size} failed; see stderr log')
subprocess.run([sys.executable,str(root/'refresh_reviews.py'),str(run)],check=True)
subprocess.run([sys.executable,str(root/'summarize.py'),str(run)],check=True)
