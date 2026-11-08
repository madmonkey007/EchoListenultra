import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/transcribe-probe'))
from cue_postprocess import assemble, render_srt
from turbo import flatten_words, make_payload, transcribe, validate_response_duration, MAX_REQUEST_BYTES, MAX_AUDIO_SECONDS

class TurboTests(unittest.TestCase):
    def response(self):
        return {'success':True,'result':{'transcription_info':{'duration':10,'duration_after_vad':1},'vtt':'IGNORE','segments':[{'start':900,'end':901,'words':[{'word':' If','start':0,'end':.18},{'word':' you','start':.18,'end':.34}]}]}}

    def test_flatten_only_word_times(self):
        self.assertEqual(flatten_words(self.response()),[{'text':'If','start':0,'end':.18},{'text':'you','start':.18,'end':.34}])

    def test_missing_words_never_falls_back(self):
        for result in [{'text':'Hi','vtt':'WEBVTT'}, {'segments':[{'start':0,'end':1,'text':'Hi'}]}]:
            with self.assertRaises(ValueError):flatten_words({'success':True,'result':result})

    def test_invalid_times_fail(self):
        for value in [None,True,float('nan'),-.1]:
            response=self.response();response['result']['segments'][0]['words'][0]['start']=value
            with self.assertRaises(ValueError):flatten_words(response)

    def test_request_and_shared_engine(self):
        calls=[]
        def transport(url,payload,token,timeout):
            calls.append((url,payload,token,timeout));return self.response()
        result=transcribe(b'RIFF','account','secret',assemble,audio_seconds=10,transport=transport)
        self.assertTrue(calls[0][0].endswith('/@cf/openai/whisper-large-v3-turbo'))
        self.assertEqual(calls[0][1],{'audio':'UklGRg==','vad_filter':True})
        self.assertEqual(result['cues'][0]['text'],'If you')
        self.assertIn('00:00:00,340',render_srt(result['cues']))

    def test_duration_rejected_before_network(self):
        for duration in [None, True, 0, MAX_AUDIO_SECONDS+.001, float('nan')]:
            with self.assertRaises(ValueError):
                transcribe(b'RIFF','account','secret',assemble,audio_seconds=duration,
                           transport=lambda *a: self.fail('Must not request'))

    def test_post_duration_uses_original_not_vad_duration(self):
        response=self.response()
        response['result']['transcription_info']={'duration':MAX_AUDIO_SECONDS+.001,'duration_after_vad':1}
        with self.assertRaisesRegex(ValueError,'too_long'):
            transcribe(b'RIFF','account','secret',lambda s:self.fail('Cue generation must not run'),
                       audio_seconds=10,transport=lambda *a:response)
        response['result']['transcription_info']['duration']=MAX_AUDIO_SECONDS
        self.assertEqual(validate_response_duration(response),MAX_AUDIO_SECONDS)

    def test_missing_post_duration_is_not_guessed(self):
        for value in [None,True,0,-1,float('inf'),float('nan'),'41.36']:
            response=self.response();response['result']['transcription_info']['duration']=value
            with self.assertRaisesRegex(ValueError,'invalid_duration'):
                validate_response_duration(response)

    def test_byte_check_accounts_for_json_base64_expansion(self):
        overhead=len(json.dumps({'audio':'','vad_filter':True}).encode())
        size=((MAX_REQUEST_BYTES-overhead)//4)*3
        payload=make_payload(b'x'*size)
        self.assertLessEqual(len(json.dumps(payload).encode()),MAX_REQUEST_BYTES)
        with self.assertRaisesRegex(ValueError,'payload_too_large'):
            make_payload(b'x'*(size+1))

    def test_oversize_never_calls_provider(self):
        with self.assertRaisesRegex(ValueError,'payload_too_large'):
            transcribe(b'x'*MAX_REQUEST_BYTES,'account','secret',assemble,audio_seconds=10,
                       transport=lambda *a:self.fail('Network must not run'))

    def test_empty_is_allowed_only_with_explicit_segments(self):
        self.assertEqual(flatten_words({'success':True,'result':{'segments':[]}}),[])
        with self.assertRaises(ValueError):flatten_words({'success':False,'result':{'segments':[]}})

if __name__=='__main__':unittest.main()
