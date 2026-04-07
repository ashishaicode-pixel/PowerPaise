import { User, Languages, Moon, Sun, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ApplianceManager } from './ApplianceManager';
import { ProfileModal } from './ProfileModal';
import { AnimatePresence, motion } from 'motion/react';

export function Header() {
  const [showAppliances, setShowAppliances] = useState(false);
  const [showProfile,    setShowProfile]    = useState(false);
  const [liveTime,       setLiveTime]       = useState('');
  const { theme, toggleTheme }              = useTheme();
  const { language, setLanguage, t }        = useLanguage();

  // IST live clock
  useEffect(() => {
    const update = () =>
      setLiveTime(new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour12: true, hour: '2-digit', minute: '2-digit',
      }));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const cycleLanguage = () => {
    const langs: ('en' | 'hi' | 'bn')[] = ['en', 'hi', 'bn'];
    setLanguage(langs[(langs.indexOf(language) + 1) % 3]);
  };

  const langLabels: Record<string, string> = { en: 'EN', hi: 'हि', bn: 'বাং' };

  return (
    <>
      <header className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="flex items-center justify-between max-w-md mx-auto">

          {/* Brand */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight">{t.appTitle}</h1>
            <p className="text-xs opacity-90 truncate">
              {t.appSubtitle}
              {liveTime && <> · <span className="font-mono">{liveTime} IST</span></>}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">

            {/* Appliance Manager */}
            <HeaderBtn onClick={() => setShowAppliances(true)} label="Manage appliances">
              <Settings className="w-5 h-5" />
            </HeaderBtn>

            {/* Dark / Light toggle */}
            <HeaderBtn onClick={toggleTheme} label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ rotate: -45, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0,   opacity: 1, scale: 1   }}
                  exit={{   rotate:  45,  opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                >
                  {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </motion.span>
              </AnimatePresence>
            </HeaderBtn>

            {/* Language cycle — shows current lang code */}
            <button
              onClick={cycleLanguage}
              aria-label="Change language"
              title="Change language"
              className="p-2 hover:bg-white/20 rounded-full transition-colors active:scale-90 flex items-center justify-center font-bold text-xs min-w-[36px]"
            >
              {langLabels[language]}
            </button>

            {/* Profile */}
            <HeaderBtn onClick={() => setShowProfile(true)} label="Profile & Settings">
              <User className="w-5 h-5" />
            </HeaderBtn>
          </div>
        </div>
      </header>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAppliances && (
          <ApplianceManager
            onClose={() => setShowAppliances(false)}
            onUpdate={() => window.dispatchEvent(new CustomEvent('appliances-updated'))}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      </AnimatePresence>
    </>
  );
}

function HeaderBtn({ onClick, label, children }: {
  onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="p-2 hover:bg-white/20 rounded-full transition-colors active:scale-90 flex items-center justify-center"
    >
      {children}
    </button>
  );
}