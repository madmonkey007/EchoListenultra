import { max_audio_seconds } from './transcription-config.json';
export const MAX_AUDIO_SECONDS = max_audio_seconds;
export const limitMinutes = (seconds = MAX_AUDIO_SECONDS) => seconds / 60;
