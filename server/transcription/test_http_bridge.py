import importlib.util
import io
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[2]/'api/reel-transcribe.py'
spec=importlib.util.spec_from_file_location('reel_http_bridge',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class BridgeTests(unittest.TestCase):
    def test_response_is_complete_utf8_json_without_provider_or_secret_fields(self):
        instance=object.__new__(module.handler);instance.wfile=io.BytesIO();headers={};statuses=[]
        instance.send_response=statuses.append;instance.send_header=lambda k,v:headers.update({k:v});instance.end_headers=lambda:None
        instance.reply(200,{'status':'transcribed','text':'Bonjour.','srt':'raw srt','cues':[],'raw_cloudflare':{'private':'not for client'},'metrics':{'secret':'never expose'}})
        self.assertEqual(statuses,[200]);self.assertEqual(int(headers['Content-Length']),len(instance.wfile.getvalue()))
        self.assertNotIn(b'raw_cloudflare',instance.wfile.getvalue());self.assertNotIn(b'secret',instance.wfile.getvalue())
if __name__=='__main__':unittest.main()
