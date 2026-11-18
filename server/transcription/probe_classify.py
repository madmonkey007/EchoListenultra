"""Classify extractor failures into stable transport codes.

Deliberately free of the yt_dlp import so the offline contract suite can pin
real production error strings (vercel logs corpus, 2026-11-18) to codes:

- image/photo posts:  DownloadError: ERROR: [Instagram] <id>: No video formats found!
- deleted/private:    DownloadError: ERROR: [Instagram] <id>: Instagram sent an empty media response...
- anonymous wall:     DownloadError: ERROR: [Instagram] <id>: Requested content is not available, rate-limit reached or login required...
- transient network:  DownloadError: ERROR: ... Unable to download webpage ... IncompleteRead...

Anything unmatched stays unclassified: the transport answers with the generic
retryable failure, which is the only case where "try again" is honest.
"""
import re

_NO_VIDEO = re.compile(r'no video formats found|requested format is not available', re.I)
_UNAVAILABLE = re.compile(r'empty media response|content is not available|login required|rate-limit reached|not available in your country|\bprivate\b|\b404\b|not found', re.I)


def classify_failure(text):
    """Return 'no_video' or 'private_or_unavailable', else None for transient
    or unknown failures."""
    text = str(text)
    if _NO_VIDEO.search(text):
        return 'no_video'
    if _UNAVAILABLE.search(text):
        return 'private_or_unavailable'
    return None
