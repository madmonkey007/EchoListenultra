"""Timestamp-preserving subtitle partitioner for the isolated experiment.

Uses word starts/ends, optionally the next word start to include trailing silence.
Never interpolates times, drops words, or splits a word. Infeasible constraints
are retained as measured exceptions rather than hidden with synthetic timings.
"""
from dataclasses import dataclass
import re
from probe import srt_text

@dataclass(frozen=True)
class Limits:
 max_seconds:float=7.0
 max_line_chars:int=42
 max_lines:int=2
 max_cps:float=20.0
 min_seconds:float=5/6

def wrap(text,limit):
 # Whitespace normalized; no hyphenation or breaking long words.
 lines=[];line=''
 for w in text.split():
  if line and len(line)+1+len(w)>limit:lines.append(line);line=w
  else:line=(line+' '+w).strip()
 if line:lines.append(line)
 return '\n'.join(lines)

def metrics(cues,limits=Limits()):
 durations=[(round(c['end']*1000)-round(c['start']*1000))/1000 for c in cues]
 lengths=[len(line) for c in cues for line in c['text'].splitlines()]
 cps=[len(c['text'].replace('\n',' '))/d if d>0 else float('inf') for c,d in zip(cues,durations)]
 return dict(max_seconds=max(durations,default=0),max_line_chars=max(lengths,default=0),over_7_seconds=sum(d>limits.max_seconds+1e-9 for d in durations),over_42_chars=sum(n>limits.max_line_chars for n in lengths),over_20_cps=sum(c>limits.max_cps+1e-9 for c in cps),under_5_6_seconds=sum(d<limits.min_seconds-1e-9 for d in durations),cue_count=len(cues),zero_duration=sum(d<=0 for d in durations),over_2_lines=sum(len(c['text'].splitlines())>limits.max_lines for c in cues))

def build(segments,limits=Limits()):
 words=[]
 for s in segments:
  if s.get('text','').strip() and not s.get('words'):raise ValueError('Nonempty segment lacks word timestamps')
  for w in s.get('words') or []:
   if w['word'].strip():
    a,b=float(w['start']),float(w['end'])
    if b<a:raise ValueError('Negative word duration')
    if words and a<words[-1]['start']-1e-6:raise ValueError('Word starts out of order')
    words.append(dict(word=w['word'],start=a,end=b))
 n=len(words);dp=[None]*(n+1);dp[n]=((0,0,0,0,0),[])
 for i in range(n-1,-1,-1):
  text='';best=None;skipped=0
  for j in range(i,n):
   if j>i:
    prev=words[j-1]['word'].strip()
    if re.search(r'[.!?]["”’)]?$',prev) and prev.lower() not in {'mr.','mrs.','ms.','dr.','prof.','st.','vs.','e.g.','i.e.'}:skipped+=4
    elif re.search(r'[,;:]["”’)]?$',prev):skipped+=2
   text+=words[j]['word']
   start,end=words[i]['start'],words[j]['end']
   duration=(round(end*1000)-round(start*1000))/1000
   display=wrap(text,limits.max_line_chars);lines=display.splitlines()
   hard=int(duration>limits.max_seconds+1e-9)+sum(len(x)>limits.max_line_chars for x in lines)+int(len(lines)>limits.max_lines)
   if j>i and hard:break
   chars=len(display.replace('\n',' '));cps=chars/duration if duration>0 else float('inf')
   extended=False
   if j+1<n and (cps>limits.max_cps or duration<limits.min_seconds):
    candidate=words[j+1]['start']
    span=(round(candidate*1000)-round(start*1000))/1000
    if candidate>end and span<=limits.max_seconds:
     end=candidate;duration=span;cps=chars/duration if duration>0 else float('inf');extended=True
   tail=words[j]['word'].strip();abbrev=tail.lower() in {'mr.','mrs.','ms.','dr.','prof.','st.','vs.','e.g.','i.e.'}
   priority=0 if j==n-1 or (not abbrev and re.search(r'[.!?]["”’)]?$',tail)) else (1 if re.search(r'[,;:]["”’)]?$',tail) else 3)
   own=(hard,int(cps>limits.max_cps+1e-9),int(duration<limits.min_seconds-1e-9),priority+skipped,1)
   if dp[j+1] is None:continue
   score=tuple(a+b for a,b in zip(own,dp[j+1][0]))
   cue=dict(start=start,end=end,text=display,word_start=i,word_end=j+1,end_at_next_word_start=extended,boundary='sentence' if priority==0 else 'comma' if priority==1 else 'word',cps=cps if duration>0 else None)
   value=(score,[cue]+dp[j+1][1])
   if best is None or score<best[0]:best=value
  dp[i]=best
 cues=dp[0][1] if n else []
 notes=[]
 for k,c in enumerate(cues,1):
  m=metrics([c],limits)
  issues=[name for name in ['over_7_seconds','over_42_chars','over_2_lines','over_20_cps','under_5_6_seconds','zero_duration'] if m[name]]
  if issues:notes.append(dict(cue=k,start=c['start'],end=c['end'],text=c['text'],issues=issues))
 return cues,notes
