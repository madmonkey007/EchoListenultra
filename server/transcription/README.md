# Cloudflare transcription adapter

Model is fixed to `@cf/openai/whisper-large-v3-turbo`. Send a complete audio file
as base64 JSON with `vad_filter=true`; `language` is omitted for automatic detection. Credentials are supplied
at call time, never embedded in code or returned results.

`transcribe(audio_bytes, account_id, token, cue_builder, audio_seconds=verified_duration)` accepts the existing
`cue_postprocess.assemble` function as the cue builder. Audio longer than the shared configured limit (currently 180 seconds) or invalid duration is rejected before a request.
The caller must provide trustworthy measured duration; metadata is not decoded here.
It returns `model`, `status`,
`words` (`text/start/end`), and `cues`. Public `text` removes leading whitespace
only. The unchanged cue builder receives original provider word spacing and
word-level times so attached punctuation/numeric fragments remain intact.
Generate SRT from those same cues using `cue_postprocess.render_srt`.

Only `result.segments[].words[]` supplies timestamps. Missing/malformed word
arrays fail explicitly. Explicit empty segments permit an empty transcript.
No VTT consumption, segment-time fallback, interpolation, media conversion,
or automatic retries. Empty validated words return `status=no_speech_detected`. Confidence scores are not a validated hallucination classifier.
No HTTP service, frontend wiring, or deployment is added.
Language spans remain explicit caller metadata; no language detection is invented.

Offline checks:

    python3 -m unittest discover -s server/transcription -p test_turbo.py
    python3 -m unittest discover -s scripts/transcribe-probe -p test_cue_postprocess.py

## Two transport/result guards

Before base64 encoding or provider dispatch, make_payload rejects an entire JSON
request above 1,500,000 bytes, counting base64 expansion and the actual JSON
envelope. It neither truncates nor converts audio. This is a conservative
transport budget, not a duration-derived file-size promise.

After a successful provider response, validate_response_duration checks
result.transcription_info.duration against the shared configured duration cap before
cue generation. Missing/nonfinite/nonpositive values fail closed. Never use
duration_after_vad, the last word time, or caller estimates for this post-check.
The real-URL Preview calls these same helpers; original word times are untouched.
Errors: payload_too_large, too_long, invalid_duration. No VAD offset is applied.
