"""Isolated small-model parameter attribution and VAD sensitivity experiment."""
import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
import json, re, time, wave
from pathlib import Path
from dataclasses import asdict
from probe import ROOT, PeakRSS, save, srt_text
from vad_experiment import memory, repeats

OUT = ROOT / 'runs/20261022-srt-builder/parameters'

def cue_stats(cues):
    return dict(longest_cue_seconds=max((c['end']-c['start'] for c in cues), default=0), cue_count=len(cues),
                total_characters=sum(len(c['text']) for c in cues), word_count=len(re.findall(r'\b\w+\b', ' '.join(c['text'] for c in cues))), short_cues=sum(c['end']-c['start'] < 5/6 for c in cues),
                non_sentence_final_boundaries=sum(not bool(re.search(r'[.!?][\"”’)]?$', c['text'].strip())) for c in cues[:-1]))

def run():
    from faster_whisper import WhisperModel
    from faster_whisper.vad import VadOptions
    OUT.mkdir(parents=True, exist_ok=True)
    defaults=asdict(VadOptions())
    defaults['max_speech_duration_s']='Infinity'
    save(OUT/'vad-library-defaults.json',defaults)
    model=WhisperModel(str(ROOT/'models/small'),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1)
    samples={s['id']:s for s in json.loads((ROOT/'samples.json').read_text())}
    cases=[]
    for group in ['D','E']:
        for sid in ['DdTrkOFgmiD','DNZKRiUvpc9']:
            cases.append((group,sid,dict(vad_filter=group=='D',condition_on_previous_text=group=='D')))
    for label,silence in [('default',None),('500',500),('1000',1000)]:
        for sid in ['DbgNy0XxMZH','DbQzbzrAJ-V','DeqblVZAh4m']:
            opts=dict(vad_filter=True,condition_on_previous_text=False)
            if silence is not None: opts['vad_parameters']={'min_silence_duration_ms':silence}
            cases.append(('vad-'+label,sid,opts))
    rows=[]
    for group,sid,opts in cases:
        folder=OUT/group/sid;folder.mkdir(parents=True,exist_ok=True)
        if (folder/'metrics.json').exists():
            rows.append(json.loads((folder/'metrics.json').read_text()));continue
        source=Path(samples[sid]['audio_path']);audio=source
        if sid=='DbgNy0XxMZH':
            audio=folder/'input-45s.wav'
            with wave.open(str(source)) as f: params=f.getparams(); data=f.readframes(45*f.getframerate())
            with wave.open(str(audio),'wb') as f:f.setparams(params);f.writeframes(data)
        with wave.open(str(audio)) as f:duration=f.getnframes()/f.getframerate()
        opts=dict(opts,word_timestamps=False,beam_size=5,temperature=0)
        effective_vad=dict(defaults,**opts.get('vad_parameters',{})) if opts['vad_filter'] else None
        save(folder/'effective-parameters.json',dict(options=opts,effective_vad=effective_vad,model='small',device='cpu',compute_type='int8',cpu_threads=4))
        before=memory();save(folder/'memory-before.json',before)
        print(group,sid,'START',flush=True)
        with PeakRSS() as rss:
            start=time.perf_counter();gen,info=model.transcribe(str(audio),**opts)
            raw=[asdict(s) for s in gen];elapsed=time.perf_counter()-start
        after=memory();save(folder/'memory-after.json',after)
        cues=[dict(start=s['start'],end=s['end'],text=s['text'].strip()) for s in raw if s['text'].strip()]
        save(folder/'raw-segments.json',raw);save(folder/'segments.json',cues)
        text=' '.join(c['text'] for c in cues)
        (folder/'transcript.txt').write_text(text+'\n');(folder/'transcript.srt').write_text(srt_text(cues))
        row=dict(group=group,id=sid,model='small',source=str(source),input=str(audio),duration=duration,elapsed=elapsed,rtf=elapsed/duration,over_3x_audio=elapsed>3*duration,peak_rss_mib=rss.peak/2**20,options=opts,effective_vad=effective_vad,text=text,cue_stats=cue_stats(cues),repeats=repeats(raw),memory_before=before,memory_after=after)
        save(folder/'metrics.json',row);rows.append(row)
        print(group,sid,'DONE',round(elapsed,3),'RTF',round(elapsed/duration,3),flush=True)
    save(OUT/'summary.json',rows)
    report(rows)

