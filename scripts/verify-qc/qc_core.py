"""Pure, local QC algorithms. No ASR service or application imports."""
import json,math,re,statistics,unicodedata
from pathlib import Path
WORD=re.compile(r"\d+(?:[.,]\d+)*|[^\W\d_]+(?:['’][^\W\d_]+)*|[%$€£]",re.UNICODE)

def tokenize(text):return [m.group() for m in WORD.finditer(unicodedata.normalize('NFKC',text).replace('’',"'").lower())]

def wer(reference,hypothesis):
 a,b=tokenize(reference),tokenize(hypothesis);n,m=len(a),len(b)
 # Costs plus operation labels allow deterministic S/D/I accounting.
 dp=[[0]*(m+1) for _ in range(n+1)]
 for i in range(n+1):dp[i][0]=i
 for j in range(m+1):dp[0][j]=j
 for i in range(1,n+1):
  for j in range(1,m+1):dp[i][j]=min(dp[i-1][j-1]+(a[i-1]!=b[j-1]),dp[i-1][j]+1,dp[i][j-1]+1)
 i,j=n,m;s=d=ins=0;operations=[]
 while i or j:
  if i and j and a[i-1]==b[j-1] and dp[i][j]==dp[i-1][j-1]:operations.append(dict(op='equal',reference=a[i-1],hypothesis=b[j-1]));i-=1;j-=1
  elif i and j and dp[i][j]==dp[i-1][j-1]+1:s+=1;operations.append(dict(op='substitution',reference=a[i-1],hypothesis=b[j-1]));i-=1;j-=1
  elif i and dp[i][j]==dp[i-1][j]+1:d+=1;operations.append(dict(op='deletion',reference=a[i-1],hypothesis=''));i-=1
  else:ins+=1;operations.append(dict(op='insertion',reference='',hypothesis=b[j-1]));j-=1
 return dict(reference_words=n,hypothesis_words=m,substitutions=s,deletions=d,insertions=ins,distance=s+d+ins,wer=(s+d+ins)/n if n else None,operations=list(reversed(operations)))

def load_segments(path):
 data=json.loads(Path(path).read_text(encoding='utf-8-sig'))
 word_wrapper=isinstance(data,dict) and 'words' in data and 'segments' not in data
 if isinstance(data,dict):data=data.get('segments',data.get('words'))
 if not isinstance(data,list):raise ValueError(f'{path}: expected segments list or segments/words wrapper')
 units=[];last=-math.inf;full=''
 for si,s in enumerate(data):
  words=s.get('words')
  if words is None and ('word' in s or word_wrapper):words=[s]
  if words is None:
   if s.get('text','').strip():raise ValueError(f'{path}: segment {si} lacks word timestamps; use raw-segments.json')
   continue
  if not words and s.get('text','').strip():raise ValueError(f'{path}: nonempty segment {si} has no word timestamps')
  for wi,w in enumerate(words):
   raw=str(w.get('word',w.get('text','')));start,end=float(w['start']),float(w['end'])
   if not math.isfinite(start) or not math.isfinite(end) or start<0 or end<start or start<last-1e-6:raise ValueError(f'{path}: invalid/nonmonotonic word timestamps at {si}/{wi}')
   last=start
   if not raw:continue
   # Provider words may lack whitespace; add a display separator between complete
   # alphanumeric words. Punctuation-leading pieces such as ,000 stay attached.
   if full and not raw[0].isspace() and full[-1].isalnum() and raw[0].isalnum():full+=' '
   a=len(full);full+=raw;units.append(dict(char_start=a,char_end=len(full),start=start,end=end,source_segment=si,source_word=wi))
 matches=list(WORD.finditer(full));tokens=[]
 for k,match in enumerate(matches):
  covered=[u for u in units if u['char_start']<match.end() and u['char_end']>match.start()]
  a=0 if k==0 else match.start();z=matches[k+1].start() if k+1<len(matches) else len(full)
  tokens.append(dict(norm=''.join(tokenize(match.group())),text=full[a:z],start=min(u['start'] for u in covered),end=max(u['end'] for u in covered),source_segment=covered[0]['source_segment'],source_word=covered[0]['source_word'],source_units=len(covered)))
 if not tokens and full.strip() and any(unicodedata.category(ch).startswith('S') for ch in full):
  tokens.append(dict(norm=full.strip().lower(),text=full,start=units[0]['start'],end=units[-1]['end'],source_segment=0,source_word=0,marker=True))
 return tokens

