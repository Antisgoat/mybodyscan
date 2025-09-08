import { useState, useEffect } from 'react';

// Minimal i18n dictionary for future expansion
const translations = {
  en: {
    // Auth
    'auth.welcome': 'Welcome back',
    'auth.create_account': 'Create your account',
    'auth.signin': 'Sign in',
    'auth.signup': 'Create account',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.forgot_password': 'Forgot password?',
    'auth.continue_apple': 'Continue with Apple',
    'auth.continue_google': 'Continue with Google',
    
    // Today
    'today.title': "Today's Plan",
    'today.workout': 'Workout',
    'today.meals': 'Meals',
    'today.tip': 'Coaching Tip',
    'today.scan': 'Scan',
    'today.log_meal': 'Log Meal',
    'today.log_workout': 'Log Workout',
    
    // Plans
    'plans.title': 'Choose Your Plan',
    'plans.subtitle': 'Get started with accurate body composition scanning',
    'plans.starter': 'Starter Scan',
    'plans.pro': 'Pro',
    'plans.elite': 'Elite',
    'plans.most_popular': 'Most Popular',
    'plans.subscribe': 'Subscribe',
    'plans.buy_now': 'Buy Now',
    
    // Settings
    'settings.title': 'Settings',
    'settings.notifications': 'Notifications',
    'settings.language': 'Language',
    'settings.legal': 'Legal & Account',
    'settings.delete_account': 'Delete my account & data',
    'settings.sign_out': 'Sign out',
    
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.next': 'Next',
    'common.back': 'Back',
    'common.finish': 'Finish',
  }
};

type TranslationKey = keyof typeof translations.en;
type Language = keyof typeof translations;

export function useI18n() {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  const changeLanguage = (newLanguage: Language) => {
    setLanguage(newLanguage);
    localStorage.setItem('mbs-language', newLanguage);
  };

  useEffect(() => {
    const savedLanguage = localStorage.getItem('mbs-language') as Language;
    if (savedLanguage && translations[savedLanguage]) {
      setLanguage(savedLanguage);
    }
  }, []);

  return {
    t,
    language,
    changeLanguage,
    availableLanguages: Object.keys(translations) as Language[],
  };
}