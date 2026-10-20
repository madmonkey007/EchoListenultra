import { SlicingMethod } from '../types.ts';
import { fileImportError } from './import-limits.ts';
const DATABASE = 'EchoListenImportDraft';
const STORE = 'drafts';
const KEY = 'pending';
export const IMPORT_DRAFT_TTL = 60 * 60 * 1000;
interface StoredDraft { file: Blob; fileName: string; method: SlicingMethod; ruleValue: number; savedAt: number; }
export interface ImportDraft { file: File; method: SlicingMethod; ruleValue: number; }
export function validImportDraft(value: unknown, now = Date.now()): value is StoredDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as StoredDraft;
  const maximum = d.method === SlicingMethod.SENTENCE ? 3 : d.method === SlicingMethod.DURATION ? 30 : d.method === SlicingMethod.TURNS ? 50 : 0;
  return d.file instanceof Blob && !fileImportError(d.file.size) && typeof d.fileName === 'string' && d.fileName.length > 0 && d.fileName.length <= 255 && maximum > 0 && Number.isInteger(d.ruleValue) && d.ruleValue >= 1 && d.ruleValue <= maximum && Number.isFinite(d.savedAt) && d.savedAt <= now && now - d.savedAt <= IMPORT_DRAFT_TTL;
}
function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not access the saved import.'));
    request.onblocked = () => reject(new Error('Close other EchoListen tabs and try again.'));
  });
}
export async function saveImportDraft(draft: ImportDraft): Promise<void> {
  const value: StoredDraft = { ...draft, fileName: draft.file.name, savedAt: Date.now() };
  if (!validImportDraft(value)) throw new Error('This import cannot be saved. Choose a valid audio file and split settings.');
  const db = await openDraftDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not preserve your file. Check browser storage before signing in.')); };
  });
}
export async function clearImportDraft(): Promise<void> {
  const db = await openDraftDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not clear the saved import.')); };
  });
}
export async function restoreImportDraft(): Promise<ImportDraft | null> {
  const db = await openDraftDB();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const request = tx.objectStore(STORE).get(KEY);
    let result: unknown; request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not restore your import.')); };
  });
  if (!value) return null;
  if (!validImportDraft(value)) { await clearImportDraft(); return null; }
  return { file: new File([value.file], value.fileName, { type: value.file.type }), method: value.method, ruleValue: value.ruleValue };
}
