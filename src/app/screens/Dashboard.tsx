import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';
import { BillMeter } from '../components/BillMeter';
import { ApplianceDonutChart } from '../components/ApplianceDonutChart';
import { LiveDataMonitor } from '../components/LiveDataMonitor';
import { Badge } from '../components/ui/badge';
import { AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface Stats {
  currentMonthBill: number;
  unitsUsed: number;
  avgDailyKwh: number;
  savedThisMonth: number;
  todayCost: number;
  kwhToday: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${BASE_URL}/stats`, { headers: HEADERS });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.log('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [refreshKey]);

  // Listen for appliance updates
  useEffect(() => {
    const handleUpdate = () => setRefreshKey(prev => prev + 1);
    window.addEventListener('appliances-updated', handleUpdate);
    return () => window.removeEventListener('appliances-updated', handleUpdate);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-20">
      <Header />
      
      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Hero Section - Bill Meter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6"
        >
          <div className="text-center mb-4">
            <h2 className="text-lg text-gray-700 dark:text-gray-200">Current Month's Bill</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">March 2026</p>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
            </div>
          ) : stats ? (
            <>
              <BillMeter amount={stats.currentMonthBill} units={stats.unitsUsed} />
              
              <div className="mt-6 flex justify-center">
                <Badge className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 px-4 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Approaching higher slab!
                </Badge>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400">Unable to load bill data</p>
          )}
        </motion.div>

        {/* Quick Stats */}
        {!loading && stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5" />
                <span className="text-sm opacity-90">This Month</span>
              </div>
              <div className="text-2xl font-bold">₹{stats.savedThisMonth}</div>
              <div className="text-xs opacity-90">saved vs last month</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5" />
                <span className="text-sm opacity-90">Avg Daily</span>
              </div>
              <div className="text-2xl font-bold">{stats.avgDailyKwh}</div>
              <div className="text-xs opacity-90">units per day</div>
            </div>
          </motion.div>
        )}

        {/* Live Data Monitor — Supabase stream */}
        <LiveDataMonitor />

        {/* Appliance Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Appliance Cost Breakdown
          </h3>
          <ApplianceDonutChart key={refreshKey} />
        </motion.div>

        {/* Peak Hour Alert */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-gradient-to-r from-orange-100 dark:from-orange-900/30 to-amber-100 dark:to-amber-900/30 border border-orange-300 dark:border-orange-700 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="bg-orange-500 text-white rounded-full p-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-orange-900 dark:text-orange-200">Peak Hour Alert</h4>
              <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                6-10 PM: Your lights consume more during these hours. 
                Consider using energy-efficient LED bulbs.
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}