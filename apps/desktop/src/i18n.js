import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

const toI18nLanguage = language => {
  const normalizedLanguage = String(language || '').toLowerCase();

  if (normalizedLanguage.startsWith('ja') || normalizedLanguage.startsWith('jp')) {
    return 'jp';
  }

  if (normalizedLanguage.startsWith('ko')) {
    return 'ko';
  }

  return 'en';
};

const toDocumentLanguage = language => {
  const i18nLanguage = toI18nLanguage(language);

  if (i18nLanguage === 'jp') {
    return 'ja';
  }

  if (i18nLanguage === 'ko') {
    return 'ko';
  }

  return 'en';
};

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'ko',
    supportedLngs: ['en', 'ko', 'jp'],
    ns: ['common'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      convertDetectedLanguage: toI18nLanguage,
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

i18n.on('languageChanged', language => {
  document.documentElement.lang = toDocumentLanguage(language);
});

i18n.on('initialized', () => {
  document.documentElement.lang = toDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
});

export default i18n;
