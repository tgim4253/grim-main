export type LanguageCode = 'en' | 'ko' | 'jp';

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'jp', label: '日本語' },
];

export function resolveLanguageCode(language?: string): LanguageCode {
  const normalizedLanguage = language?.toLowerCase();

  if (normalizedLanguage?.startsWith('ko')) {
    return 'ko';
  }

  if (normalizedLanguage?.startsWith('jp') || normalizedLanguage?.startsWith('ja')) {
    return 'jp';
  }

  return 'en';
}
