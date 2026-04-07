import { Home, Lightbulb, Trophy, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';

export function BottomNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { t }     = useLanguage();

  const navItems = [
    { path: '/',          icon: Home,      label: t.navHome      },
    { path: '/ai-tips',   icon: Lightbulb, label: t.navTips      },
    { path: '/community', icon: Trophy,    label: t.navCommunity },
    { path: '/report',    icon: FileText,  label: t.navReport    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 z-40 transition-colors duration-300">
      <div className="flex justify-around items-center max-w-md mx-auto px-2 py-1.5">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all active:scale-90 ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon
                className={`w-6 h-6 transition-all ${isActive ? 'scale-110' : ''}`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'opacity-100' : 'opacity-75'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
