import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('captions', Path(__file__).with_name('captions.py'))
captions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(captions)


class CaptionProbeTests(unittest.TestCase):
    def test_no_subtitles_is_na_with_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.CompletedProcess([], 0, json.dumps({'title': 'Talk', 'description': 'Description', 'subtitles': {}}), '')
            with patch.object(captions.subprocess, 'run', return_value=completed) as run:
                status = captions.probe({'id': 'abc', 'url': 'https://www.instagram.com/reel/abc/'}, Path(directory), Path('/venv/bin/python'))
            self.assertEqual(status['status'], 'N/A')
            self.assertEqual(status['metadata']['title'], 'Talk')
            command = run.call_args.args[0]
            self.assertIn('--skip-download', command)
            self.assertIn('--ignore-config', command)
            self.assertNotIn('--cookies', command)

    def test_timeout_keeps_stderr(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(captions.subprocess, 'run', side_effect=subprocess.TimeoutExpired([], 35, stderr=b'network stalled')):
                status = captions.probe({'id': 'abc', 'url': 'https://www.instagram.com/reel/abc/'}, Path(directory), Path('/venv/bin/python'))
            self.assertEqual(status['status'], 'N/A')
            self.assertIn('deadline', status['reason'])
            self.assertEqual((Path(directory) / 'abc/stderr.log').read_text(), 'network stalled')


if __name__ == '__main__':
    unittest.main()
