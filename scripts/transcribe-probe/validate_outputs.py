"""Check real experiment artifacts, SRT timings and source provenance."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    parser.add_argument('--expected', type=int, default=30)
    args = parser.parse_args()
    errors, cases = [], []
    for path in sorted(args.run.glob('*/*/*/metrics.json')):
        m = json.loads(path.read_text())
        folder = path.parent
        for name in ['transcript.txt','transcript.srt','segments.json','raw-segments.json','review.json','boundaries.json']:
            if not (folder/name).is_file():
                errors.append(f'{folder}: missing {name}')
        if hashlib.sha256(Path(m['audio_path']).read_bytes()).hexdigest() != m['audio_sha256']:
            errors.append(f'{folder}: source hash changed')
        if abs(m['rtf'] - m['transcription_seconds']/m['audio_duration_seconds']) > 1e-9:
            errors.append(f'{folder}: inconsistent RTF')
        cues = json.loads((folder/'segments.json').read_text())
        words = lambda s: re.findall(r"\b[\w]+(?:['\u2019][\w]+)*\b", s.lower())
        if words((folder/'transcript.txt').read_text()) != words(' '.join(c['text'] for c in cues)):
            errors.append(f'{folder}: TXT/SRT words differ')
        previous = 0
        for c in cues:
            if c['start'] < 0 or c['end'] <= c['start'] or c['end'] > m['audio_duration_seconds']+.3:
                errors.append(f'{folder}: invalid cue timing {c}')
            if c['start'] < previous-.05:
                errors.append(f'{folder}: overlapping cue {c}')
            previous = c['end']
        srt = (folder/'transcript.srt').read_text()
        count = len(re.findall(r'^\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}$',srt,re.M))
        if count != len(cues) or count != m['cue_count']:
            errors.append(f'{folder}: SRT cue count mismatch')
        if len(cues)==1 and m['audio_duration_seconds']>30 and len(cues[0]['text'].split())>30:
            errors.append(f'{folder}: whole long transcript put in one cue')
        if not cues and (folder/'transcript.txt').read_text().strip():
            errors.append(f'{folder}: text exists but SRT empty')
        cases.append(dict(model=m['model_size'],round=m['round'],sample=m['sample_id'],cues=count))
    if len(cases)!=args.expected:
        errors.append(f'Expected {args.expected} completed cases, found {len(cases)}')
    result=dict(case_count=len(cases),expected=args.expected,errors=errors,cases=cases)
    (args.run/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(bool(errors))


if __name__ == '__main__':
    main()
