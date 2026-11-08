import json,tempfile,unittest,wave
from pathlib import Path
from qc import build,score_reviews
class IntegrationTests(unittest.TestCase):
 def setup_fixture(self,root):
  audio=root/'input.wav'
  with wave.open(str(audio),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\x00\x00'*16000*5)
  models={}
  for name,num in [('small','15'),('medium','50')]:
   p=root/(name+'.json');p.write_text(json.dumps([{'text':'pay '+num,'words':[{'word':' Pay','start':1,'end':1.5},{'word':' '+num,'start':1.5,'end':2}]}]))
   s=root/(name+'.srt');s.write_text('1\n00:00:01,000 --> 00:00:02,000\nPay '+num+'\n\n');models[name]={'segments':p.name,'srt':s.name}
  manifest=root/'manifest.json';manifest.write_text(json.dumps(dict(sample_id='SYNTHETIC-TEST',audio='input.wav',models=models)))
  return manifest
 def test_build_provenance_and_no_truth(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);manifest=self.setup_fixture(root);out=root/'out';data=build(manifest,out)
   self.assertEqual(data['meta']['ground_truth_provided'],False);self.assertTrue(data['rows'][0]['conflict'])
   clip=json.loads((out/'clips-index.json').read_text())[0]
   self.assertEqual((clip['clip_start'],clip['clip_end']),(0,3.5))
   with wave.open(clip['path']) as w:self.assertEqual(w.getnframes(),16000*3.5)
   html=(out/'review.html').read_text();self.assertNotIn('__QC_DATA__',html);self.assertIn('data:audio/wav;base64,',html)
   for name in ['conflicts.csv','auto-flags.csv','cue-metrics.csv']:self.assertTrue((out/name).exists())
 def test_wer_only_explicit_reference(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);out=root/'out';data=build(self.setup_fixture(root),out)
   reviews=root/'reviews.json';reviews.write_text(json.dumps(dict(dataset_id=data['dataset_id'],reviews={'1':dict(truth='Pay 15',truth_provided=False,models={})})))
   self.assertEqual(score_reviews(out/'qc-data.json',reviews,root/'wer')['reviewed_rows'],0)
   reviews.write_text(json.dumps(dict(dataset_id=data['dataset_id'],reviews={'1':dict(truth='Pay 15',truth_provided=True,models={})})))
   scored=score_reviews(out/'qc-data.json',reviews,root/'wer');self.assertEqual(scored['totals']['small']['wer'],0);self.assertEqual(scored['totals']['medium']['substitutions'],1)
 def test_explicit_empty_truth(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);out=root/'out';data=build(self.setup_fixture(root),out)
   reviews=root/'reviews.json';reviews.write_text(json.dumps(dict(dataset_id=data['dataset_id'],reviews={'1':dict(truth='',truth_provided=True,models={})})))
   result=score_reviews(out/'qc-data.json',reviews,root/'wer');self.assertEqual(result['totals']['small']['insertions'],2);self.assertIsNone(result['totals']['small']['wer'])
 def test_wrong_dataset_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);out=root/'out';build(self.setup_fixture(root),out);p=root/'review.json';p.write_text(json.dumps(dict(dataset_id='other',reviews={})))
   with self.assertRaises(ValueError):score_reviews(out/'qc-data.json',p,root/'wer')
if __name__=='__main__':unittest.main()
