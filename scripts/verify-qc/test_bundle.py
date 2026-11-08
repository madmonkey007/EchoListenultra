import base64,io,json,tempfile,unittest,wave
from pathlib import Path
from bundle import make_bundle,validate_bundle

def write_audio(path,seconds=1):
 with wave.open(str(path),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*int(16000*seconds))
def payload(path):
 import re
 return json.loads(re.search(r'<script id="qc-data" type="application/json">(.*?)</script>',path.read_text(),re.S)[1])
class BundleTests(unittest.TestCase):
 def test_embedded_samples_and_safe_text(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);paths=[]
   for i in range(2):
    folder=root/str(i);folder.mkdir();write_audio(folder/'audio.wav')
    p=folder/'qc-data.json';p.write_text(json.dumps(dict(dataset_id=str(i),sample_id='sample</script>'+str(i),models=['small','medium'],rows=[],flags=[],source={},meta={'duration':1})));paths.append(p)
   out=root/'review.html';result=make_bundle(paths,out)
   self.assertEqual(result['sample_count'],2);self.assertNotIn('sample</script>',out.read_text());self.assertIn('id="sample-select"',out.read_text())
   self.assertEqual(result['embedded_full_audio'],2)
   self.assertEqual(validate_bundle(out)['sample_count'],2)
 def test_full_audio_transcripts_and_original_unchanged(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);write_audio(root/'audio.wav',2)
   row=dict(segment_index=3,start=.2,end=1.4,texts={'small':'Hello world.','medium':'Hello earth.'},tokens={'small':[{'text':'Hello ','diff':False},{'text':'world.','diff':True}],'medium':[{'text':'Hello ','diff':False},{'text':'earth.','diff':True}]},audio={'src':'old_clip','start':0,'end':2})
   original=dict(dataset_id='preserved',sample_id='sample',models=['small','medium'],rows=[row],meta={'duration':2})
   p=root/'qc-data.json';p.write_text(json.dumps(original));out=root/'review.html';result=make_bundle([p],out)
   sample=payload(out)['datasets'][0]
   self.assertEqual(sample['dataset_id'],'preserved');self.assertNotIn('src',sample['rows'][0]['audio']);self.assertEqual(sample['rows'][0]['audio']['end'],2)
   self.assertEqual(sample['full_audio']['duration'],2)
   self.assertEqual(sample['full_transcripts']['medium'][0]['text'],'Hello earth.')
   self.assertEqual(sample['full_transcripts']['small'][0]['segment_index'],3)
   self.assertEqual(json.loads(p.read_text()),original)
   self.assertEqual(result['embedded_audio_clips'],0)
   sample['full_audio']['duration']=99
   html=out.read_text();import re
   out.write_text(re.sub(r'(<script id="qc-data" type="application/json">).*?(</script>)',lambda m:m[1]+json.dumps({'datasets':[sample]})+m[2],html,flags=re.S))
   with self.assertRaisesRegex(ValueError,'duration'):validate_bundle(out)
 def test_legacy_embedded_clip_remains_valid(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);write_audio(root/'clip.wav')
   source='data:audio/wav;base64,'+base64.b64encode((root/'clip.wav').read_bytes()).decode()
   data={'datasets':[dict(dataset_id='legacy',sample_id='old',rows=[{'audio':{'src':source}}])]}
   path=root/'old.html';path.write_text('<script id="qc-data" type="application/json">'+json.dumps(data)+'</script>')
   result=validate_bundle(path)
   self.assertEqual(result['embedded_audio_clips'],1);self.assertEqual(result['embedded_full_audio'],0)
 def test_transcript_loss_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);write_audio(root/'audio.wav')
   p=root/'qc-data.json';p.write_text(json.dumps(dict(dataset_id='one',sample_id='one',models=['small'],rows=[dict(segment_index=1,start=0,end=1,texts={'small':'Retain every word'},tokens={},audio={})])))
   out=root/'review.html';make_bundle([p],out)
   html=out.read_text();data=payload(out);data['datasets'][0]['full_transcripts']['small'][0]['text']='Retain'
   import re
   out.write_text(re.sub(r'(<script id="qc-data" type="application/json">).*?(</script>)',lambda m:m[1]+json.dumps(data)+m[2],html,flags=re.S))
   with self.assertRaisesRegex(ValueError,'transcript'):validate_bundle(out)
 def test_duplicate_dataset_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'a.json';p.write_text(json.dumps(dict(dataset_id='same',sample_id='one',models=['small','medium'],rows=[])))
   with self.assertRaises(ValueError):make_bundle([p,p],Path(d)/'out.html')
if __name__=='__main__':unittest.main()
