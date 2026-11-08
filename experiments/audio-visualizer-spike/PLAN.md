# Audio Visualizer Spike execution plan

Scope: standalone static browser project. No existing application files, authentication, billing, SEO, backend render service or production UI.

1. Audit the three requested upstream repositories at pinned SHAs, including implementation rather than README claims, licenses, maintenance and export constraints.
2. Attempt the primary upstream export path first. Preserve failures. Prefer its reusable renderer only if license and coupling permit. If true H.264/AAC MP4 fails, use native WebCodecs with Mediabunny muxing; consider Remotion only if that path blocks.
3. Implement a local audio decode/playback and Canvas Bars/Circular renderer with image cover and fixed portrait 720x1280 output. Offline FFT must use decoded PCM at deterministic frame timestamps rather than realtime playback timers.
4. Before implementing core logic, write tests for frequency sensitivity, silence, frame timing and 30-second clipping. Run them red, then green. Add real browser verification for codecs, uploaded WAV/MP3, image, playback and repeated export.
5. Generate an original 30-second musical fixture locally, with reproducible source and permission declaration. Export actual browser MP4 five times; preserve timings, memory caveats, errors and ffprobe results. Check audio content against the source and video response around timed accents.
6. Build static deployment output, document Vercel settings and limitations, licenses, browser/Android evidence, next-stage costs and unresolved risks. Never claim an unrun device/deployment check passed.

Architecture alternatives: upstream MediaRecorder is simplest but may be realtime/WebM-only; deterministic WebCodecs+Mediabunny provides controlled timestamps and MP4 tracks with codec capability checks; Remotion adds machinery/licensing to evaluate only if needed. User already specified autonomous execution and this fallback order, so proceed without an approval handoff.
