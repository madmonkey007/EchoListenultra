import unittest
from cue_postprocess import assemble, render_srt

def segments(items):
    return [{'words':[{'word':w,'start':a,'end':b} for w,a,b in items]}]

class CueTests(unittest.TestCase):
    def test_limits_identity_and_srt(self):
        source=segments([(' word'+str(i),i*.3,i*.3+.25) for i in range(90)])
        cues=assemble(source)
        self.assertEqual(' '.join(c['text'] for c in cues).split(), ''.join(w['word'] for w in source[0]['words']).split())
        self.assertTrue(all(0<c['end']-c['start']<=7 for c in cues))
        self.assertTrue(all(len(line)<=42 for c in cues for line in c['text'].splitlines()))
        self.assertTrue(all(a['end']<=b['start'] for a,b in zip(cues,cues[1:])))
        self.assertIn(' --> ',render_srt(cues))

    def test_joined_atoms_and_long_word(self):
        source=segments([(' $',0,.1),('5',.1,.2),(' 1',.2,.3),(',000',.3,.4),(' 3.14',.4,.5),(' Mr.',.5,.6),(' U.S.',.6,.7),(' e.g.',.7,.8),(' https://example.org/a',.8,1),(' '+'x'*50,1,2)])
        text=' '.join(c['text'] for c in assemble(source))
        for atom in ['$5','1,000','3.14','Mr.','U.S.','e.g.','https://example.org/a','x'*50]:self.assertIn(atom,text)

    def test_no_silence_padding(self):
        cues=assemble(segments([(' Hi.',0,.1),(' Next.',20,21)]))
        self.assertEqual(cues[0]['end'],.1)

    def test_language_is_metadata(self):
        source=segments([(' Hello.',0,1),(' Je',1,1.2),(" m'appelle.",1.2,2),(' Bye.',2,3)])
        cues=assemble(source,[{'start':1,'end':2,'language':'fr'}])
        self.assertEqual([c['language'] for c in cues],['en','fr','en'])
        self.assertEqual(cues[1]['text'],"Je m'appelle.")
        self.assertNotIn('[fr]',render_srt(cues))

    def test_zero_word_attached(self):
        cues=assemble(segments([(' Bone',0,0),(' drawers,',0,.2),(' hey.',.3,.4)]))
        self.assertTrue(all(c['end']>c['start'] for c in cues))

    def test_actual_interview_offline(self):
        import json
        from pathlib import Path
        path=Path(__file__).parent/'runs/20261021-small-medium/small/hallucination/DbQzbzrAJ-V/raw-segments.json'
        original=path.read_bytes()
        source=json.loads(original)
        cues=assemble(source,[{'start':53.1,'end':53.9,'language':'fr'}, {'start':58.64,'end':58.8,'language':'fr'}])
        expected=''.join(w['word'] for s in source for w in s['words']).strip()
        actual=' '.join(c['text'].replace('\n',' ') for c in cues)
        self.assertEqual(expected.split(),actual.split())
        self.assertEqual(len(expected),len(actual))
        self.assertTrue(all(0<round(c['end']-c['start'],3)<=7 for c in cues))
        self.assertTrue(all(len(line)<=42 for c in cues for line in c['text'].splitlines()))
        self.assertTrue(all(a['end']<=b['start'] for a,b in zip(cues,cues[1:])))
        self.assertEqual(path.read_bytes(),original)
        self.assertEqual([c['text'] for c in cues if c['language']=='fr'],["Je m'appelle.", "Bone drawers,"])

    def test_impossible_timing_rejected(self):
        with self.assertRaises(ValueError):assemble(segments([(' word',0,8)]))

if __name__=='__main__':unittest.main()
