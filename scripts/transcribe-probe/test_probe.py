import unittest
from probe import sentence_cues, srt_text, suspicious_segments, detect_silence


class OutputTests(unittest.TestCase):
    def test_sentences_use_word_boundaries_not_one_whole_clip(self):
        words = [dict(start=i, end=i + .8, word=w) for i, w in enumerate(
            [' Hello', ' world.', ' My', ' name', ' is', ' Anne.'])]
        cues = sentence_cues([dict(start=0, end=6, text='Hello world. My name is Anne.', words=words)])
        self.assertEqual(len(cues), 2)
        self.assertEqual(cues[0]['end'], 1.8)
        self.assertEqual(cues[1]['start'], 2)
        self.assertIn('00:00:02,000 --> 00:00:05,800', srt_text(cues))

    def test_silence_overlap_is_a_candidate_not_confirmed_hallucination(self):
        flags = suspicious_segments([dict(start=1, end=3, text='Thanks', no_speech_prob=.9,
                                          avg_logprob=-1.5, compression_ratio=1)], [[0, 4]], [])
        self.assertEqual(flags[0]['status'], 'needs_listening')
        self.assertIn('silence_overlap', flags[0]['reasons'])

    def test_empty_audio_output_has_no_fake_cue(self):
        self.assertEqual(sentence_cues([]), [])
        self.assertEqual(srt_text([]), '')

    def test_title_abbreviation_does_not_cut_a_sentence(self):
        words = [dict(start=i, end=i+.7, word=w) for i,w in enumerate(
            [' Mr.', ' Carter', ' is', ' here.'])]
        self.assertEqual(len(sentence_cues([dict(start=0,end=4,text='',words=words)])),1)

    def test_unpunctuated_speech_cannot_be_one_whole_clip_cue(self):
        words = [dict(start=i,end=i+.8,word=' hello') for i in range(45)]
        cues = sentence_cues([dict(start=0,end=45,text='',words=words)])
        self.assertGreater(len(cues),1)
        self.assertEqual(cues[0]['boundary'],'forced_duration')

    def test_quiet_signal_is_not_mistaken_for_silence(self):
        import math, struct, tempfile, wave
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'quiet.wav'
            data=[round(60*math.sin(2*math.pi*220*i/16000)) for i in range(16000)]+[0]*16000
            with wave.open(str(p),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
                w.writeframes(struct.pack('<'+'h'*len(data),*data))
            intervals=detect_silence(p,2)
            self.assertEqual(len(intervals),1)
            self.assertGreaterEqual(intervals[0][0],.99)

    def test_long_sentence_is_not_cut_after_a_preposition(self):
        words=[dict(start=0,end=11.5,word=' Restaurants in'),
               dict(start=11.5,end=13,word=' the city.')]
        cues=sentence_cues([dict(start=0,end=13,text='',words=words)])
        self.assertEqual(len(cues),1)
        self.assertEqual(cues[0]['text'],'Restaurants in the city.')

    def test_zero_duration_sentence_is_retained_in_neighbor_cue(self):
        raw=[dict(start=0,end=0,text="I don't.",words=[dict(start=0,end=0,word=' I'),dict(start=0,end=0,word=" don't.")]),
             dict(start=0,end=1,text='I speak.',words=[dict(start=0,end=.4,word=' I'),dict(start=.4,end=1,word=' speak.')])]
        cues=sentence_cues(raw)
        self.assertEqual(cues[0]['text'],"I don't. I speak.")
        self.assertEqual(cues[0]['boundary'],'merged_zero_duration')


if __name__ == '__main__':
    unittest.main()
