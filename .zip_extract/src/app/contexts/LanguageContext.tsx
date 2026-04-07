import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'hi' | 'bn';

interface Translations {
  // Header
  appTitle: string;
  appSubtitle: string;
  
  // Bottom Nav
  navHome: string;
  navTips: string;
  navCommunity: string;
  navReport: string;
  
  // Dashboard
  currentMonthBill: string;
  units: string;
  savedThisMonth: string;
  todaysCost: string;
  averageDaily: string;
  kwhPerDay: string;
  monthProgress: string;
  daysIn: string;
  energyBreakdown: string;
  thisMonth: string;
  
  // AI Tips
  aiCoach: string;
  personalizedTips: string;
  potentialMonthlySavings: string;
  actOnAllTips: string;
  highImpact: string;
  mediumImpact: string;
  lowImpact: string;
  perMonth: string;
  proTip: string;
  startWithHighImpact: string;
  
  // Community
  dailyStreak: string;
  daysInRow: string;
  totalSaved: string;
  lifetimeSavings: string;
  yourBadges: string;
  earned: string;
  progress: string;
  leaderboard: string;
  topSavers: string;
  you: string;
  spotsAway: string;
  fromTop: string;
  keepSaving: string;
  
  // Monthly Report
  monthlyImpact: string;
  achievement: string;
  saved: string;
  vsLastMonth: string;
  reduced: string;
  unitsSaved: string;
  carbonImpact: string;
  prevented: string;
  environmentalEquivalent: string;
  planting: string;
  trees: string;
  notDriving: string;
  monthTrend: string;
  reduction: string;
  increase: string;
  avgUnits: string;
  avgCost: string;
  bestMonth: string;
  keyInsights: string;
  greatProgress: string;
  nextGoal: string;
  achievementUnlocked: string;
  
  // Appliance Manager
  manageAppliances: string;
  addAppliance: string;
  applianceName: string;
  percentage: string;
  selectColor: string;
  cancel: string;
  save: string;
  edit: string;
  delete: string;
  totalUsage: string;
  remaining: string;
  exceeds100: string;
  
  // Common
  loading: string;
  close: string;
}

