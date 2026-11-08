import csv,json,tempfile,unittest,wave
from pathlib import Path
from qc_core import tokenize,wer,align_models,conflict_rows,auto_flags,load_segments,parse_srt

class QCTests(unittest.TestCase):
 def tokens(self,text,start=0):
  return [dict(norm=t,text=(' ' if i else '')+t,start=start+i,end=start+i+.8) for i,t in enumerate(tokenize(text))]
 def test_wer_categories(self):
  m=wer('I do not pay 15 dollars','I pay 50 dollars now')
  self.assertEqual(m['distance'],4);self.assertEqual(m['deletions'],2);self.assertEqual(m['substitutions'],1);self.assertEqual(m['insertions'],1)
 def test_wer_empty(self):
  m=wer('','thanks');self.assertIsNone(m['wer']);self.assertEqual(m['insertions'],1)
 def test_normalization(self):self.assertEqual(tokenize("I don’t pay $1,000."),['i',"don't",'pay','$','1,000'])
 def test_alignment_does_not_shift_following(self):
  c=align_models({'a':self.tokens('we do not pay 15 dollars'),'b':self.tokens('we pay 15 dollars')})
  self.assertEqual(sum(x['conflict'] for x in c),2)
  self.assertEqual(c[-1]['tokens']['a']['norm'],c[-1]['tokens']['b']['norm'])
 def test_time_breaks_repeated_word_tie(self):
  a=[dict(norm='yes',text='yes ',start=0,end=1),dict(norm='yes',text='yes',start=10,end=11)]
  b=[dict(norm='yes',text='yes',start=10,end=11)]
  c=align_models({'a':a,'b':b});self.assertIsNone(c[0]['tokens']['b']);self.assertIsNotNone(c[1]['tokens']['b'])
 def test_third_model(self):
  c=align_models({'a':self.tokens('a b c'),'b':self.tokens('a c'),'cloud':self.tokens('a b d c')})
  self.assertEqual(sum(x['conflict'] for x in c),2)
 def test_identical_no_conflicts(self):
  c=align_models({'a':self.tokens('Hello world'),'b':self.tokens('Hello world',.2)})
  self.assertFalse(any(x['conflict'] for x in c))
 def test_number_rank_and_missing(self):
  c=align_models({'a':self.tokens('pay 15 dollars'),'b':self.tokens('pay 50 dollars')})
  r=conflict_rows(c,[dict(start=0,end=3,text='pay 15 dollars')],['a','b'])
  self.assertTrue(r[0]['conflict']);self.assertIn('number',r[0]['reasons']);self.assertEqual((r[0]['disagreement_spans'][0]['start'],r[0]['disagreement_spans'][0]['end']),(1,1.8))
 def test_spoken_number_priority(self):
  c=align_models({'a':self.tokens('fifteen dollars'),'b':self.tokens('fifty dollars')})
  r=conflict_rows(c,[dict(start=0,end=3,text='fifteen dollars')],['a','b'])
  self.assertIn('number',r[0]['reasons'])
 def test_all_missing_reference(self):
  c=align_models({'a':[],'b':self.tokens('not empty')})
  r=conflict_rows(c,[],['a','b']);self.assertTrue(r[0]['conflict']);self.assertEqual(r[0]['texts']['a'],'')
 def test_gap_is_candidate_only(self):
  f=auto_flags('a',[dict(start=0,end=1,text='when I'),dict(start=4,end=5,text='went home.')])
  self.assertTrue(any(x['kind']=='gap_continuation_candidate' for x in f))
  f=auto_flags('a',[dict(start=0,end=1,text='Done.'),dict(start=4,end=5,text='New sentence.')])
  self.assertFalse(any(x['kind']=='gap_continuation_candidate' for x in f))
 def test_low_speed_flag(self):
  f=auto_flags('a',[dict(start=i*11,end=i*11+d,text=t) for i,(d,t) in enumerate([(1,'quite normal'),(1,'quite normal'),(10,'hi')])])
  self.assertTrue(any(x['kind']=='low_cps_outlier' for x in f))
 def test_srt_and_words_input(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'s.json';p.write_text(json.dumps([dict(start=0,end=1,text=' Hello!',words=[dict(start=0,end=1,word=' Hello!')])]))
   self.assertEqual(load_segments(p)[0]['norm'],'hello')
   s=Path(d)/'a.srt';s.write_text('1\n00:00:00,000 --> 00:00:01,000\nHello!\n\n')
   self.assertEqual(parse_srt(s)[0]['end'],1)
 def test_number_pieces_are_one_word(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'s.json';p.write_text(json.dumps([{'words':[{'word':' 1','start':0,'end':.2},{'word':',000.','start':.2,'end':.4}]}]))
   t=load_segments(p);self.assertEqual([x['norm'] for x in t],['1,000']);self.assertEqual(t[0]['end'],.4)
 def test_provider_words_without_spaces(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'s.json';p.write_text(json.dumps({'words':[{'text':'Hello','start':0,'end':1},{'text':'world.','start':1,'end':2}]}))
   t=load_segments(p);self.assertEqual(''.join(x['text'] for x in t).strip(),'Hello world.')
 def test_missing_word_times_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'s.json';p.write_text(json.dumps([dict(start=0,end=1,text='hello')]))
   with self.assertRaises(ValueError):load_segments(p)
   p.write_text(json.dumps([dict(start=0,end=1,text='hello',words=[])]))
   with self.assertRaises(ValueError):load_segments(p)
if __name__=='__main__':unittest.main()
