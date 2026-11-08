import unittest
from srt_builder import build,metrics

def seg(words):return [{'words':[dict(word=t,start=a,end=b) for t,a,b in words]}]
class BuilderTests(unittest.TestCase):
 def test_long_sentence_bounds_and_identity(self):
  words=[(' word'+str(i),i*.4,i*.4+.35) for i in range(60)]
  c,notes=build(seg(words));m=metrics(c)
  self.assertEqual(m['over_7_seconds'],0);self.assertEqual(m['over_42_chars'],0)
  self.assertTrue(all(len(x['text'].splitlines())<=2 for x in c))
  self.assertEqual(' '.join(x['text'].replace('\n',' ') for x in c),' '.join(w[0].strip() for w in words))
  starts={w[1] for w in words};ends={w[2] for w in words}
  self.assertTrue(all(x['start'] in starts and x['end'] in (starts|ends) for x in c))
 def test_sentence_priority(self):
  c,_=build(seg([(' Hello.',0,1),(' Next',1.1,2),(' sentence.',2,3)]))
  self.assertEqual(c[0]['text'],'Hello.')
 def test_pause_endpoint(self):
  c,n=build(seg([(' Fast.',0,.1),(' Next.',1.0,2.0)]))
  self.assertEqual(c[0]['end'],1.0)
  self.assertEqual(metrics(c)['over_20_cps'],0)
 def test_empty(self):self.assertEqual(build([])[0],[])
 def test_impossible_long_word(self):
  c,n=build(seg([('x'*43,0,1)]));self.assertEqual(c[0]['text'],'x'*43);self.assertEqual(metrics(c)['over_42_chars'],1);self.assertTrue(n)
 def test_fast_no_time_invention(self):
  c,_=build(seg([(' Impossible',0,.1),(' speed.',.1,.2)]));self.assertEqual(c[-1]['end'],.2);self.assertGreater(metrics(c)['over_20_cps'],0)
 def test_zero_word_preserved(self):
  c,_=build(seg([(' I',0,0),(' speak.',0,1)]));self.assertIn('I',c[0]['text']);self.assertEqual(metrics(c)['zero_duration'],0)
if __name__=='__main__':unittest.main()
