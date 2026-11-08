"""Fresh public URL extraction, no cookies/proxies/media conversion."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time
import yt_dlp
import yt_dlp.version
from turbo import MAX_AUDIO_SECONDS

class Log:
    def __init__(self):self.lines=[]
    def debug(self,message):self.lines.append(str(message))
    def info(self,message):self.lines.append(str(message))
    def warning(self,message):self.lines.append(str(message))
    def error(self,message):self.lines.append(str(message))


def media_duration(data):
    """Read MP4 box metadata only; never decode, rewrite or estimate timing."""
    found=[]
    def scan(start,end):
        pos=start
        while pos+8<=end:
            size=int.from_bytes(data[pos:pos+4],'big');kind=data[pos+4:pos+8];header=8
            if size==1:
                size=int.from_bytes(data[pos+8:pos+16],'big');header=16
            if size==0:size=end-pos
            if size<header or pos+size>end:break
            body=pos+header;stop=pos+size
            if kind in {b'moov',b'trak',b'mdia'}:scan(body,stop)
            if kind in {b'mvhd',b'mdhd'} and body+20<=stop:
                version=data[body];offset=20 if version==1 else 12
                width=8 if version==1 else 4
                if body+offset+4+width<=stop:
                    scale=int.from_bytes(data[body+offset:body+offset+4],'big')
                    duration=int.from_bytes(data[body+offset+4:body+offset+4+width],'big')
                    if scale and 0<duration<(2**(8*width)-1):found.append((kind.decode(),duration/scale))
            pos=stop
    scan(0,len(data))
    return max((d for k,d in found),default=None),found

url=sys.argv[1];log=Log();started=time.perf_counter()
result={'url':url,'extractor_version':yt_dlp.version.__version__,'cookies':False,'proxy':False,'ffmpeg':False,'audio_bytes':0}
try:
    with tempfile.TemporaryDirectory() as folder:
        options={'logger':log,'noplaylist':True,'cachedir':False,'retries':0,'extractor_retries':0,'fragment_retries':0,'socket_timeout':15,'quiet':True,'no_warnings':False,'outtmpl':str(Path(folder)/'audio.%(ext)s'),'format':'bestaudio[vcodec=none]','max_filesize':4500000,'postprocessors':[],'fixup':'never'}
        with yt_dlp.YoutubeDL(options) as ydl:
            # If selection fails, error remains evidence; never accept a combined video as audio.
            info=ydl.extract_info(url,download=False)
            formats=info.get('formats') or []
            result['duration']=info.get('duration');result['media_id']=info.get('id')
            result['formats']=[{k:f.get(k) for k in ['format_id','ext','vcodec','acodec','filesize']} for f in formats]
            if info.get('duration') is not None and not 0<float(info['duration'])<=MAX_AUDIO_SECONDS:
                result.update(status='blocked',error='unknown_duration_or_over_limit_seconds')
            else:
                rc=ydl.download([url])
                files=[x for x in Path(folder).iterdir() if x.is_file() and x.suffix not in {'.part','.ytdl'}]
                if rc or len(files)!=1:raise ValueError('Audio download did not produce one complete file')
                audio=files[0].read_bytes();result.update(audio_bytes=len(audio),audio_sha256=hashlib.sha256(audio).hexdigest(),ext=files[0].suffix.lstrip('.'))
                if not audio:raise ValueError('Empty audio')
                measured,boxes=media_duration(audio);result['container_duration_seconds']=measured;result['duration_boxes']=boxes
                if measured is None:
                    result['duration_verification']='unknown; downstream transcription remains blocked'
                elif measured>MAX_AUDIO_SECONDS:
                    result.update(status='blocked',error='container_duration_over_limit_seconds');raise ValueError(f'too_long: full audio exceeds {MAX_AUDIO_SECONDS}-second limit')
                result['audio_base64']=base64.b64encode(audio).decode();result['status']='audio_downloaded'
                if len(json.dumps(result).encode())>4400000:
                    del result['audio_base64'];result.update(status='blocked',error='response_payload_too_large_no_truncation')
except Exception as error:result.update(status='failed',error=type(error).__name__+': '+str(error))
result['seconds']=time.perf_counter()-started;result['extractor_log']=log.lines
print(json.dumps(result,ensure_ascii=False))
