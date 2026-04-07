import { Header } from '../components/Header';
import { BottomNav } from '../components/BottomNav';
import { Badge } from '../components/ui/badge';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { 
  Flame, 
  Coins, 
  Award, 
  Trophy, 
  Medal,
  Sparkles,
  TrendingUp,
  Users
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/server`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface BadgeData {
  icon: string;
  name: string;
  description: string;
  earned: boolean;
  progress: number;
}

interface UserStats {
  streak: number;
  lifetimeSavings: number;
  badges: BadgeData[];
  earnedBadges: number;
  totalBadges: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  area: string;
  units: number;
  savings: number;
  isCurrentUser?: boolean;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  userRank: number;
  spotsToTop: number;
}

interface BadgeItemProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  earned: boolean;
  progress?: number;
  delay: number;
}

function BadgeItem({ icon, name, description, earned, progress, delay }: BadgeItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className={`relative rounded-xl p-4 ${ 
        earned 
          ? 'bg-gradient-to-br from-yellow-100 dark:from-yellow-900/30 to-amber-100 dark:to-amber-900/30 border-2 border-yellow-400 dark:border-yellow-600' 
          : 'bg-gray-100 dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-3 ${
          earned ? 'bg-gradient-to-br from-yellow-400 to-amber-500' : 'bg-gray-400 dark:bg-gray-600'
        } text-white`}>
          {icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold text-sm ${earned ? 'text-gray-900 dark:text-yellow-100' : 'text-gray-600 dark:text-gray-400'}`}>
            {name}
          </h4>
          <p className={`text-xs mt-1 ${earned ? 'text-gray-700 dark:text-yellow-200/80' : 'text-gray-500 dark:text-gray-500'}`}>
            {description}
          </p>
          
          {!earned && progress !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {earned && (
          <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1">
            <Award className="w-4 h-4" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface LeaderboardItemProps {
  rank: number;
  name: string;
  area: string;
  units: number;
  savings: number;
  isCurrentUser?: boolean;
}

function LeaderboardItem({ rank, name, area, units, savings, isCurrentUser }: LeaderboardItemProps) {
  const getRankIcon = () => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">#{rank}</span>;
  };

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl ${ 
      isCurrentUser 
        ? 'bg-gradient-to-r from-green-100 dark:from-green-900/30 to-emerald-100 dark:to-emerald-900/30 border-2 border-green-400 dark:border-green-600' 
        : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700'
    }`}>
      <div className="flex items-center justify-center w-10 h-10">
        {getRankIcon()}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{name}</h4>
          {isCurrentUser && (
            <Badge className="bg-green-600 text-white text-xs">You</Badge>
          )}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">{area}</p>
      </div>
      
      <div className="text-right">
        <div className="text-sm font-bold text-gray-900 dark:text-white">{units} Units</div>
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">₹{savings} saved</div>
      </div>
    </div>
  );
}

const iconMap: Record<string, React.ReactNode> = {
  'Sparkles': <Sparkles className="w-5 h-5" />,
  'Flame': <Flame className="w-5 h-5" />,
  'Award': <Award className="w-5 h-5" />,
  'TrendingUp': <TrendingUp className="w-5 h-5" />,
  'Users': <Users className="w-5 h-5" />,
  'Coins': <Coins className="w-5 h-5" />,
};

export function Community() {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, leaderboardRes] = await Promise.all([
          fetch(`${BASE_URL}/user-stats`, { headers: HEADERS }),
          fetch(`${BASE_URL}/leaderboard`, { headers: HEADERS }),
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          setUserStats(data);
        }

        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          setLeaderboard(data);
        }
      } catch (err) {
        console.log('Error fetching community data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24 transition-colors duration-300">
      <Header />
      
      <main className="max-w-md mx-auto p-4 space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full" />
          </div>
        ) : (
          <>
            {/* Stats Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-4 text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-6 h-6" />
                  <span className="text-sm opacity-90">Daily Streak</span>
                </div>
                <div className="text-3xl font-bold">{userStats?.streak || 0}</div>
                <div className="text-xs opacity-90">days in a row! 🔥</div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-6 h-6" />
                  <span className="text-sm opacity-90">Total Saved</span>
                </div>
                <div className="text-3xl font-bold">₹{userStats?.lifetimeSavings.toLocaleString('en-IN') || 0}</div>
                <div className="text-xs opacity-90">lifetime savings 💰</div>
              </div>
            </motion.div>

            {/* Badges Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Badges</h2>
                <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700">
                  {userStats?.earnedBadges || 0}/{userStats?.totalBadges || 0} Earned
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {userStats?.badges.map((badge, index) => (
                  <BadgeItem
                    key={index}
                    icon={iconMap[badge.icon] || <Award className="w-5 h-5" />}
                    name={badge.name}
                    description={badge.description}
                    earned={badge.earned}
                    progress={badge.progress}
                    delay={0.1 + index * 0.05}
                  />
                ))}
              </div>
            </motion.div>

            {/* Leaderboard */}
            {leaderboard && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Kalyani Leaderboard</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">This month's top savers</p>
                  </div>
                  <Trophy className="w-8 h-8 text-yellow-500" />
                </div>
                
                <div className="space-y-3">
                  {leaderboard.leaderboard.map((item) => (
                    <LeaderboardItem key={item.rank} {...item} />
                  ))}
                </div>
                
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-900 dark:text-blue-200">
                    💪 <strong>{leaderboard.spotsToTop} spots away</strong> from the top! Keep saving to climb up.
                  </p>
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}