def parse_srt(path):
 text=Path(path).read_text(encoding='utf-8-sig').strip();cues=[]
 def seconds(value):
  h,m,s=value.strip().replace('.',',').split(':');return int(h)*3600+int(m)*60+float(s.replace(',','.'))
 for block in re.split(r'\n\s*\n',text.replace('\r\n','\n')) if text else []:
  lines=block.splitlines();ix=next((i for i,line in enumerate(lines) if '-->' in line),None)
  if ix is None:raise ValueError(f'{path}: invalid SRT block')
  a,b=lines[ix].split('-->');start,end=seconds(a),seconds(b.strip().split()[0])
  if start<0 or end<start:raise ValueError(f'{path}: invalid SRT time')
  cues.append(dict(start=start,end=end,text='\n'.join(lines[ix+1:]),cue_index=len(cues)+1))
 return cues

def _align(columns,words,models,new_model):
 n,m=len(columns),len(words);dp=[[(0,0.)]*(m+1) for _ in range(n+1)];ops=[['']*(m+1) for _ in range(n+1)]
 for i in range(1,n+1):dp[i][0]=(i,0.);ops[i][0]='d'
 for j in range(1,m+1):dp[0][j]=(j,0.);ops[0][j]='i'
 for i in range(1,n+1):
  ts=[t for t in columns[i-1]['tokens'].values() if t];norms={t['norm'] for t in ts};center=statistics.median((t['start']+t['end'])/2 for t in ts)
  for j in range(1,m+1):
   w=words[j-1];distance=min(30,abs(center-(w['start']+w['end'])/2))
   diag=(dp[i-1][j-1][0]+int(w['norm'] not in norms),dp[i-1][j-1][1]+distance)
   delete=(dp[i-1][j][0]+1,dp[i-1][j][1]);insert=(dp[i][j-1][0]+1,dp[i][j-1][1])
   # Lexical edit count is primary; time only breaks equal-cost alignments.
   dp[i][j],ops[i][j]=min([(diag,'m'),(delete,'d'),(insert,'i')],key=lambda item:item[0])
 i,j=n,m;out=[]
 while i or j:
  op=ops[i][j]
  if op=='m':out.append({'tokens':{**columns[i-1]['tokens'],new_model:words[j-1]}});i-=1;j-=1
  elif op=='d':out.append({'tokens':{**columns[i-1]['tokens'],new_model:None}});i-=1
  else:out.append({'tokens':{**{x:None for x in models},new_model:words[j-1]}});j-=1
 return list(reversed(out))

def align_models(model_words):
 models=list(model_words)
 if len(models)<2:raise ValueError('At least two model outputs required')
 columns=[{'tokens':{models[0]:w}} for w in model_words[models[0]]]
 for i,name in enumerate(models[1:],1):columns=_align(columns,model_words[name],models[:i],name)
 for column in columns:
  column['conflict']=len({t['norm'] if t else None for t in column['tokens'].values()})>1
 return columns

NUMBER_WORDS=set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion first second third fourth fifth sixth seventh eighth ninth tenth'.split())
NEGATIONS={'no','not',"don't","doesn't","didn't","can't","cannot","won't","wouldn't","isn't","aren't","wasn't","weren't",'never','neither','nor','without'}
UNITS={'dollar','dollars','usd','eur','gbp','cent','cents','hour','hours','minute','minutes','second','seconds','day','days','week','weeks','month','months','year','years','percent','kg','km','mph','mile','miles','meter','meters','$','£','€','%'}
COMMON_CAPITAL={'i','a','the','it','and','but','so','what','why','how','where','when','who','we','you','he','she','they','that','this','there','yes','no','my','your','do','is','are','in','on','at','for','to','of','thank','thanks'}
def suspicion(columns):
 reasons=set()
 for c in columns:
  if not c['conflict']:continue
  if any(t is None for t in c['tokens'].values()):reasons.add('missing_or_extra_words')
  for t in c['tokens'].values():
   if not t:continue
   v=t['norm'];plain=t['text'].strip()
   if any(x.isdigit() for x in v) or v in NUMBER_WORDS:reasons.add('number')
   if v in NEGATIONS:reasons.add('negation')
   if v in UNITS:reasons.add('unit')
   if plain and plain[0].isupper() and v not in COMMON_CAPITAL:reasons.add('possible_name')
 weights={'number':10,'negation':10,'unit':8,'possible_name':7,'missing_or_extra_words':4}
 return sum(weights[x] for x in reasons),sorted(reasons)

