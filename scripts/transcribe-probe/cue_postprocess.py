"""Offline, dependency-free word-timestamp to display cue/SRT conversion.

Language spans are caller annotations, never language predictions. Text is
unchanged except whitespace layout. Infeasible timestamps raise, never stretch.
"""
import math
import re


def _atoms(segments, languages):
    raw=[]
    for segment in segments:
        if segment.get('text','').strip() and not segment.get('words'):
            raise ValueError('Nonempty segment lacks word timestamps')
        raw.extend(segment.get('words') or [])
    text=''.join(w['word'] for w in raw)
    offsets=[]
    pos=0
    for w in raw:
        a,b=float(w['start']),float(w['end'])
        if not math.isfinite(a+b) or a<0 or b<a:
            raise ValueError('Invalid word timestamps')
        offsets.append((pos,pos+len(w['word']),a,b))
        pos+=len(w['word'])
    atoms=[]
    for match in re.finditer(r'\S+',text):
        touched=[w for w in offsets if w[0]<match.end() and w[1]>match.start()]
        start,end=touched[0][2],max(w[3] for w in touched)
        language=next((s['language'] for s in languages if s['start']<=start<s['end']),'en')
        atoms.append(dict(text=match.group(),start=round(start*1000),end=round(end*1000),language=language))
    return atoms


def _wrap(atoms, limit):
    lines=[]
    for atom in atoms:
        word=atom['text']
        if not lines or len(lines[-1])+1+len(word)>limit:
            lines.append(word)
        else:
            lines[-1]+=' '+word
    return '\n'.join(lines)


def _boundary(word):
    if word.lower() in {'mr.','mrs.','ms.','dr.','prof.','e.g.','i.e.','u.s.'}:
        return 3
    if re.search(r'[.!?][\"”’)]?$',word):return 0
    if re.search(r'[,;:][\"”’)]?$',word):return 1
    return 3


def assemble(segments, language_spans=(), max_seconds=7.0, max_line_chars=42):
    """Return shared display cues; neither filesystem nor inference is accessed.

    Each lexical atom is a whole whitespace-delimited original token, even when
    the model split its punctuation across multiple timestamp records.
    """
    atoms=_atoms(segments,language_spans)
    n=len(atoms)
    dp=[None]*(n+1)
    dp[n]=((0,0,0),[])
    for i in range(n-1,-1,-1):
        end=atoms[i]['end']
        for j in range(i,n):
            if atoms[j]['language']!=atoms[i]['language']:break
            if j>i and atoms[j]['start']-atoms[j-1]['end']>2000:break
            end=max(end,atoms[j]['end'])
            start=atoms[i]['start']
            if end-start>round(max_seconds*1000):break
            text=_wrap(atoms[i:j+1],max_line_chars)
            if len(text.splitlines())>2:break
            if end<=start or dp[j+1] is None:continue
            if j+1<n and end>atoms[j+1]['start']:continue
            # Avoid tiny isolated words, then prefer sentence/comma boundaries.
            own=(int(end-start<833),_boundary(atoms[j]['text']),1)
            score=tuple(a+b for a,b in zip(own,dp[j+1][0]))
            cue=dict(start=start/1000,end=end/1000,text=text,language=atoms[i]['language'],word_start=i,word_end=j+1)
            if dp[i] is None or score<dp[i][0]:dp[i]=(score,[cue]+dp[j+1][1])
    if dp[0] is None:raise ValueError('Cannot satisfy timing/overlap constraints without changing word timestamps')
    return dp[0][1]


def render_srt(cues):
    """Plain SRT: language metadata stays outside dialogue to preserve words."""
    def stamp(seconds):
        ms=round(seconds*1000)
        h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
        return f'{h:02}:{m:02}:{s:02},{ms:03}'
    return ''.join(f"{i}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}\n\n" for i,c in enumerate(cues,1))
