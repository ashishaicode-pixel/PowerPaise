import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';
import { Badge } from '../components/ui/badge';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ThermometerSnowflake, 
  Clock, 
  Sun, 
  Droplets,
  Tv,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface Tip {
  icon: string;
  title: string;
  description: string;
  savings: number;
  priority: 'high' | 'medium' | 'low';
}

interface AITipsData {
  tips: Tip[];
  totalPotentialSavings: number;
  savingsPercentage: number;
  currentMonthlyBill: number;
}

interface TipCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  savings: string;
  priority: 'high' | 'medium' | 'low';
  delay: number;
}

function TipCard({ icon, title, description, savings, priority, delay }: TipCardProps) {
  const priorityColors = {
    high: 'from-green-500 to-emerald-600',
    medium: 'from-blue-500 to-cyan-600',
    low: 'from-gray-500 to-slate-600'
  };

  const priorityBadge = {
    high: { text: 'High Impact', color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700' },
    medium: { text: 'Medium Impact', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700' },
    low: { text: 'Low Impact', color: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600' }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow border border-gray-200 dark:border-slate-700"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`bg-gradient-to-br ${priorityColors[priority]} text-white rounded-xl p-3 shrink-0`}>
            {icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
                {title}
              </h3>
              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
              {description}
            </p>
            
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Badge className={priorityBadge[priority].color}>
                {priorityBadge[priority].text}
              </Badge>
              
              <div className="text-right">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  {savings}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">per month</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const iconMap: Record<string, React.ReactNode> = {
  'ThermometerSnowflake': <ThermometerSnowflake className="w-6 h-6" />,
  'AlertTriangle': <AlertTriangle className="w-6 h-6" />,
  'Droplets': <Droplets className="w-6 h-6" />,
  'Sun': <Sun className="w-6 h-6" />,
  'Tv': <Tv className="w-6 h-6" />,
  'Clock': <Clock className="w-6 h-6" />,
};

export function AITips() {
  const [tipsData, setTipsData] = useState<AITipsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTips = async () => {
      try {
        const res = await fetch(`${BASE_URL}/ai-tips`, { headers: HEADERS });
        if (res.ok) {
          const data = await res.json();
          setTipsData(data);
        }
      } catch (err) {
        console.log('Error fetching AI tips:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTips();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24 transition-colors duration-300">
      <Header />
      
      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* AI Coach Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-white/20 rounded-full p-3">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Your AI Saving Coach</h1>
              <p className="text-sm opacity-90">Personalized tips for your home</p>
            </div>
          </div>
          
          {loading ? (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mt-4 flex justify-center">
              <div className="animate-spin w-6 h-6 border-4 border-white/30 border-t-white rounded-full" />
            </div>
          ) : tipsData ? (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-90 mb-1">Potential Monthly Savings</div>
                  <div className="text-3xl font-bold">₹{tipsData.totalPotentialSavings.toLocaleString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-90 mb-1">If you act on all tips</div>
                  <div className="text-2xl font-bold">{tipsData.savingsPercentage}%</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mt-4 text-center text-sm opacity-90">
              Unable to load tips. Please ensure you have meter readings.
            </div>
          )}
        </motion.div>

        {/* Tips List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full" />
          </div>
        ) : tipsData ? (
          <div className="space-y-3">
            {tipsData.tips.map((tip, index) => (
              <TipCard
                key={index}
                icon={iconMap[tip.icon] || <Sparkles className="w-6 h-6" />}
                title={tip.title}
                description={tip.description}
                savings={`₹${(tip.savings || 0).toLocaleString('en-IN')}`}
                priority={tip.priority}
                delay={0.1 + index * 0.05}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-gray-400 text-sm">No tips yet. Add sensor readings first!</p>
          </div>
        )}

        {/* Bottom CTA */}
        {tipsData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-center"
          >
            <p className="text-sm text-blue-900 dark:text-blue-200">
              💡 <strong>Pro Tip:</strong> Start with high-impact tips for maximum savings!
            </p>
          </motion.div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}