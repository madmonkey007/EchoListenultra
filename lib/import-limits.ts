export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const MAX_IMPORT_SECONDS = 2 * 60 * 60;
export function fileImportError(size: number): string {
  return !Number.isFinite(size) || size <= 0 ? 'Choose a non-empty audio file.' : size > MAX_IMPORT_BYTES ? 'Choose an audio file no larger than 100 MB.' : '';
}
export function durationImportError(seconds: number): string {
  return !Number.isFinite(seconds) || seconds <= 0 ? 'This audio duration could not be read. Try another audio file.' : seconds > MAX_IMPORT_SECONDS ? 'Choose audio no longer than 2 hours.' : '';
}
