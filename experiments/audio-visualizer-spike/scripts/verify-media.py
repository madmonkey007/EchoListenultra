#!/usr/bin/env python3
"""Independent decoded-media checks; requires numpy and the dev-only ffmpeg-static binary.
Run after browser exports: python scripts/verify-media.py
Never changes or re-encodes the tested MP4 files.
"""
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / 'node_modules/ffmpeg-static/ffmpeg'
RATE = 48000

def command(args):
    result=subprocess.run([str(FFMPEG), '-v', 'error', *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def decode(path):
    return np.frombuffer(command(['-i', str(path), '-vn', '-f', 'f32le', '-ac', '2', '-ar', str(RATE), 'pipe:1']), dtype='<f4').reshape(-1, 2).astype(np.float64)

def align_block(source, decoded, start, duration=3):
    # Cross correlation of same absolute-time blocks, allowing +/- 100 ms.
    n = int(duration * RATE)
    a = source[start:start+n].mean(axis=1)
    b = decoded[start:start+n].mean(axis=1)
    size = 1 << (len(a)+len(b)-1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(b, size)*np.conj(np.fft.rfft(a, size)), size)
    lags = np.arange(-4800, 4801)
    lag = int(lags[np.argmax(corr[lags % size])])
    s = source[start+max(0,-lag):start+n-max(0,lag)]
    d = decoded[start+max(0,lag):start+n-max(0,-lag)]
    gain = float(np.sum(s*d)/np.sum(s*s))
    snr = float(10*np.log10(np.sum((gain*s)**2)/np.sum((d-gain*s)**2)))
    return {'startSeconds': start/RATE, 'lagSamples': lag, 'lagMs':lag/RATE*1000,
            'correlation':float(np.corrcoef(s.ravel(),d.ravel())[0,1]), 'gain':gain, 'snrDb':snr}

def heights(pcm, frame):
    size=2048
    start=round(frame/30*RATE)-size//2
    window=np.zeros(size)
    lo=max(0,start);hi=min(len(pcm),start+size)
    if hi>lo:window[lo-start:hi-start]=pcm[lo:hi]
    bins=np.abs(np.fft.rfft(window*np.hanning(size)))[:size//2]*4/size
    bars=[]
    for i in range(64):
        low=max(1,int(35*(16000/35)**(i/64)*size/RATE))
        high=max(low+1,int(35*(16000/35)**((i+1)/64)*size/RATE))
        peak=np.max(bins[low:min(high,len(bins))])
        bars.append(np.clip((20*np.log10(peak+1e-6)+65)/65,0,1)*420)
    return np.array(bars)

def visual_check(path, source, save_pngs=False, mode="bars"):
    frames=[12,27,30,33,45,57,60,63,90,123,150,210,273,330,393,450,513,570,633,690,753,810,843,870,891]
    selector='+'.join('eq(n\\,%d)'%n for n in frames)
    raw=command(['-i',str(path),'-vf',f'select={selector}','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
    images=np.frombuffer(raw,dtype=np.uint8).reshape(-1,1280,720,3)
    observed=[]
    for im in images:
        column_heights=[]
        for i in range(64):
            if mode == 'bars':
                x=int(50+i*620/64+3)
                pixels=im[490:924,x].astype(float)
            else:
                angle=i/64*2*np.pi-np.pi/2
                if abs(np.cos(angle)) > .88:
                    column_heights.append(float('nan'))
                    continue
                radii=np.arange(170,399)
                xs=np.rint(360+np.cos(angle)*radii).astype(int)
                ys=np.rint(640+np.sin(angle)*radii).astype(int)
                pixels=im[ys,xs].astype(float)
            mint=(pixels[:,1]>170)&(pixels[:,0]<180)&(pixels[:,2]>140)&(pixels[:,1]>pixels[:,0]*1.3)
            ys=np.flatnonzero(mint)
            column_heights.append((max(0,921.6-(490+ys[0])) if mode == 'bars' else max(0,(ys[-1]-3)*420/220)) if len(ys) else 0)
        observed.append(column_heights)
    observed=np.array(observed)
    mono=source.mean(axis=1)
    expected={offset:np.array([heights(mono,n+offset) for n in frames]) for offset in range(-5,6)}
    errors={str(offset):float(np.nanmean(np.abs(observed-values))) for offset,values in expected.items()}
    best=int(min(errors,key=errors.get))
    valid=np.isfinite(observed)
    correlation=float(np.corrcoef(observed[valid],expected[0][valid])[0,1])
    if save_pngs:
        for n in [30,273,633,891]:
            command(['-y','-i',str(path),'-vf',f'select=eq(n\\,{n})','-vsync','0','-frames:v','1',str(ROOT/f'evidence/frame-{mode}-{n:03d}.png')])
    return {'mode':mode,'geometryNote':'Circular excludes near-horizontal bands that can extend beyond canvas edges; only fully visible radial lines measured.' if mode=='circular' else 'All 64 bars measured.','sampledFrames':frames,'decodedFrameCount':len(images),'bestExpectedOffsetFrames':best,
            'bestExpectedOffsetMs':best/30*1000,'meanAbsoluteBarHeightErrorPixelsByOffset':errors,
            'zeroOffsetHeightCorrelation':correlation,
            'observedMeanFrameToFrameHeightChangePixels':float(np.nanmean(np.abs(np.diff(observed,axis=0)))),
            'pass':best==0 and errors['0']<4 and correlation>.98}

def main():
    source=decode(ROOT/'public/test-music.wav')
    result={'audioPassCriteria':{'minimumCorrelation':.97,'maximumAbsoluteLagMsExclusive':40,'maximumHeadToTailDriftMsExclusive':2},
            'visualPassCriteria':{'bestOffsetFrames':0,'maximumMeanAbsoluteHeightErrorPixelsExclusive':4,'minimumHeightCorrelation':.98},
            'method':'Decode original PCM and exported AAC with FFmpeg; independently correlate three stereo PCM blocks. Decode H.264 frames; compare 64 bar heights against NumPy Hann FFT at each frame timestamp. Positive audio lag means exported audio is later than original. PNGs are decoded frames, not browser screenshots.',
            'limitations':['Objective synthetic-fixture measurement; no human listening test.', 'Raw FFmpeg AAC PCM decoding includes 14.667ms final packet padding beyond the 30.000s MP4 presentation duration; content alignment is measured independently of that padding.', 'Visual alignment is measured against synthetic music and rendered geometry; Android device not tested.'], 'files':[]}
    for index in range(1,6):
        path=ROOT/f'evidence/export-{index}.mp4'
        decoded=decode(path)
        blocks=[align_block(source,decoded,int(start*RATE)) for start in [.1,13,26]]
        visual=visual_check(path,source,index in [1,2], 'bars' if index%2 else 'circular')
        item={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'decodedAudioSamples':len(decoded),
              'decodedAudioSeconds':len(decoded)/RATE,'sourceAudioSeconds':len(source)/RATE,'channels':2,
              'sourceRms':np.sqrt(np.mean(source**2,axis=0)).tolist(),'decodedRms':np.sqrt(np.mean(decoded**2,axis=0)).tolist(),
              'audioBlocks':blocks,'headToTailAudioDriftMs':blocks[-1]['lagMs']-blocks[0]['lagMs'],
              'audioPass':all(b['correlation']>.97 and abs(b['lagMs'])<40 for b in blocks) and abs(blocks[-1]['lagMs']-blocks[0]['lagMs'])<2,
              'visual':visual}
        result['files'].append(item)
    mp3_source=ROOT/'public/test-music.mp3'
    mp3_export=ROOT/'evidence/mp3-input.mp4'
    if mp3_source.exists() and mp3_export.exists():
        original=decode(mp3_source)
        encoded=decode(mp3_export)
        blocks=[align_block(original,encoded,int(start*RATE)) for start in [.1,13,26]]
        result['extraMp3Input']={'source':mp3_source.name,'file':mp3_export.name,
            'sha256':hashlib.sha256(mp3_export.read_bytes()).hexdigest(),
            'sourceDecodedSeconds':len(original)/RATE,'exportDecodedSeconds':len(encoded)/RATE,
            'audioBlocks':blocks,'headToTailAudioDriftMs':blocks[-1]['lagMs']-blocks[0]['lagMs'],
            'audioPass':all(b['correlation']>.97 and abs(b['lagMs'])<40 for b in blocks) and abs(blocks[-1]['lagMs']-blocks[0]['lagMs'])<2,
            'visualAlignment':'Not measured for this additional MP3-input export.'}
    result['pass']=all(f['audioPass'] and f['visual']['pass'] for f in result['files']) and result.get('extraMp3Input',{'audioPass':True})['audioPass']
    out=ROOT/'evidence/media-validation.json'
    out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'pass':result['pass'],'files':[{'file':f['file'],'audioPass':f['audioPass'],'audioLagsMs':[b['lagMs'] for b in f['audioBlocks']],'minimumAudioCorrelation':min(b['correlation'] for b in f['audioBlocks']),'visualPass':f['visual']['pass'],'visualLagFrames':f['visual']['bestExpectedOffsetFrames'],'visualHeightErrorPixels':f['visual']['meanAbsoluteBarHeightErrorPixelsByOffset']['0']} for f in result['files']]},indent=2))

if __name__=='__main__':main()