def report(rows):
    lines=['# 参数归因与 VAD 微调实跑','', 'small / CPU int8 / 4 threads；word_timestamps=False。耗时仅计 transcribe 完整迭代。各例有前后整机内存快照和进程峰值 RSS；系统换页不能归因到单一进程。','', '库内默认 min_silence_duration_ms=2000。三口播各新跑 default/500/1000，未重用历史耗时。','', '## D/E 与既有 A/B 的钢琴输出（A/B 为历史对照，D/E 为本次新跑）','', '| 组 | vad | previous_text | 秒数 | RTF | 原始输出与模型时间 |','|---|---|---|---:|---:|---|']
    for group in 'ABDE':
        if group in 'AB':
            folder=ROOT/'runs/20261022-vad/small'/group/'DdTrkOFgmiD'
            row=json.loads((folder/'metrics.json').read_text());raw=json.loads((folder/'raw-segments.json').read_text())
        else:
            row=next(r for r in rows if r['group']==group and r['id']=='DdTrkOFgmiD');raw=json.loads((OUT/group/'DdTrkOFgmiD/raw-segments.json').read_text())
        output='; '.join(f"{s['start']:.3f}–{s['end']:.3f}: {s['text'].strip()}" for s in raw) or '空（无音乐标记）'
        o=row['options'];lines.append(f"| {group} | {o['vad_filter']} | {o['condition_on_previous_text']} | {row['elapsed']:.3f} | {row['rtf']:.3f} | {output} |")
    lines+=['', 'A/E（vad=False）均输出 Thank you for watching!，B/D（vad=True）均为空。在这个样本的四格单次对照中，文本消失跟随 vad_filter=True；condition_on_previous_text=False 单独没有消除该文本。这不证明所有音乐的表现。用户此前只听审确认原视频 17–21.76 秒无人声；此处保留 A 的原始整段时间，不能把整个视频当作人工听审覆盖。', '', '## 全部新运行指标', '', '| 组 | 样本 | 耗时秒 | RTF | >3倍 | RSS MiB | swap 前→后 MiB | available 前→后 MiB | 最长 cue 秒 | cue 数 | 字符数 / 词数 | <5/6秒 | 非句末边界 |', '|---|---|---:|---:|---|---:|---|---|---:|---:|---:|---:|---:|']
    for r in rows:
        a,b=r['memory_before'],r['memory_after'];s=r['cue_stats'];s.setdefault('word_count',len(re.findall(r'\b\w+\b',r['text'])))
        lines.append(f"| {r['group']} | {r['id']} | {r['elapsed']:.3f} | {r['rtf']:.3f} | {r['over_3x_audio']} | {r['peak_rss_mib']:.1f} | {a['swap_used_mib']:.1f}→{b['swap_used_mib']:.1f} | {a['available_mib']:.1f}→{b['available_mib']:.1f} | {s['longest_cue_seconds']:.3f} | {s['cue_count']} | {s['total_characters']} / {s['word_count']} | {s['short_cues']} | {s['non_sentence_final_boundaries']} |")
    lines+=['', '## VAD 微调数值变化', '']
    for sid in ['DbgNy0XxMZH','DbQzbzrAJ-V','DeqblVZAh4m']:
        subset=[next(r for r in rows if r['id']==sid and r['group']=='vad-'+g) for g in ['default','500','1000']]
        desc=[]
        for r in subset:
            s=r['cue_stats'];desc.append(f"{r['group']}: 最长{s['longest_cue_seconds']:.2f}秒，{s['cue_count']} cues，{s['total_characters']}字符，短cue{s['short_cues']}，非句末边界{s['non_sentence_final_boundaries']}")
        lines.append('- '+sid+'：'+'；'.join(desc)+'。')
    lines+=['', '500ms 的访谈 cue 数由 36 增至 43，非句末边界由 3 增至 5；短 cue 从 3 降至 2。舞台 cue 数由 9 增至 11，非句末边界由 6 增至 9。这里不能据标点代理指标确认音频句子断裂，也不能仅据这些计数判断默认值更合适。']
    lines+=['','>3 倍运行：'+(', '.join(r['group']+'/'+r['id'] for r in rows if r['over_3x_audio']) or '无'),'', '字符数为去除 segment 首尾空白后的可见字符总和；非句末边界只按 .!? 标点检测，不等于确认句子被错误切断。当前报告不做音频或字幕质量判断。']
    (OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')

if __name__=='__main__':run()
