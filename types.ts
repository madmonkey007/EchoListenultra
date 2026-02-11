
export enum PlayerMode {
  VINYL = 'VINYL',
  LYRICS = 'LYRICS',
  CONTEXT = 'CONTEXT'
}

export enum PlaybackMode {
  LIST_LOOP = 'LIST_LOOP',
  SINGLE_LOOP = 'SINGLE_LOOP',
  NATURAL = 'NATURAL'
}

export enum SlicingMethod {
  DURATION = 'DURATION',
  TURNS = 'TURNS',
  PARAGRAPH = 'PARAGRAPH'
}

export enum Modality {
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export enum Type {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

export interface AIProviderConfig {
  provider: 'gemini' | 'custom' | 'deepgram';
  geminiModel: string;
  customEndpoint: string;
  customApiKey: string;
  customModelId: string;
  deepgramApiKey: string;
  deepgramLanguage: string;
  theme: 'dark' | 'light';
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: number;
  words?: WordTiming[];
}

export interface AudioSession {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  audioUrl?: string;
  segments: AudioSegment[];
  duration: number;
  lastPlayed: string;
  status: 'ready' | 'processing' | 'error';
}

export interface SavedWord {
  word: string;
  sessionId: string;
  addedAt: number;
  nextReview: number;
  stage: number; // 0-7 based on Ebbinghaus intervals
  definition?: string;
  translation?: string;
  phonetic?: string;
  example?: string; // New: Ensure example sentence is saved
}

export interface WordDefinition {
  word: string;
  phonetic: string;
  definition: string;
  example: string;
  translation: string;
}

export interface UserStats {
  weeklyGoal: number;
  currentWeekly: number;
  vocabularyCount: number;
  vocabularyGrowth: number;
}