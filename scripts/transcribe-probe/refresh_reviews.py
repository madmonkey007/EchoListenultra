"""Recompute review-only energy flags consistently; never rerun or retime ASR."""
import argparse,json,pathlib
from probe import detect_silence,silence_threshold,suspicious_segments,save,sentence_cues,srt_text
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('run',type=pathlib.Path);args=parser.parse_args()
for mpath in args.run.glob('*/*/*/metrics.json'):
 folder=mpath.parent;metrics=json.loads(mpath.read_text());rpath=folder/'review.json';review=json.loads(rpath.read_text());raw=json.loads((folder/'raw-segments.json').read_text());audio=pathlib.Path(metrics['inference_audio_path'])
 if not (folder/'review-initial.json').exists():save(folder/'review-initial.json',review)
 for name in ['transcript.srt','segments.json','boundaries.json']:
  backup=folder/(name+'.initial')
  if not backup.exists():backup.write_bytes((folder/name).read_bytes())
 cues=sentence_cues(raw)
 (folder/'transcript.srt').write_text(srt_text(cues),encoding='utf-8')
 save(folder/'segments.json',[dict(start=c['start'],end=c['end'],text=c['text']) for c in cues]);save(folder/'boundaries.json',cues)
 review['boundary_candidates']=[dict(**c,status='needs_listening',reasons=['non_sentence_boundary' if c['boundary']!='sentence' else 'long_cue']) for c in cues if c['boundary']!='sentence' or c['end']-c['start']>12]
 review['silence_intervals']=detect_silence(audio,metrics['audio_duration_seconds']);review['silence_threshold_db']=silence_threshold(audio);review['silence_threshold_method']='clip peak dBFS - 35, capped at -40 and floored at -90; duration >= 0.5s';review['review_analysis_version']=2
 flags=suspicious_segments(raw,review['silence_intervals'],review['declared_music_intervals']);review['hallucination_candidates']=flags;save(rpath,review)
 metrics['hallucination_candidate_count']=len(flags);metrics['review_analysis_version']=2;metrics['srt_export_version']=2;metrics['cue_count']=len(cues);metrics['boundary_candidate_count']=len(review['boundary_candidates']);save(mpath,metrics)
print('Review flags and SRT export refreshed; ASR timings/raw words unchanged. Initial exports preserved.')
