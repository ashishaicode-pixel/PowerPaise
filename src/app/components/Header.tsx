import { User, Languages, Moon, Sun, Settings } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ApplianceManager } from './ApplianceManager';
import { AnimatePresence } from 'motion/react';

export function Header() {
  const [language, setLanguage] = useState<'en' | 'hi' | 'bn'>('en');
  const [showApplianceManager, setShowApplianceManager] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const titles = {
    en: 'PowerPaise',
    hi: 'पावरपैसे',
    bn: 'পাওয়ারপয়সা'
  };

  const subtitles = {
    en: 'Bijli Bachao, Paise Kamao',
    hi: 'बिजली बचाओ, पैसे कमाओ',
    bn: 'বিদ্যুৎ সাশ্রয়, টাকা জমান'
  };

  const toggleLanguage = () => {
    const languages: ('en' | 'hi' | 'bn')[] = ['en', 'hi', 'bn'];
    const currentIndex = languages.indexOf(language);
    const nextIndex = (currentIndex + 1) % languages.length;
    setLanguage(languages[nextIndex]);
  };

  return (
    <>
      <header className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex-1">
            <h1 className="text-xl font-bold">{titles[language]}</h1>
            <p className="text-xs opacity-90">{subtitles[language]}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowApplianceManager(true)}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Manage appliances"
              title="Manage Appliances"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleLanguage}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Change language"
            >
              <Languages className="w-5 h-5" />
            </button>
            <button
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Profile"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showApplianceManager && (
          <ApplianceManager
            onClose={() => setShowApplianceManager(false)}
            onUpdate={() => {
              // Trigger a refresh of appliance data
              window.dispatchEvent(new CustomEvent('appliances-updated'));
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}