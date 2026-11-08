#!/bin/sh
set -eu
cd "$(dirname "$0")"
export HF_ENDPOINT=https://hf-mirror.com
export HF_HUB_DISABLE_XET=1
export HF_HUB_DOWNLOAD_TIMEOUT=60
exec .venv/bin/python probe.py "$@"
