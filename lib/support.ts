export const SUPPORT_EMAIL = 'dihou008@gmail.com';
export const APP_VERSION = '0.1.0';
export const FEEDBACK_CATEGORIES = { bug: 'Something is not working', transcription: 'Transcription or subtitles', question: 'A question', idea: 'An idea' } as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;

export function feedbackCategory(value: string | null | undefined): FeedbackCategory {
  return value && Object.prototype.hasOwnProperty.call(FEEDBACK_CATEGORIES, value) ? value as FeedbackCategory : 'question';
}

function browserFamily(userAgent = ''): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Other browser';
}

export function buildSupportDraft(input: { category?: string; message: string; replyEmail?: string; includeDiagnostics?: boolean; userAgent?: string }) {
  const category = feedbackCategory(input.category);
  const titles = { bug: 'Bug report', transcription: 'Transcription or subtitles', question: 'Question', idea: 'Idea' };
  const subject = `EchoListen feedback — ${titles[category]}`;
  const lines = [`Category: ${FEEDBACK_CATEGORIES[category]}`, '', input.message.trim()];
  if (input.replyEmail?.trim()) lines.push('', `Reply email: ${input.replyEmail.trim()}`);
  if (input.includeDiagnostics) lines.push('', `Version: ${APP_VERSION}`, `Browser: ${browserFamily(input.userAgent)}`);
  const body = lines.join('\n');
  return { body, subject, mailto: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
