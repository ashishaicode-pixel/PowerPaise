import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { 
  TrendingDown, 
  Leaf, 
  Calendar,
  Share2,
  Download,
  BarChart3,
  Zap,
  DollarSign
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/server`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface MonthlyReportData {
  currentMonth: {
    units: number;
    cost: number;
  };
  savings: {
    units: number;
    money: number;
    carbon: number;
  };
  monthlyData: Array<{ month: string; units: number; cost: number }>;
  averages: {
    units: number;
    cost: number;
  };
  reduction: number;
}

export function MonthlyReport() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [reportData, setReportData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setChartWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`${BASE_URL}/monthly-report`, { headers: HEADERS });
        if (res.ok) {
          const data = await res.json();
          setReportData(data);
        }
      } catch (err) {
        console.log('Error fetching monthly report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  const chartHeight = chartWidth > 0 ? Math.round(chartWidth / 2) : 0;

  const handleShare = () => {
    if (reportData) {
      toast.success('Report ready to share on WhatsApp! 📱');
    }
  };

  const handleDownload = () => {
    toast.success('Report downloaded successfully! 📥');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24 transition-colors duration-300">
      <Header />
      
      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Report Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-6 h-6" />
            <h1 className="text-xl font-bold">Monthly Impact Report</h1>
          </div>
          <p className="text-sm opacity-90">March 2026 Summary</p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full" />
          </div>
        ) : reportData ? (
          <>
            {/* Key Metrics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                This Month's Achievement
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-green-100 dark:from-green-900/30 to-emerald-100 dark:to-emerald-900/30 rounded-xl p-4 border-2 border-green-400 dark:border-green-600">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-900 dark:text-green-200 font-medium">Saved</span>
                  </div>
                  <div className="text-3xl font-bold text-green-900 dark:text-green-100">₹{reportData.savings.money}</div>
                  <div className="text-xs text-green-700 dark:text-green-300 mt-1">vs last month</div>
                </div>

                <div className="bg-gradient-to-br from-blue-100 dark:from-blue-900/30 to-cyan-100 dark:to-cyan-900/30 rounded-xl p-4 border-2 border-blue-400 dark:border-blue-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">Reduced</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{reportData.savings.units}</div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">units saved</div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 dark:from-green-900/20 to-emerald-50 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500 text-white rounded-full p-3">
                      <Leaf className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-sm text-green-900 dark:text-green-200 font-medium">Carbon Impact</div>
                      <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{reportData.savings.carbon} kg CO₂</div>
                      <div className="text-xs text-green-700 dark:text-green-300">prevented this month</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl">🌱</div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-green-300 dark:border-green-700">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    <strong>Environmental Equivalent:</strong> Planting {Math.round(reportData.savings.carbon / 21)} trees or not driving {Math.round(reportData.savings.carbon * 4)} km
                  </p>
                </div>
              </div>
            </motion.div>

            {/* 6-Month Trend */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-green-600 dark:text-green-400" />
                  6-Month Trend
                </h2>
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700">
                  ↓ {Math.abs(reportData.reduction)}% {reportData.reduction > 0 ? 'reduction' : 'increase'}
                </Badge>
              </div>

              <div className="mb-4" ref={chartRef} style={{ minHeight: 160 }}>
                {chartWidth > 0 && (
                  <BarChart width={chartWidth} height={chartHeight} data={reportData.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-slate-700" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: '#9CA3AF' }}
                      stroke="#9CA3AF"
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#9CA3AF' }}
                      stroke="#9CA3AF"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      wrapperClassName="dark:[&_.recharts-tooltip-wrapper]:!bg-slate-800 dark:[&_.recharts-tooltip-wrapper]:!border-slate-700"
                    />
                    <Bar dataKey="units" fill="#3B82F6" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Avg Units</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{reportData.averages.units}</div>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Avg Cost</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">₹{reportData.averages.cost.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Best Month</div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">Mar</div>
                </div>
              </div>
            </motion.div>

            {/* Insights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                💡 Key Insights
              </h2>
              
              <div className="space-y-3">
                <div className="flex gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="text-2xl">✅</div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">Great Progress!</div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      You've saved ₹{reportData.savings.money} this month by optimizing your lighting usage.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="text-2xl">🎯</div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">Next Goal</div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      Switch to LED bulbs to save an additional ₹{Math.round(reportData.currentMonth.cost * 0.3)}/month.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="text-2xl">🏆</div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">Achievement Unlocked</div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      You're in the top 25% of savers in Kalyani this month!
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Share Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="grid grid-cols-2 gap-4"
            >
              <Button
                onClick={handleShare}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-base shadow-lg"
              >
                <Share2 className="w-5 h-5 mr-2" />
                Share on WhatsApp
              </Button>

              <Button
                onClick={handleDownload}
                variant="outline"
                className="border-2 border-gray-300 hover:bg-gray-100 h-14 text-base"
              >
                <Download className="w-5 h-5 mr-2" />
                Download PDF
              </Button>
            </motion.div>

            {/* Viral Message Preview */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-300 rounded-xl p-4"
            >
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-2">📱 Your WhatsApp message will say:</p>
                <div className="bg-white rounded-lg p-3 text-xs border border-amber-200">
                  "I saved ₹{reportData.savings.money} on my electricity bill this month using PowerPaise! 💡⚡
                  <br /><br />
                  I also prevented {reportData.savings.carbon} kg of CO₂ emissions. 🌱
                  <br /><br />
                  Join me in saving money and the planet! 💰🌍"
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500">Unable to load monthly report</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}