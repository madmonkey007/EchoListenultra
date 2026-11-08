"""Render measured model comparison and separate unconfirmed review candidates."""
import argparse
import csv
import difflib
import json
from pathlib import Path
import re


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe(text):
    return str(text).replace('|', '\\|').replace('\n', ' ')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    samples = read(root / 'samples.json')
    metrics = {(m['model_size'], m['round'], m['sample_id']): m
               for p in args.run.glob('*/*/*/metrics.json') for m in [read(p)]}
    fields = ['sample_id','round','audio_path','audio_duration_seconds','transcription_seconds',
              'rtf','word_count','model_size','device','compute_type','cpu_threads','peak_rss_mib',
              'baseline_rss_mib','cue_count','raw_segment_count','hallucination_candidate_count',
              'boundary_candidate_count']
    with (args.run/'metrics.csv').open('w',newline='',encoding='utf-8-sig') as out:
        writer=csv.DictWriter(out,fieldnames=fields,extrasaction='ignore')
        writer.writeheader()
        writer.writerows(metrics[k] for k in sorted(metrics))
    captions_path = root / 'runs/caption-final/captions/summary.json'
    captions = {r['id']:r for r in read(captions_path)} if captions_path.exists() else {}
    rows = ['# 音频 → 文字 / SRT 实测记录', '',
            '本地 Intel CPU，4 物理核 / 8 逻辑核，8 GiB RAM。模型 small / medium，CPU int8、4 线程、beam=5、temperature=0、语言自动检测。', '',
            'RTF = 实际转写耗时 / 实际输入音频时长；耗时包含消费完整 generator 和词级对齐，不含下载、加载与文件导出。RSS 为每例 50 ms 采样的进程常驻内存峰值，包含模型，非 GPU 显存、非 Python 堆，也非系统全局内存。运行顺序 small → medium，模型各自单独进程，顺序处理样本。每例单次、未额外热身；small 期间 medium 权重仍在下载，本机其他进程未隔离（conditions.json），这些是本机观测而非空闲专机基准。', '',
            '**人工听审未执行。** 当前没有让代理实际听音的工具。静音检测、专名/数字差异和断句规则只能产生待听审候选，不能据此确认错字、幻觉或无背景音乐。下表不下可用性结论。', '',
            '质量组：baseline 是既有慢速英文口播的 0–45 秒裁切（原音保留，是否无配乐待听审）；noise 是 Miley Cyrus 舞台讲话候选（依据来源元数据，噪音强度待听审）；long 为 104.7 秒英文口播。基线末句可能被固定窗口截断，应与模型错误区分。', '',
            '质量组启用 VAD；幻觉组禁用 VAD，以暴露完整音频中静音/音乐时的行为；两组均 condition_on_previous_text=False，保留默认 no_speech/logprob 门限。VAD 开关不同，两轮性能不可当作完全相同条件重复实验。', '']
    for round_name, label in [('quality','第一轮：3 条精测'),('hallucination','第二轮：12 条幻觉筛查')]:
        rows += [f'## {label}', '',
                 '|样本 / 角色|时长 s|small 耗时 s / RTF|medium 耗时 s / RTF|词数 small / medium|SRT cues small / medium|峰值 RSS MiB small / medium|IG captions|',
                 '|---|---:|---|---|---|---|---|---|']
        for s in samples:
            if round_name == 'quality' and not s.get('quality_role'):
                continue
            pair = [metrics.get((model,round_name,s['id'])) for model in ['small','medium']]
            def val(m, key, fmt='{}'):
                return fmt.format(m[key]) if m else '未完成'
            times = [f"{m['transcription_seconds']:.3f} / {m['rtf']:.3f}" if m else '未完成' for m in pair]
            m = next((m for m in pair if m), None)
            cap = captions.get(s['id'], {}).get('status', '未探测')
            rows.append('|'+ '|'.join([s['id']+' / '+(s.get('quality_role') or '全片'),
                f"{m['audio_duration_seconds']:.3f}" if m else '未完成', *times,
                ' / '.join(val(m,'word_count') for m in pair),
                ' / '.join(val(m,'cue_count') for m in pair),
                ' / '.join(val(m,'peak_rss_mib','{:.1f}') for m in pair), cap])+'|')
    review = ['# 待听审清单（不是已确认错误）', '',
              '所有模型输出均为假设。相互一致不代表正确；分歧不证明任一模型错误。confirmed_errors 保持空，不能理解成没有错误。', '']
    differences = []
    for s in samples:
        review += [f"## {s['id']}", '', f"原音：[{s['audio_path']}]({s['audio_path']})", '', f"Reel：{s['url']}", '']
        for model in ['small','medium']:
            for rn in ['quality','hallucination']:
                folder = args.run / model / rn / s['id']
                if not (folder/'review.json').exists():
                    continue
                r = read(folder/'review.json')
                review += [f'### {model} / {rn}', '',
                           '|幻觉候选区间 s|输出文字|触发规则|状态|','|---|---|---|---|']
                for c in r['hallucination_candidates']:
                    review.append(f"|{c['start']:.3f}–{c['end']:.3f}|{safe(c['text'])}|{', '.join(c['reasons'])}|待听审|")
                if not r['hallucination_candidates']:
                    review.append('|—|规则未检出候选；不等于人工确认无幻觉|—|待听审|')
                review += ['', '|断句候选区间 s|cue 文字|边界原因|','|---|---|---|']
                for c in r['boundary_candidates']:
                    review.append(f"|{c['start']:.3f}–{c['end']:.3f}|{safe(c['text'])}|{c['boundary']}|")
                review += ['', '专名/数字候选及全部模型分段：同目录 `review.json` / `raw-segments.json`。', '']
        for rn in ['quality','hallucination']:
            paths = [args.run/model/rn/s['id']/'raw-segments.json' for model in ['small','medium']]
            if not all(p.exists() for p in paths):
                continue
            a,b = (read(p) for p in paths)
            for seg in a:
                overlaps = [x for x in b if min(x['end'],seg['end']) > max(x['start'],seg['start'])]
                other = ' '.join(x['text'].strip() for x in overlaps)
                # Candidate retrieval only, intentionally broad to include names and spelled numbers.
                if other and difflib.SequenceMatcher(None,seg['text'].lower().strip(),other.lower()).ratio() < .9:
                    differences.append(dict(sample=s['id'],round=rn,start=seg['start'],end=seg['end'],
                                            small=seg['text'],medium=other,status='needs_audio_reference'))
    (args.run/'model-differences.json').write_text(json.dumps(differences,ensure_ascii=False,indent=2),encoding='utf-8')
    review += ['## 模型分歧（专名 / 人名 / 数字听审入口）','',
               '|样本 / 轮次|区间 s|small|medium|人工正确文本|','|---|---|---|---|---|']
    for d in differences:
        review.append(f"|{d['sample']} / {d['round']}|{d['start']:.3f}–{d['end']:.3f}|{safe(d['small'])}|{safe(d['medium'])}|未听审|")
    rows += ['', '## 文件与审阅状态', '', '- medium 访谈有1处句子对齐为零时长（49.140s），保留原始词时间戳，合并至相邻有效cue并标 merged_zero_duration。该句独立时间未获验证；详 TEXT_AUDIT.md。', '- 系统运行中记录到已用交换区 7228.5 MiB；背景进程未隔离，见 runtime-pressure.json。不能把单次测时归因为模型固有速度差。', '- 静音阈值采用 clip peak dBFS − 35，最大 −40、最小 −90，持续至少 0.5s。初始固定 −40 会误标低音量口播，因此统一重算审阅标记，保留 review-initial.json；未更改模型原始转写或速度计时；SRT 按词时间戳统一重导出并保留初版。',
             '- 每例 `<model>/<round>/<id>/`：`transcript.txt`、`transcript.srt`、`segments.json`、`raw-segments.json`、`metrics.json`、`review.json`。SRT 通过词级时间戳合并句子，跨模型窗口保留句子；只按句末标点切分已有句子；仅无句末标点的尾部文本超12s时在词边界拆开并标 forced_duration。非句末边界和超长句列为待审，初版导出保留为 .initial。',
             '- `REVIEW.md`：按时间列出的静音/音乐幻觉候选、断句候选和模型分歧。确切错字及正确原文需听原音后填写，没有伪造的 WER。',
             '- `model-differences.json`：时间重叠对齐的模型分歧，不是真值；分段不同会产生误报。', '- [TEXT_AUDIT.md](TEXT_AUDIT.md)：可直接从字幕文本核验的超长/过短 cue 与初版导出器问题。', '- [优先听审片段](listen-clips/INDEX.md)：9 个原音片段，人名、金额/单位、外语短句与音乐候选均保留源路径和区间。',
             '- `samples.json`（脚本目录）：12 个原始 WAV 的绝对路径、来源、SHA256、质量裁切区间；不修改源音频。',
             '- 字幕：`../caption-final/captions/summary.json`，每条指向真实 yt-dlp 日志。N/A 只表示没有取得独立字幕文件，不表示画面无内嵌字幕。',
             '- 镜像入口为 `HF_ENDPOINT=https://hf-mirror.com`；本次服务返回 HF/CDN 重定向，日志保留。下载过程不计入 RTF。']
    (args.run/'REPORT.md').write_text('\n'.join(rows)+'\n',encoding='utf-8')
    (args.run/'REVIEW.md').write_text('\n'.join(review)+'\n',encoding='utf-8')
    print(f'{len(metrics)}/30 completed case metrics; report: {args.run / "REPORT.md"}')


if __name__ == '__main__':
    main()
