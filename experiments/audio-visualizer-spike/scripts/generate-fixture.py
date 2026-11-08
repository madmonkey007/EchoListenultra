#!/usr/bin/env python3
"""Generate original deterministic 30-second stereo test music; Python stdlib only."""
import math
from pathlib import Path
import struct
import wave

RATE = 48_000
SECONDS = 30
OUT = Path(__file__).resolve().parents[1] / "public" / "test-music.wav"


def note(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def generate():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # A deliberately simple original score, not adapted from an existing work.
    chords = [(48, 55, 60), (53, 60, 65), (45, 52, 57), (43, 50, 55)]
    melody = [72, 76, 79, 74, 77, 81, 69, 76, 72, 67, 74, 71]
    frames = bytearray()
    for i in range(RATE * SECONDS):
        t = i / RATE
        second = int(t)
        phase = t - second
        chord = chords[(second // 2) % len(chords)]
        # Drop to sparse texture each fourth second to give the spectrum clear changes.
        energy = [1.0, 0.65, 0.90, 0.32][second % 4]
        harmony = sum(math.sin(math.tau * note(n) * t) for n in chord) / 3
        eighth = int(t * 4)
        elapsed = t - eighth / 4
        lead = math.sin(math.tau * note(melody[eighth % len(melody)]) * t)
        lead *= math.exp(-elapsed * 10) * (1 - math.exp(-elapsed * 300))
        # Four kick attacks per second, and deterministic bright pseudo-noise hats.
        beat = t % 0.5
        kick = math.sin(math.tau * (45 * beat + 9 * (1 - math.exp(-beat * 25))))
        kick *= math.exp(-beat * 23)
        hat_phase = t % 0.25
        noise = (((i * 1103515245 + 12345) & 0x7FFFFFFF) / 0x3FFFFFFF) - 1
        hat = noise * math.exp(-hat_phase * 120)
        # Precisely known 1 kHz onset at every integer second (12 ms, 2 ms ramps).
        marker_env = max(0.0, min(phase / 0.002, (0.012 - phase) / 0.002, 1.0))
        marker = 0.38 * marker_env * math.sin(math.tau * 1000 * phase)
        # Shared marker and kick, gently panned lead for stereo/channel validation.
        pan = math.sin(t * 0.8) * 0.3
        common = energy * (0.15 * harmony + 0.21 * kick + 0.035 * hat) + marker
        fade = min(t / 0.005, (SECONDS - t) / 0.02, 1.0)
        left = (common + energy * 0.17 * lead * (1 - pan)) * fade
        right = (common + energy * 0.17 * lead * (1 + pan)) * fade
        frames.extend(struct.pack("<hh", *(round(max(-1, min(1, x)) * 32767) for x in (left, right))))
    with wave.open(str(OUT), "wb") as audio:
        audio.setparams((2, 2, RATE, RATE * SECONDS, "NONE", "not compressed"))
        audio.writeframes(frames)
    print(f"Generated {OUT}: {SECONDS}s, {RATE} Hz, stereo PCM16, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    generate()