def conflict_rows(columns,reference_cues,models):
 buckets=[dict(base=dict(c),cols=[]) for c in reference_cues];extras=[]
 for col in columns:
  ref=col['tokens'].get(models[0]);ts=[x for x in col['tokens'].values() if x]
  center=(ref['start']+ref['end'])/2 if ref else statistics.median((x['start']+x['end'])/2 for x in ts)
  found=next((i for i,c in enumerate(reference_cues) if c['start']-1e-6<=center<=c['end']+1e-6),None)
  if found is None and ref and reference_cues:found=min(range(len(reference_cues)),key=lambda i:min(abs(center-reference_cues[i]['start']),abs(center-reference_cues[i]['end'])))
  if found is not None:buckets[found]['cols'].append(col)
  else:
   a=min(t['start'] for t in ts);z=max(t['end'] for t in ts)
   if extras and a-extras[-1]['base']['end']<=1.5 and z-extras[-1]['base']['start']<=7:
    extras[-1]['cols'].append(col);extras[-1]['base']['end']=max(z,extras[-1]['base']['end'])
   else:extras.append(dict(base=dict(start=a,end=z,text=''),cols=[col]))
 rows=[]
 for bucket in buckets+extras:
  cols=bucket['cols']
  if not cols:continue
  ts=[t for c in cols for t in c['tokens'].values() if t];a=min(bucket['base']['start'],min(t['start'] for t in ts));z=max(bucket['base']['end'],max(t['end'] for t in ts))
  score,reasons=suspicion(cols);texts={name:''.join(c['tokens'][name]['text'] for c in cols if c['tokens'].get(name)).strip() for name in models}
  tokens={name:[dict(text=c['tokens'][name]['text'],diff=c['conflict']) for c in cols if c['tokens'].get(name)] for name in models}
  spans=[];pending=[]
  def flush():
   if not pending:return
   ws=[t for c in pending for t in c['tokens'].values() if t]
   spans.append(dict(start=min(t['start'] for t in ws),end=max(t['end'] for t in ws),texts={name:''.join(c['tokens'][name]['text'] for c in pending if c['tokens'].get(name)).strip() for name in models}))
   pending.clear()
  for c in cols:
   if c['conflict']:pending.append(c)
   else:flush()
  flush()
  rows.append(dict(reference_cue_index=bucket['base'].get('cue_index'),disagreement_spans=spans,start=a,end=z,conflict=any(c['conflict'] for c in cols),suspicion_score=score,reasons=reasons,texts=texts,tokens=tokens,flags=[]))
 rows.sort(key=lambda r:(r['start'],r['end']))
 for i,r in enumerate(rows,1):r['segment_index']=i
 return rows

def auto_flags(model,cues):
 result=[];values=[]
 for c in cues:
  duration=c['end']-c['start'];chars=len(c['text'].replace('\n',' '));values.append(chars/duration if duration>0 else None)
 finite=[v for v in values if v is not None and v>0];median=statistics.median(finite) if finite else 0;mad=statistics.median(abs(v-median) for v in finite) if finite else 0
 low=max(median*.35,median-3*1.4826*mad) if mad else median*.35
 high=max(20,median+3*1.4826*mad)
 def add(kind,i,start,end,**details):result.append(dict(model=model,cue_index=i,start=start,end=end,kind=kind,details=details))
 for i,(c,cps) in enumerate(zip(cues,values),1):
  d=c['end']-c['start'];chars=len(c['text'].replace('\n',' '))
  if d<=0:add('zero_duration',i,c['start'],c['end'],text=c['text'])
  if d>7+1e-9:add('over_7_seconds',i,c['start'],c['end'],seconds=d,text=c['text'])
  if chars>42:add('over_42_chars',i,c['start'],c['end'],chars=chars,max_line_chars=max(map(len,c['text'].splitlines()),default=0),text=c['text'])
  if any(len(line)>42 for line in c['text'].splitlines()):add('line_over_42_chars',i,c['start'],c['end'],text=c['text'])
  if cps is not None and cps>20:add('over_20_cps',i,c['start'],c['end'],cps=cps,text=c['text'])
  if cps is not None and cps<low:add('low_cps_outlier',i,c['start'],c['end'],cps=cps,threshold=low,median_cps=median,text=c['text'])
  if cps is not None and cps>high:add('high_cps_outlier',i,c['start'],c['end'],cps=cps,threshold=high,median_cps=median,text=c['text'])
  if i<len(cues):
   nxt=cues[i];gap=nxt['start']-c['end'];previous=c['text'].strip();following=nxt['text'].strip();first=tokenize(following)[:1]
   continuation=not re.search(r'[.!?]["”’)]?$',previous) and (bool(following and following[0].islower()) or bool(first and first[0] in {'and','but','because','which','that','then','so','or'}))
   if gap>2 and continuation:add('gap_continuation_candidate',i,c['end'],nxt['start'],gap_seconds=gap,previous_text=previous,next_text=following,rule='gap>2s + no terminal punctuation + lowercase/continuation next word; candidate only')
 return result
