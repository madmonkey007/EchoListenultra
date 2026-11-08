import unittest
from vad_experiment import repeats, cue_metrics
class Tests(unittest.TestCase):
 def test_repeat(self):
  r=repeats([{'start':0,'end':9,'text':'Hello world. Hello world. Hello world.'}])
  self.assertTrue(any(x['count']==3 and x['phrase']=='hello world' for x in r))
 def test_primitive_repeat(self):
  r=repeats([{'start':0,'end':9,'text':'Go home. '*6}])
  self.assertTrue(any(x['count']==6 and x['phrase']=='go home' for x in r))
 def test_no_repeat(self):
  self.assertEqual(repeats([{'start':0,'end':2,'text':'Hello world. Hello world.'}]),[])
 def test_numpy_times_json(self):
  import numpy as np,json
  json.dumps(cue_metrics([{'start':np.float64(0),'end':np.float64(8),'text':'hello'}]))
 def test_metrics(self):
  m=cue_metrics([{'start':0,'end':8,'text':'x'*43},{'start':8,'end':8,'text':'a'}])
  self.assertEqual((m['max_seconds'],m['max_chars'],m['over_7_seconds'],m['over_42_chars'],m['zero_duration']),(8,43,1,1,1))
if __name__=='__main__':unittest.main()
