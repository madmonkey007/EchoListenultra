# Original test fixtures

`test-music.wav`, `test-background.svg`, and the musical score and synthesis in
`../scripts/generate-fixture.py` were created specifically for this technical
spike. No samples, recordings, third-party melodies, fonts, or external images
are used. They are dedicated to the public domain under **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/

Reproduce the WAV with `python3 scripts/generate-fixture.py` from the project
directory. It is exactly 30 seconds, 48,000 Hz, two channels, signed 16-bit PCM.
The original score consists of synthesized chords, a short arpeggio, kick and
hi-hat sounds. Channel differences come from gentle lead panning.

For audio/video synchronization checks, a 1,000 Hz marker begins at **every
integer second from 0 through 29 seconds inclusive**. Each marker is 12 ms long,
with 2 ms attack/release ramps. The marker at t=0 also has the global 5 ms fade-in.
Kick attacks occur every 0.5 seconds and hi-hat/lead attacks every 0.25 seconds.
Overall musical energy follows the repeating one-second pattern 1.00, 0.65,
0.90, 0.32; chord changes occur every two seconds. These known changes permit
waveform correlation and checking that the visual spectrum varies over time.

An AAC output is lossy: compare decoded waveforms with allowance for codec
priming and padding, rather than requiring byte identity. The marker schedule
is a test reference, not a claim that a particular export has passed sync tests.

`test-music.mp3` and `test-background.png` are derived solely from these original CC0 sources and use the same CC0 dedication.
