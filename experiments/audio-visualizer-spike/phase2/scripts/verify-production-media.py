#!/usr/bin/env python3
"""Read-only decoded checks of newly downloaded production media, never old evidence."""
import hashlib
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'phase2/evidence'
spec = importlib.util.spec_from_file_location('original_media_helpers', ROOT / 'scripts/verify-media.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
np = helper.np


def visual_check(path, source, mode, frame_count):
    # Time-distributed samples strictly within the actual export frame count.
    frames = sorted(set([12, 27, 30, 33, 45, 57, 60, 63] +
                        [round(x) for x in np.linspace(90, frame_count - 9, 17)]))
    frames = [f for f in frames if 5 <= f < frame_count - 5]
    selector = '+'.join('eq(n\\,%d)' % n for n in frames)
    raw = helper.command(['-i', str(path), '-vf', f'select={selector}', '-vsync', '0',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    images = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 1280, 720, 3)
    observed = []
    for im in images:
        values = []
        for i in range(64):
            if mode == 'bars':
                pixels = im[490:924, int(50 + i * 620 / 64 + 3)].astype(float)
            else:
                angle = i / 64 * 2 * np.pi - np.pi / 2
                if abs(np.cos(angle)) > .88:
                    values.append(float('nan'))
                    continue
                radii = np.arange(170, 399)
                xs = np.rint(360 + np.cos(angle) * radii).astype(int)
                ys = np.rint(640 + np.sin(angle) * radii).astype(int)
                pixels = im[ys, xs].astype(float)
            mint = ((pixels[:, 1] > 170) & (pixels[:, 0] < 180) &
                    (pixels[:, 2] > 140) & (pixels[:, 1] > pixels[:, 0] * 1.3))
            ys = np.flatnonzero(mint)
            value = ((max(0, 921.6 - (490 + ys[0])) if mode == 'bars' else
                      max(0, (ys[-1] - 3) * 420 / 220)) if len(ys) else 0)
            values.append(value)
        observed.append(values)
    observed = np.array(observed)
    mono = source.mean(axis=1)
    expected = {offset: np.array([helper.heights(mono, f + offset) for f in frames])
                for offset in range(-5, 6)}
    errors = {str(offset): float(np.nanmean(np.abs(observed - heights)))
              for offset, heights in expected.items()}
    best = int(min(errors, key=errors.get))
    valid = np.isfinite(observed)
    correlation = float(np.corrcoef(observed[valid], expected[0][valid])[0, 1])
    return {'mode': mode, 'sampledFrames': frames, 'decodedFrameCount': len(images),
            'bestOffsetFrames': best, 'bestOffsetMs': best / 30 * 1000,
            'meanAbsoluteHeightErrorByOffsetPixels': errors,
            'zeroOffsetHeightCorrelation': correlation,
            'geometryLimitation': 'Circular excludes near-horizontal bands that may extend beyond the canvas.',
            'pass': len(images) == len(frames) and best == 0 and errors['0'] < 4 and correlation > .98}


def check(export_name, source_path, duration, mode):
    path = EVIDENCE / export_name
    source, decoded = helper.decode(source_path), helper.decode(path)
    starts = [.1, (duration - 3) / 2, duration - 4]
    blocks = [helper.align_block(source, decoded, int(t * helper.RATE)) for t in starts]
    drift = blocks[-1]['lagMs'] - blocks[0]['lagMs']
    probe = ROOT / 'node_modules/ffprobe-static/bin/darwin/x64/ffprobe'
    info = json.loads(subprocess.check_output([str(probe), '-v', 'error', '-show_streams',
                                              '-show_format', '-of', 'json', str(path)]))
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    media_pass = (video['codec_name'] == 'h264' and audio['codec_name'] == 'aac' and
                  video['width'] == 720 and video['height'] == 1280 and
                  video['r_frame_rate'] == '30/1' and int(video['nb_frames']) == duration * 30 and
                  all(abs(float(s['duration']) - duration) < .05 for s in [video, audio]) and
                  abs(float(info['format']['duration']) - duration) < .05)
    visual = visual_check(path, source, mode, int(duration * 30))
    audio_pass = (all(b['correlation'] > .97 and abs(b['lagMs']) < 40 for b in blocks) and abs(drift) < 2)
    return {'file': export_name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'source': str(source_path.relative_to(ROOT)),
            'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
            'sourceDecodedSeconds': len(source) / helper.RATE,
            'outputDecodedSecondsIncludingPacketPadding': len(decoded) / helper.RATE,
            'ffprobe': info, 'mediaPass': media_pass, 'audioBlocks': blocks,
            'headToTailDriftMs': drift, 'audioPass': audio_pass,
            'visual': visual, 'pass': media_pass and audio_pass and visual['pass']}


def main():
    result = {'date': datetime.now(timezone.utc).isoformat(),
              'method': 'Independent FFmpeg PCM decoding and three-block FFT cross-correlation against the input MP3; decoded H.264 geometry compared with NumPy FFT, +/-5-frame search.',
              'limits': ['Objective synthetic fixture; no human listening test.',
                         'Raw AAC decoding may include final packet padding beyond MP4 presentation duration.',
                         'Desktop production-download verification does not establish Android compatibility.'],
              'criteria': {'minimumAudioCorrelationExclusive': .97, 'maximumAudioLagMsExclusive': 40,
                           'maximumDriftMsExclusive': 2, 'maximumVisualMAEPixelsExclusive': 4,
                           'minimumVisualCorrelationExclusive': .98, 'requiredVisualOffsetFrames': 0},
              'files': []}
    for args in [('production-15s-bars.mp4', EVIDENCE / 'test-music-15s.mp3', 15, 'bars'),
                 ('production-30s-circular.mp4', ROOT / 'public/test-music.mp3', 30, 'circular')]:
        result['files'].append(check(*args))
    result['pass'] = all(f['pass'] for f in result['files'])
    (EVIDENCE / 'production-media.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2), flush=True)
    assert result['pass'], 'Production media verification failed; inspect production-media.json'


if __name__ == '__main__':
    main()
