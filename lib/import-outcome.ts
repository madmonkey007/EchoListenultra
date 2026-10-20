// A missing transcript never silently changes the requested import method.
export function needsFallbackConsent(attemptedTranscription: boolean, method: string, accepted: boolean): boolean {
  return !accepted && (attemptedTranscription || method !== 'DURATION');
}
export function fallbackSeconds(method: string, value: number): number {
  return method === 'DURATION' ? value * 60 : 30;
}
export function transcriptionFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/\b(401|403)\b|unauthorized|permission.denied|invalid.api.key/i.test(message)) return 'The provider rejected your API key or access. Check the key and account permissions in Transcription settings.';
  if (/\b429\b|quota|rate.limit|resource.exhausted/i.test(message)) return 'Your provider quota or request limit was reached. Check your balance or wait before retrying.';
  if (/timed? ?out|timeout|abort/i.test(message)) return 'Transcription took too long. Try a shorter audio file, or retry when the provider is available.';
  if (/no usable|no speech|empty transcript|sentence.level|json|unexpected token/i.test(message)) return 'No usable speech transcript was returned. Try a clearer recording or another provider.';
  if (/fetch|network|connection|reach/i.test(message)) return 'The provider could not be reached. Check your connection and retry.';
  return 'The provider could not complete transcription. Retry or check your provider settings.';
}
