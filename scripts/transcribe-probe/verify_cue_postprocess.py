"""Offline acceptance runner: reads existing JSON only. No media processing."""
import hashlib
import html
import json
from pathlib import Path
from cue_postprocess import assemble, render_srt

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'runs/20261021-small-medium/small/hallucination/DbQzbzrAJ-V/raw-segments.json'
OUT=ROOT/'runs/20261023-cue-postprocess'
DURATION=85.7526875


def main():
    original=SOURCE.read_bytes()
    segments=json.loads(original)
    # Explicit context annotations, not automatic language recognition or correction.
    spans=[{'start':53.1,'end':53.9,'language':'fr'},
           {'start':58.64,'end':58.8,'language':'fr','human_reference':'Bonjour','reference_source':'user confirmation'}]
    cues=assemble(segments,spans)
    source_text=''.join(w['word'] for s in segments for w in s['words']).strip()
    output_text=' '.join(c['text'].replace('\n',' ') for c in cues)
    identical=source_text.split()==output_text.split()
    stats={
        'max_line_chars':max(len(line) for c in cues for line in c['text'].splitlines()),
        'max_cue_seconds':max(round(c['end']-c['start'],3) for c in cues),
        'zero_duration_cues':sum(c['start']==c['end'] for c in cues),
        'overlaps':sum(a['end']>b['start'] for a,b in zip(cues,cues[1:])),
        'word_sequence_identical':identical,
        'source_word_count':len(source_text.split()),
        'output_word_count':len(output_text.split()),
        'source_chars':len(source_text),'output_chars':len(output_text),
        'audio_seconds':DURATION,
        'source_cps':len(source_text)/DURATION,
        'output_cps':len(output_text)/DURATION,
        'source_nonspace_cps':len(''.join(source_text.split()))/DURATION,
        'cue_count':len(cues),
        'source_sha256':hashlib.sha256(original).hexdigest(),
        'language_annotations':spans,
    }
    assert identical and stats['source_chars']==stats['output_chars']
    assert stats['max_line_chars']<=42 and stats['max_cue_seconds']<=7
    assert stats['zero_duration_cues']==stats['overlaps']==0
    srt=render_srt(cues)
    # Independently parse the delivered SRT and verify text/order after rendering.
    import re
    blocks=srt.strip().split('\n\n')
    assert len(blocks)==len(cues)
    extracted=[]
    for i,block in enumerate(blocks,1):
        lines=block.splitlines()
        assert lines[0]==str(i)
        assert re.fullmatch(r'\d{2,}:\d{2}:\d{2},\d{3} --> \d{2,}:\d{2}:\d{2},\d{3}',lines[1])
        extracted.extend(' '.join(lines[2:]).split())
    assert extracted==source_text.split()
    stats['srt_roundtrip_valid']=True
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'cues.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2)+'\n')
    (OUT/'metrics.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
    (OUT/'transcript.srt').write_text(srt)
    (OUT/'transcript.txt').write_text(output_text+'\n')
    rows=''.join(f"<article><small>{c['start']:.3f}–{c['end']:.3f} [{html.escape(c['language'])}]</small><pre>{html.escape(c['text'])}</pre></article>" for c in cues)
    (OUT/'preview.html').write_text('<!doctype html><meta charset="utf-8"><title>Offline cue preview</title><style>body{max-width:800px;margin:40px auto;font:18px sans-serif}article{border-bottom:1px solid #ccc;padding:12px}pre{font:inherit;white-space:pre-wrap}small{color:#555}</style><h1>DbQzbzrAJ-V / small</h1><p>语言为独立元数据；用户确认 #28 原音为 Bonjour，模型原词仍保留。</p>'+rows)
    report=f'''# 离线 cue 后处理验收

原件：`{SOURCE.relative_to(ROOT)}`。源文件 SHA256：`{stats['source_sha256']}`。
所有正文和 SRT 共用 `cues.json`；未调用模型、媒体工具或网络。语言标签不插入 SRT 台词。

| 验收项 | 合格线（用户原表） | 实测 | 状态 |
| :-- | :-- | :-- | :-- |
| 最长单行字符数 | ≤42（单个超长词例外） | {stats['max_line_chars']} | 通过 |
| 最长单 cue 时长 | ≤7.0秒 | {stats['max_cue_seconds']}秒 | 通过 |
| 零时长 cue | 0 | {stats['zero_duration_cues']} | 通过 |
| 相邻 cue 重叠 | 0 | {stats['overlaps']} | 通过 |
| 词序列一致性 | 与原模型输出逐词相同 | {stats['source_word_count']}→{stats['output_word_count']}词；SRT 解析回读也一致 | 通过 |
| 字符/秒 | ≈11.3，前后不变 | {stats['source_cps']:.6f}→{stats['output_cps']:.6f}（含空格）；不含空格 {stats['source_nonspace_cps']:.6f} | 前后不变通过；11.3 数值不符 |
| 英文行内不含外语段 | #22/#24/#28 独立 cue 并标语言 | 已隔离已知法语上下文；详见下表 | 需人工查看，不能自动宣告全绿 |

字符数：{stats['source_chars']}→{stats['output_chars']}。口径为换行还原单个空格后的全文字符数 / 原音频85.7526875秒，不使用累计cue时长。切分不会改变此数。当前数据无法同时满足“保持文本”和“固定11.3”。

## 原核对编号对照

| 原编号 | 实际 small 文本/上下文 | 处理 |
| -- | -- | -- |
| #22 | Yeah. And do you speak any other languages besides English? I don't speak | 英文，保持 en；不能因提及 languages 标为外语 |
| #24 | I took French ... so. Je m'appelle. | 53.100–53.900 的 Je m'appelle. 单独 fr cue；英文单独 en |
| #28 | 模型：Bone drawers, hey.；人工确认原音：Bonjour | 58.640–58.800 的 Bone drawers, 单独 fr cue；hey. 为 en；人工参考 Bonjour 独立保存，未替换模型原词 |

用户已确认 #28 原音为法语 Bonjour，因此该片段语言标签更新为 `fr`。这只修正语言元数据，不纠正模型误识别的 `Bone drawers,`；人工参考 Bonjour 单独保存在 metrics.json 的 language_annotations 中。本次未重算 WER。预览显示标签；标准 SRT 没有语言元数据字段，因此标签在 cues.json 中保留，不向台词加词。

## 边界与限制

- 不填静音；时间取原词边界并量化至 SRT 毫秒。
- 零时长词与相邻有时长词组装；若输入时间本身无法满足时长/重叠要求，显式报错，不伪造时间。
- 数字、缩写、URL 和超长词按原空白词边界保持完整；允许单个超长词超过42。
- 语言隔离使用调用方显式时间区间，纯后处理不推测未知词的语言。
- 这是独立脚本结果，不修改网站、不解锁线上导出。7项全绿尚未成立，保留现有纪律。
'''
    (OUT/'ACCEPTANCE.md').write_text(report)
    assert SOURCE.read_bytes()==original
    print(json.dumps(stats,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
