import { useState, useEffect } from "react";
import { I18N_DICTIONARY, type TranslationKey } from "@/i18n/seed";
import { isFeatureEnabled } from "./featureFlags";

const translations = isFeatureEnabled("i18n")
  ? I18N_DICTIONARY
  : ({
      en: I18N_DICTIONARY.en,
    } as const);

type Language = keyof typeof translations;

export function useI18n() {
  const [language, setLanguage] = useState<Language>("en");

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  const changeLanguage = (newLanguage: Language) => {
    setLanguage(newLanguage);
    localStorage.setItem("mbs-language", newLanguage);
  };

  useEffect(() => {
    // Try saved language first
    const savedLanguage = localStorage.getItem("mbs-language") as Language;
    if (savedLanguage && translations[savedLanguage]) {
      setLanguage(savedLanguage);
      return;
    }

    // Auto-detect device language with English fallback
    const browserLanguage = navigator.language.split("-")[0] as Language;
    if (translations[browserLanguage]) {
      setLanguage(browserLanguage);
      localStorage.setItem("mbs-language", browserLanguage);
    } else {
      setLanguage("en"); // English fallback
    }
  }, []);

  return {
    t,
    language,
    changeLanguage,
    availableLanguages: Object.keys(translations) as Language[],
  };
}
