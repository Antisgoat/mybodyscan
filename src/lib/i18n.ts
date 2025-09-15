import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      // Navigation
      home: "Home",
      scan: "Scan",
      tracker: "Tracker", 
      coach: "Coach",
      history: "History",
      plans: "Plans",
      settings: "Settings",
      nutrition: "Nutrition",
      
      // Scan
      "scan.title": "Body Scan",
      "scan.upload4photos": "Upload exactly 4 photos (front, left, right, back)",
      "scan.processing": "Processing your scan...",
      "scan.results.bodyfat": "Body Fat %",
      "scan.results.weight": "Weight",
      "scan.results.bmi": "BMI",
      "scan.results.leanmass": "Lean Mass",
      "scan.results.musclemass": "Muscle Mass",
      "scan.results.bmr": "BMR",
      "scan.results.tee": "TEE",
      "scan.results.visceralfat": "Visceral Fat",
      
      // Plans
      "plans.title": "Plans",
      "plans.single": "Single Scan",
      "plans.extra": "Extra Scan", 
      "plans.monthly": "Monthly",
      "plans.annual": "Annual",
      "plans.bestvalue": "Best Value",
      "plans.savings": "Savings: Dietitian ~$300/mo; Trainer ~$240/mo; DEXA ~$150/scan",
      
      // Coach
      "coach.title": "AI Coach",
      "coach.onboarding": "Let's create your personalized plan",
      "coach.goal": "What's your goal?",
      "coach.goal.cut": "Cut (lose fat)",
      "coach.goal.recomp": "Recomp (build muscle, lose fat)",
      "coach.goal.gain": "Gain (build muscle)",
      
      // Nutrition
      "nutrition.title": "Nutrition",
      "nutrition.search": "Search food or scan barcode",
      "nutrition.targets": "Daily Targets",
      "nutrition.log": "Food Log",
      
      // Common
      cancel: "Cancel",
      save: "Save",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      "notmedicaladvice": "Not medical advice"
    }
  },
  zh: {
    translation: {
      home: "首页",
      scan: "扫描",
      tracker: "跟踪",
      coach: "教练",
      history: "历史",
      plans: "计划",
      settings: "设置",
      nutrition: "营养",
      "scan.title": "身体扫描",
      "plans.title": "计划",
      "coach.title": "AI教练",
      "nutrition.title": "营养",
      cancel: "取消",
      save: "保存",
      loading: "加载中...",
      error: "错误",
      success: "成功",
      "notmedicaladvice": "非医疗建议"
    }
  },
  hi: {
    translation: {
      home: "होम",
      scan: "स्कैन",
      tracker: "ट्रैकर",
      coach: "कोच",
      history: "इतिहास",
      plans: "प्लान",
      settings: "सेटिंग्स",
      nutrition: "पोषण",
      "scan.title": "बॉडी स्कैन",
      "plans.title": "प्लान",
      "coach.title": "AI कोच",
      "nutrition.title": "पोषण",
      cancel: "रद्द करें",
      save: "सेव करें",
      loading: "लोड हो रहा है...",
      error: "त्रुटि",
      success: "सफलता",
      "notmedicaladvice": "चिकित्सा सलाह नहीं"
    }
  },
  es: {
    translation: {
      home: "Inicio",
      scan: "Escanear",
      tracker: "Seguimiento",
      coach: "Entrenador",
      history: "Historial",
      plans: "Planes",
      settings: "Configuración",
      nutrition: "Nutrición",
      "scan.title": "Escaneo Corporal",
      "plans.title": "Planes",
      "coach.title": "Entrenador AI",
      "nutrition.title": "Nutrición",
      cancel: "Cancelar",
      save: "Guardar",
      loading: "Cargando...",
      error: "Error",
      success: "Éxito",
      "notmedicaladvice": "No es consejo médico"
    }
  },
  fr: {
    translation: {
      home: "Accueil",
      scan: "Scanner",  
      tracker: "Suivi",
      coach: "Coach",
      history: "Historique",
      plans: "Forfaits",
      settings: "Paramètres",
      nutrition: "Nutrition",
      "scan.title": "Scan Corporel",
      "plans.title": "Forfaits",
      "coach.title": "Coach IA",
      "nutrition.title": "Nutrition",
      cancel: "Annuler",
      save: "Sauvegarder",
      loading: "Chargement...",
      error: "Erreur",
      success: "Succès",
      "notmedicaladvice": "Pas un conseil médical"
    }
  },
  ar: {
    translation: {
      home: "الرئيسية",
      scan: "فحص",
      tracker: "متتبع",
      coach: "مدرب",
      history: "التاريخ",
      plans: "الخطط",
      settings: "الإعدادات",
      nutrition: "التغذية",
      "scan.title": "فحص الجسم",
      "plans.title": "الخطط",
      "coach.title": "مدرب ذكي",
      "nutrition.title": "التغذية",
      cancel: "إلغاء",
      save: "حفظ",
      loading: "جاري التحميل...",
      error: "خطأ",
      success: "نجح",
      "notmedicaladvice": "ليس نصيحة طبية"
    }
  },
  bn: {
    translation: {
      home: "হোম",
      scan: "স্ক্যান",
      tracker: "ট্র্যাকার",
      coach: "কোচ",
      history: "ইতিহাস",
      plans: "পরিকল্পনা",
      settings: "সেটিংস",
      nutrition: "পুষ্টি",
      "scan.title": "বডি স্ক্যান",
      "plans.title": "পরিকল্পনা",
      "coach.title": "AI কোচ",
      "nutrition.title": "পুষ্টি",
      cancel: "বাতিল",
      save: "সংরক্ষণ",
      loading: "লোড হচ্ছে...",
      error: "ত্রুটি",
      success: "সফল",
      "notmedicaladvice": "চিকিৎসা পরামর্শ নয়"
    }
  },
  pt: {
    translation: {
      home: "Início",
      scan: "Escanear",
      tracker: "Rastreador",
      coach: "Treinador",
      history: "Histórico",
      plans: "Planos",
      settings: "Configurações",
      nutrition: "Nutrição",
      "scan.title": "Escaneamento Corporal",
      "plans.title": "Planos",
      "coach.title": "Treinador IA",
      "nutrition.title": "Nutrição",
      cancel: "Cancelar",
      save: "Salvar",
      loading: "Carregando...",
      error: "Erro",
      success: "Sucesso",
      "notmedicaladvice": "Não é aconselhamento médico"
    }
  },
  ru: {
    translation: {
      home: "Главная",
      scan: "Сканировать",
      tracker: "Трекер",
      coach: "Тренер",
      history: "История",
      plans: "Планы",
      settings: "Настройки",
      nutrition: "Питание",
      "scan.title": "Сканирование тела",
      "plans.title": "Планы",
      "coach.title": "ИИ Тренер",
      "nutrition.title": "Питание",
      cancel: "Отмена",
      save: "Сохранить",
      loading: "Загрузка...",
      error: "Ошибка",
      success: "Успех",
      "notmedicaladvice": "Не медицинский совет"
    }
  },
  ur: {
    translation: {
      home: "ہوم",
      scan: "اسکین",
      tracker: "ٹریکر",
      coach: "کوچ",
      history: "تاریخ",
      plans: "منصوبے",
      settings: "سیٹنگز",
      nutrition: "غذائیت",
      "scan.title": "باڈی اسکین",
      "plans.title": "منصوبے",
      "coach.title": "AI کوچ",
      "nutrition.title": "غذائیت",
      cancel: "منسوخ",
      save: "محفوظ کریں",
      loading: "لوڈ ہو رہا ہے...",
      error: "خرابی",
      success: "کامیابی",
      "notmedicaladvice": "طبی مشورہ نہیں"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    detection: {
      order: ['navigator', 'localStorage', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;