import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, MapPin, Zap, Bell, Shield, ChevronRight, Moon, Sun, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

interface Props { onClose: () => void; }

type Lang = 'en' | 'hi' | 'bn';
const LANGS: { code: Lang; name: string; label: string }[] = [
  { code: 'en', name: 'English', label: 'EN'  },
  { code: 'hi', name: 'हिंदी',  label: 'हि'  },
  { code: 'bn', name: 'বাংলা',  label: 'বাং' },
];

function Row({ icon, label, value, onClick }: {
  icon: React.ReactNode; label: string; value: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors ${
        onClick ? 'hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer' : 'cursor-default'
      } bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700`}
    >
      <span className="text-blue-500 dark:text-blue-400 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">{value}</p>
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
    </button>
  );
}

export function ProfileModal({ onClose }: Props) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [notifications, setNotifications] = useState(true);

  const handleNotifToggle = () => {
    setNotifications(v => !v);
    toast.success(notifications ? 'Notifications disabled' : 'Notifications enabled');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl overflow-hidden shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Profile & Settings</h2>
          <button onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-5" style={{ maxHeight: 'calc(90vh - 80px)' }}>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center shadow-lg">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">PowerPaise User</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Kalyani, West Bengal</p>
              <button onClick={() => toast.info('Edit profile — coming soon!')}
                className="text-xs text-blue-500 font-semibold mt-0.5 hover:text-blue-600">
                Edit Profile →
              </button>
            </div>
          </div>

          {/* Meter info */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
              Meter Details
            </p>
            <Row icon={<MapPin className="w-4 h-4" />} label="Location" value="Kalyani, West Bengal, India" />
            <Row icon={<Zap    className="w-4 h-4" />} label="Meter Type" value="Single Phase · WBSEDCL · ₹7.20/kWh" />
            <Row icon={<Zap    className="w-4 h-4" />} label="Sensor Interval" value="Every 120 seconds" />
          </div>

          {/* Appearance */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 mb-2">
              Appearance
            </p>
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              {(['light', 'dark'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { if (theme !== t) toggleTheme(); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                    theme === t
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {theme === t && <Check className="w-3.5 h-3.5 text-green-500" />}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 mb-2">
              Language
            </p>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map(({ code, name, label }) => (
                <button
                  key={code}
                  onClick={() => { setLanguage(code); toast.success(`Language: ${name}`); }}
                  className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                    language === code
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-300'
                  }`}
                >
                  <span className="text-lg font-bold mb-0.5">{label}</span>
                  <span className="text-[10px]">{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preferences */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 mb-2">
              Preferences
            </p>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {/* Notifications toggle */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Peak Hour Alerts</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Notify when usage spikes</p>
                  </div>
                </div>
                <button
                  onClick={handleNotifToggle}
                  className={`relative w-11 h-6 rounded-full transition-colors ${notifications ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${notifications ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {/* Privacy */}
              <button
                onClick={() => toast.info('Privacy settings — coming soon!')}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Privacy & Data</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* App info */}
          <div className="text-center space-y-1 pt-2">
            <p className="text-xs text-slate-400 dark:text-slate-500">PowerPaise v2.0 · Kalyani, WB</p>
            <p className="text-xs text-slate-300 dark:text-slate-600">WBSEDCL · Supabase Realtime · 9W LED optimised</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