const translations: Record<Language, Translations> = {
  en: {
    // Header
    appTitle: 'PowerPaise',
    appSubtitle: 'Save Energy, Earn Money',
    
    // Bottom Nav
    navHome: 'Home',
    navTips: 'AI Tips',
    navCommunity: 'Community',
    navReport: 'Report',
    
    // Dashboard
    currentMonthBill: 'Current Month\'s Bill',
    units: 'units',
    savedThisMonth: 'Saved This Month',
    todaysCost: 'Today\'s Cost',
    averageDaily: 'Average Daily',
    kwhPerDay: 'kWh/day',
    monthProgress: 'Month Progress',
    daysIn: 'days in',
    energyBreakdown: 'Energy Breakdown',
    thisMonth: 'this month',
    
    // AI Tips
    aiCoach: 'Your AI Saving Coach',
    personalizedTips: 'Personalized tips for your home',
    potentialMonthlySavings: 'Potential Monthly Savings',
    actOnAllTips: 'If you act on all tips',
    highImpact: 'High Impact',
    mediumImpact: 'Medium Impact',
    lowImpact: 'Low Impact',
    perMonth: 'per month',
    proTip: 'Pro Tip:',
    startWithHighImpact: 'Start with high-impact tips for maximum savings!',
    
    // Community
    dailyStreak: 'Daily Streak',
    daysInRow: 'days in a row! 🔥',
    totalSaved: 'Total Saved',
    lifetimeSavings: 'lifetime savings 💰',
    yourBadges: 'Your Badges',
    earned: 'Earned',
    progress: 'Progress',
    leaderboard: 'Kalyani Leaderboard',
    topSavers: 'This month\'s top savers',
    you: 'You',
    spotsAway: 'spots away',
    fromTop: 'from the top! Keep saving to climb up.',
    keepSaving: 'Keep saving to climb up.',
    
    // Monthly Report
    monthlyImpact: 'Monthly Impact Report',
    achievement: 'This Month\'s Achievement',
    saved: 'Saved',
    vsLastMonth: 'vs last month',
    reduced: 'Reduced',
    unitsSaved: 'units saved',
    carbonImpact: 'Carbon Impact',
    prevented: 'prevented this month',
    environmentalEquivalent: 'Environmental Equivalent:',
    planting: 'Planting',
    trees: 'trees or not driving',
    notDriving: 'km',
    monthTrend: '6-Month Trend',
    reduction: 'reduction',
    increase: 'increase',
    avgUnits: 'Avg Units',
    avgCost: 'Avg Cost',
    bestMonth: 'Best Month',
    keyInsights: 'Key Insights',
    greatProgress: 'Great Progress!',
    nextGoal: 'Next Goal',
    achievementUnlocked: 'Achievement Unlocked',
    
    // Appliance Manager
    manageAppliances: 'Manage Appliances',
    addAppliance: 'Add Appliance',
    applianceName: 'Appliance Name',
    percentage: 'Percentage',
    selectColor: 'Select Color',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    totalUsage: 'Total Usage',
    remaining: 'remaining',
    exceeds100: 'Total exceeds 100%',
    
    // Common
    loading: 'Loading...',
    close: 'Close',
  },
  hi: {
    // Header
    appTitle: 'पावरपैसे',
    appSubtitle: 'बिजली बचाओ, पैसे कमाओ',
    
    // Bottom Nav
    navHome: 'होम',
    navTips: 'एआई टिप्स',
    navCommunity: 'समुदाय',
    navReport: 'रिपोर्ट',
    
    // Dashboard
    currentMonthBill: 'इस महीने का बिल',
    units: 'यूनिट',
    savedThisMonth: 'इस महीने बचत',
    todaysCost: 'आज की लागत',
    averageDaily: 'औसत दैनिक',
    kwhPerDay: 'kWh/दिन',
    monthProgress: 'महीने की प्रगति',
    daysIn: 'दिन में',
    energyBreakdown: 'ऊर्जा विवरण',
    thisMonth: 'इस महीने',
    
    // AI Tips
    aiCoach: 'आपका एआई बचत कोच',
    personalizedTips: 'आपके घर के लिए व्यक्तिगत सुझाव',
    potentialMonthlySavings: 'संभावित मासिक बचत',
    actOnAllTips: 'यदि आप सभी सुझावों पर अमल करें',
    highImpact: 'उच्च प्रभाव',
    mediumImpact: 'मध्यम प्रभाव',
    lowImpact: 'कम प्रभाव',
    perMonth: 'प्रति माह',
    proTip: 'प्रो टिप:',
    startWithHighImpact: 'अधिकतम बचत के लिए उच्च प्रभाव वाले सुझावों से शुरू करें!',
    
    // Community
    dailyStreak: 'दैनिक स्ट्रीक',
    daysInRow: 'दिन लगातार! 🔥',
    totalSaved: 'कुल बचत',
    lifetimeSavings: 'जीवन भर की बचत 💰',
    yourBadges: 'आपके बैज',
    earned: 'अर्जित',
    progress: 'प्रगति',
    leaderboard: 'कल्याणी लीडरबोर्ड',
    topSavers: 'इस महीने के शीर्ष बचतकर्ता',
    you: 'आप',
    spotsAway: 'स्थान दूर',
    fromTop: 'शीर्ष से! ऊपर चढ़ने के लिए बचत जारी रखें।',
    keepSaving: 'ऊपर चढ़ने के लिए बचत जारी रखें।',
    
    // Monthly Report
    monthlyImpact: 'मासिक प्रभाव रिपोर्ट',
    achievement: 'इस महीने की उपलब्धि',
    saved: 'बचत',
    vsLastMonth: 'पिछले महीने की तुलना में',
    reduced: 'कम किया',
    unitsSaved: 'यूनिट बचाई',
    carbonImpact: 'कार्बन प्रभाव',
    prevented: 'इस महीने रोका गया',
    environmentalEquivalent: 'पर्यावरणीय समतुल्य:',
    planting: 'रोपण',
    trees: 'पेड़ या ड्राइविंग नहीं',
    notDriving: 'किमी',
    monthTrend: '6 महीने का रुझान',
    reduction: 'कमी',
    increase: 'वृद्धि',
    avgUnits: 'औसत यूनिट',
    avgCost: 'औसत लागत',
    bestMonth: 'सर्वश्रेष्ठ महीना',
    keyInsights: 'मुख्य अंतर्दृष्टि',
    greatProgress: 'बढ़िया प्रगति!',
    nextGoal: 'अगला लक्ष्य',
    achievementUnlocked: 'उपलब्धि अनलॉक',
    
    // Appliance Manager
    manageAppliances: 'उपकरण प्रबंधित करें',
    addAppliance: 'उपकरण जोड़ें',
    applianceName: 'उपकरण का नाम',
    percentage: 'प्रतिशत',
    selectColor: 'रंग चुनें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    edit: 'संपादित करें',
    delete: 'हटाएं',
    totalUsage: 'कुल उपयोग',
    remaining: 'शेष',
    exceeds100: 'कुल 100% से अधिक',
    
    // Common
    loading: 'लोड हो रहा है...',
    close: 'बंद करें',
  },
  bn: {
    // Header
    appTitle: 'পাওয়ারপয়সা',
    appSubtitle: 'বিদ্যুৎ সাশ্রয়, টাকা জমান',
    
    // Bottom Nav
    navHome: 'হোম',
    navTips: 'এআই টিপস',
    navCommunity: 'কমিউনিটি',
    navReport: 'রিপোর্ট',
    
    // Dashboard
    currentMonthBill: 'চলতি মাসের বিল',
    units: 'ইউনিট',
    savedThisMonth: 'এই মাসে সঞ্চয়',
    todaysCost: 'আজকের খরচ',
    averageDaily: 'গড় দৈনিক',
    kwhPerDay: 'kWh/দিন',
    monthProgress: 'মাসের অগ্রগতি',
    daysIn: 'দিন',
    energyBreakdown: 'শক্তি বিভাজন',
    thisMonth: 'এই মাসে',
    
    // AI Tips
    aiCoach: 'আপনার এআই সঞ্চয় কোচ',
    personalizedTips: 'আপনার বাড়ির জন্য ব্যক্তিগত পরামর্শ',
    potentialMonthlySavings: 'সম্ভাব্য মাসিক সঞ্চয়',
    actOnAllTips: 'যদি আপনি সব টিপস অনুসরণ করেন',
    highImpact: 'উচ্চ প্রভাব',
    mediumImpact: 'মাঝারি প্রভাব',
    lowImpact: 'কম প্রভাব',
    perMonth: 'প্রতি মাসে',
    proTip: 'প্রো টিপ:',
    startWithHighImpact: 'সর্বাধিক সঞ্চয়ের জন্য উচ্চ-প্রভাব টিপস দিয়ে শুরু করুন!',
    
    // Community
    dailyStreak: 'দৈনিক ধারা',
    daysInRow: 'দিন একটানা! 🔥',
    totalSaved: 'মোট সঞ্চয়',
    lifetimeSavings: 'আজীবন সঞ্চয় 💰',
    yourBadges: 'আপনার ব্যাজ',
    earned: 'অর্জিত',
    progress: 'অগ্রগতি',
    leaderboard: 'কল্যাণী লিডারবোর্ড',
    topSavers: 'এই মাসের শীর্ষ সঞ্চয়কারী',
    you: 'আপনি',
    spotsAway: 'স্থান দূরে',
    fromTop: 'শীর্ষ থেকে! উপরে উঠতে সঞ্চয় চালিয়ে যান।',
    keepSaving: 'উপরে উঠতে সঞ্চয় চালিয়ে যান।',
    
    // Monthly Report
    monthlyImpact: 'মাসিক প্রভাব রিপোর্ট',
    achievement: 'এই মাসের অর্জন',
    saved: 'সঞ্চয়',
    vsLastMonth: 'গত মাসের তুলনায়',
    reduced: 'হ্রাস',
    unitsSaved: 'ইউনিট সঞ্চয়',
    carbonImpact: 'কার্বন প্রভাব',
    prevented: 'এই মাসে প্রতিরোধ',
    environmentalEquivalent: 'পরিবেশগত সমতুল্য:',
    planting: 'রোপণ',
    trees: 'গাছ বা ড্রাইভিং না',
    notDriving: 'কিমি',
    monthTrend: '৬ মাসের প্রবণতা',
    reduction: 'হ্রাস',
    increase: 'বৃদ্ধি',
    avgUnits: 'গড় ইউনিট',
    avgCost: 'গড় খরচ',
    bestMonth: 'সেরা মাস',
    keyInsights: 'মূল অন্তর্দৃষ্টি',
    greatProgress: 'দুর্দান্ত অগ্রগতি!',
    nextGoal: 'পরবর্তী লক্ষ্য',
    achievementUnlocked: 'অর্জন আনলক',
    
    // Appliance Manager
    manageAppliances: 'যন্ত্রপাতি পরিচালনা',
    addAppliance: 'যন্ত্রপাতি যোগ করুন',
    applianceName: 'যন্ত্রপাতির নাম',
    percentage: 'শতাংশ',
    selectColor: 'রঙ নির্বাচন করুন',
    cancel: 'বাতিল',
    save: 'সংরক্ষণ',
    edit: 'সম্পাদনা',
    delete: 'মুছুন',
    totalUsage: 'মোট ব্যবহার',
    remaining: 'অবশিষ্ট',
    exceeds100: 'মোট 100% অতিক্রম করে',
    
    // Common
    loading: 'লোড হচ্ছে...',
    close: 'বন্ধ করুন',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
