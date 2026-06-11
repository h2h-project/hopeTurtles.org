import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '..', 'locales');

const rtlLanguages = new Set(['ar', 'he']);

let translationsCache = {};

export const loadLocales = () => {
  translationsCache = {};
  if (!fs.existsSync(localesDir)) return translationsCache;
  const files = fs.readdirSync(localesDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const localeCode = path.basename(file, '.json');
    try {
      const content = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
      translationsCache[localeCode] = content;
    } catch (error) {
      console.error(`Failed to load locale ${file}:`, error.message);
    }
  }
  return translationsCache;
};

loadLocales();

export const getAvailableLanguages = () => {
  const supported = config.appearance.supportedLangs;
  return supported.filter((code) => translationsCache[code]);
};

export const getTranslations = (lang) => {
  if (!translationsCache[lang]) {
    return translationsCache[config.appearance.defaultLang] || {};
  }
  return translationsCache[lang];
};

export const isRtl = (lang) => rtlLanguages.has(lang);

export const languageOptions = {
  en: 'English',
  ms: 'Bahasa Melayu',
  id: 'Bahasa Indonesia',
  he: 'עברית',
  ar: 'العربية',
  de: 'Deutsch',
  zh: '中文',
  tr: 'Türkçe'
};

export const getLanguageLabel = (lang) => languageOptions[lang] || lang;
