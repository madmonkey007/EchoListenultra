"""Offline public API contract checks; no upstream calls."""
import importlib.util
import io
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('public_reel_api',Path(__file__).resolve().parents[2]/'api/reel-transcribe.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)

class LimitResponses(unittest.TestCase):
    def response(self,status,value):
        h=api.handler.__new__(api.handler);h.wfile=io.BytesIO()
        h.send_response=lambda code:setattr(h,'code',code)
        h.send_header=lambda *a:None;h.end_headers=lambda:None
        h.reply(status,value)
        return h.code,json.loads(h.wfile.getvalue())
    def test_422_original_asr_duration(self):
        code,body=self.response(422,{'error':'ValueError: too_long: original','metrics':{'transcription_info':{'duration':181.26}}})
        self.assertEqual((code,body),(422,{'error':'too_long','limit_seconds':180,'duration_seconds':181.3}))
    def test_502_download_metadata_duration(self):
        code,body=self.response(502,{'error':'unknown_duration_or_over_limit_seconds','metrics':{'extraction':{'duration':194.24}}})
        self.assertEqual((code,body),(502,{'error':'too_long','limit_seconds':180,'duration_seconds':194.2}))
    def test_502_container_duration(self):
        code,body=self.response(502,{'error':'ValueError: too_long: full audio','metrics':{'extraction':{'container_duration_seconds':201.5}}})
        self.assertEqual(body['duration_seconds'],201.5)
    def test_unknown_duration_omitted(self):
        for value in (None,True,float('nan'),float('inf'),-1,'181'):
            code,body=self.response(422,{'error':'too_long:','metrics':{'transcription_info':{'duration':value}}})
            self.assertEqual(body,{'error':'too_long','limit_seconds':180})
    def test_success_preserves_cues_and_srt(self):
        value={'status':'transcribed','text':'Hi','srt':'1\n00:00:00,000 --> 00:00:01,000\nHi\n\n','cues':[{'start':0,'end':1,'text':'Hi'}]}
        code,body=self.response(200,value)
        self.assertEqual(code,200);self.assertEqual(body,{**value,'limit_seconds':180})
    def test_other_error_has_limit_without_user_content(self):
        for code,error in [(413,'payload_too_large:'),(502,'HTTP Error 403'),(502,'Invalid Reel URL')]:
            status,body=self.response(code,{'error':error})
            self.assertEqual(status,code);self.assertEqual(body['limit_seconds'],180);self.assertNotIn('duration_seconds',body)
    def test_known_unavailable_extractor_error_has_its_own_category(self):
        code,body=self.response(502,{'error':'DownloadError: Requested content is not available, rate-limit reached or login required'})
        self.assertEqual((code,body),(502,{'error':'private_or_unavailable','limit_seconds':180}))
    def test_early_transport_errors_also_have_limit(self):
        from unittest.mock import patch
        for headers,status,error in [({'Sec-Fetch-Site':'cross-site'},403,'origin_not_allowed'),({},503,'not_configured')]:
            h=api.handler.__new__(api.handler);h.headers=headers;h.wfile=io.BytesIO();h.send_response=lambda c:setattr(h,'code',c);h.send_header=lambda *a:None;h.end_headers=lambda:None
            with patch.dict(api.os.environ,{},clear=True):h.do_POST()
            self.assertEqual((h.code,json.loads(h.wfile.getvalue())),(status,{'error':error,'limit_seconds':180}))
if __name__=='__main__':unittest.main()
