"""Real API -> unchanged adapter/engine -> text/SRT experiment, no deployment."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import wave

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'server/transcription'))
from turbo import transcribe
from cue_postprocess import assemble,render_srt


def run(out):
    out.mkdir(parents=True,exist_ok=True)
    account=os.environ['CLOUDFLARE_ACCOUNT_ID']
    token=os.environ['CLOUDFLARE_API_TOKEN']
    samples=ROOT/'scripts/transcribe-probe/runs/20261023-cloudflare-parameters'
    rows=[]
    protected=[ROOT/'server/transcription/turbo.py',ROOT/'scripts/transcribe-probe/cue_postprocess.py']
    hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
    for name,file in [('speech','speech-vad-en.wav'),('piano','piano-vad-en.wav'),('french','french-vad-auto.wav'),('speech60','speech-60-vad-auto.wav')]:
        case=out/name;case.mkdir(exist_ok=True)
        path=samples/file
        with wave.open(str(path),'rb') as audio:duration=audio.getnframes()/audio.getframerate()
        row={'case':name,'audio_path':str(path),'audio_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'audio_seconds':duration,'options':{'vad_filter':True},'timings':{}}
        captured={}
        def transport(url,payload,secret,timeout):
            assert payload['vad_filter'] is True and 'language' not in payload
            body=json.dumps(payload).encode()
            request=urllib.request.Request(url,data=body,headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
            started=time.perf_counter()
            try:
                with urllib.request.urlopen(request,timeout=timeout) as response:
                    status=response.status;raw=response.read()
            except urllib.error.HTTPError as error:
                status=error.code;raw=error.read()
            finally:row['timings']['request_seconds']=time.perf_counter()-started
            (case/'raw-response.json').write_bytes(raw)
            row['http_status']=status
            response=json.loads(raw);captured['response']=response
            if status!=200:raise ValueError('HTTP '+str(status))
            return response
        def builder(segments):
            started=time.perf_counter()
            try:return assemble(segments)
            finally:row['timings']['cue_seconds']=time.perf_counter()-started
        started=time.perf_counter()
        try:
            result=transcribe(path.read_bytes(),account,token,builder,audio_seconds=duration,transport=transport)
            raw_words=[w for s in captured['response']['result']['segments'] for w in s['words']]
            assert result['words']==[{'text':w['word'].lstrip(),'start':w['start'],'end':w['end']} for w in raw_words]
            cues=result['cues'];srt=render_srt(cues)
            original=''.join(w['word'] for w in raw_words).split()
            displayed=' '.join(c['text'] for c in cues).split()
            blocks=srt.strip().split('\n\n') if srt.strip() else []
            srt_words=[]
            for i,block in enumerate(blocks,1):
                lines=block.splitlines()
                assert lines[0]==str(i) and re.fullmatch(r'\d{2,}:\d{2}:\d{2},\d{3} --> \d{2,}:\d{2}:\d{2},\d{3}',lines[1])
                srt_words.extend(' '.join(lines[2:]).split())
            checks={'word_times_unchanged':True,'display_words_identical':original==displayed,'srt_words_identical':original==srt_words,'max_line_chars':max((len(line) for c in cues for line in c['text'].splitlines()),default=0),'max_cue_seconds':max((round(c['end']-c['start'],3) for c in cues),default=0),'zero_duration':sum(c['end']<=c['start'] for c in cues),'overlaps':sum(a['end']>b['start'] for a,b in zip(cues,cues[1:]))}
            checks['cue_boundaries_from_words']=all(any(round(w['start']*1000)==round(c['start']*1000) for w in raw_words) and any(round(w['end']*1000)==round(c['end']*1000) for w in raw_words) for c in cues)
            assert checks['display_words_identical'] and checks['srt_words_identical'] and checks['cue_boundaries_from_words']
            assert checks['max_line_chars']<=42 and checks['max_cue_seconds']<=7 and checks['zero_duration']==checks['overlaps']==0
            row.update(status=result['status'],actual_words=len(raw_words),cue_count=len(cues),checks=checks)
            (case/'adapted.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
            (case/'transcript.srt').write_text(srt)
            (case/'transcript.txt').write_text('\n\n'.join(c['text'] for c in cues))
            content=''.join(f'<article><small>{c["start"]:.3f}–{c["end"]:.3f}</small><pre>{html.escape(c["text"])}</pre></article>' for c in cues)
            (case/'preview.html').write_text('<!doctype html><meta charset="utf-8"><title>E2E transcript</title><style>body{max-width:800px;margin:40px auto;font:18px sans-serif}pre{font:inherit}article{padding:12px;border-bottom:1px solid #ccc}</style>'+('<p>未检测到语音</p>' if not cues else content))
        except Exception as error:row.update(status='failed',error=type(error).__name__+': '+str(error))
        row['timings']['total_seconds']=time.perf_counter()-started
        row['rtf']=row['timings'].get('request_seconds',0)/duration
        rows.append(row);(case/'metrics.json').write_text(json.dumps(row,ensure_ascii=False,indent=2));print(json.dumps(row,ensure_ascii=False),flush=True)
    assert hashes=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
    (out/'results.json').write_text(json.dumps({'cases':rows,'unchanged_code_sha256':hashes,'scope':'local runner -> real Cloudflare API -> adapter -> cue engine -> text/SRT; not HTTP route/Vercel/browser UI'},ensure_ascii=False,indent=2))
    table='\n'.join(f"| {r['case']} | {r['audio_seconds']:.4f} | {r['timings'].get('request_seconds',0):.3f} | {r['timings']['total_seconds']:.3f} | {r['rtf']:.3f} | {r['status']} | {r.get('actual_words','—')} | {r.get('cue_count','—')} |" for r in rows)
    (out/'REPORT.md').write_text('''# 实际端到端测试

范围：本机已有完整WAV → 真实Cloudflare Turbo请求 → 现有后端适配器 → 现有cue引擎 → 正文/SRT文件。没有网站HTTP路由、Vercel或前端上线验证；没有下载步骤，也未重新获取音频。

VAD=true，不传language，60秒上限；未传initial_prompt/prefix，未调整其他识别参数。未根据置信指标筛选任何词或segment；不读取VTT作为字幕。适配器及cue引擎运行前后哈希相同。原始词时间原样保留，cue/SRT依照既有引擎量化为毫秒，未改词时间或插值。

| 样本 | 音频秒 | 请求秒 | 本地全流程秒 | 请求RTF | 状态 | 实际词数组数 | cue数 |
| -- | --: | --: | --: | --: | -- | --: | --: |
'''+table+'''

每个子目录保存raw-response.json、metrics.json；成功处理时另存adapted.json、transcript.txt、transcript.srt、preview.html。空语音也保存空TXT/SRT，预览显示未检测到语音，不生成假cue。失败时只保留证据，不修正时间戳重试。

各项逐词一致、时间一致、边界来源、行长/时长/重叠检查见metrics.json；这不是人工准确率评估。混合语言预览仍沿用现有引擎默认语言元数据，未假装实现词级自动语言判断。计时包括网络往返，本轮未证明总deadline、并发、账户预算或线上前端拦截。
''')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();run(args.out)
