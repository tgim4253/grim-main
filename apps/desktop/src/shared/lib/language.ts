export type LanguageCode = 'en' | 'ko' | 'jp';

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'jp', label: '日本語' },
];

export function resolveLanguageCode(language?: string): LanguageCode {
  if (language?.startsWith('ko')) {
    return 'ko';
  }

  if (language?.startsWith('jp') || language?.startsWith('ja')) {
    return 'jp';
  }

  return 'en';
}
