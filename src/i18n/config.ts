import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Initialize i18next with configuration
i18n
  .use(HttpBackend) // Load translations from public/locales
  .use(LanguageDetector) // Detect user language from browser/localStorage
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    // Supported languages
    supportedLngs: ['en', 'pt', 'sw'],

    // Fallback language when translation is missing
    fallbackLng: 'en',

    // Default namespace
    defaultNS: 'common',

    // Available namespaces (organized by feature)
    ns: [
      'common',      // Shared UI elements (buttons, badges, pagination)
      'navigation',  // Navbar links, page titles
      'auth',        // Login, authentication
      'validation',  // ValidationTable, filters, status updates
      'enumerators', // Dashboard, charts, metrics
      'admin',       // User management
      'guide',       // HowItWorks user guide
      'dataExplorer' // Data Academy catalog (interactive R lessons)
    ],

    // Interpolation settings
    interpolation: {
      escapeValue: false // React already escapes values
    },

    // Language detection order and caching
    detection: {
      // Check localStorage first, then browser language
      order: ['localStorage', 'navigator'],

      // Cache language preference in localStorage
      caches: ['localStorage'],

      // localStorage key for storing language
      lookupLocalStorage: 'i18n_language'
    },

    // Backend configuration for loading translations
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    },

    // Development mode settings
    debug: import.meta.env.DEV, // Enable debug logs in development

    // Missing translation handling
    saveMissing: import.meta.env.DEV, // Save missing keys in development
    missingKeyHandler: (lngs, ns, key) => {
      if (import.meta.env.DEV) {
        console.warn(`Missing translation: ${ns}:${key} for ${lngs.join(', ')}`);
      }
    },

    // Return empty string or key for missing translations
    returnEmptyString: false, // Return key instead of empty string
    returnNull: false
  });

export default i18n;
