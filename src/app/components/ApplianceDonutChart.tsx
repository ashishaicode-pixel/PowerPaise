import { useEffect, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Legend } from 'recharts';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface ApplianceData {
  name: string;
  value: number;
  color: string;
  cost: number;
}

export function ApplianceDonutChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [data, setData] = useState<ApplianceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchAppliances = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/appliances`, { headers: HEADERS });
      if (res.ok) {
        const { appliances } = await res.json();
        const chartData = appliances.map((app: any) => ({
          name: app.name,
          value: app.percentage,
          color: app.color,
          cost: app.cost,
        }));
        setData(chartData);
      }
    } catch (err) {
      console.log('Error fetching appliances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppliances();
  }, []);

  // Listen for appliance updates
  useEffect(() => {
    const handleUpdate = () => fetchAppliances();
    window.addEventListener('appliances-updated', handleUpdate);
    return () => window.removeEventListener('appliances-updated', handleUpdate);
  }, []);

  const height = width > 0 ? Math.round(width / 1.2) : 0;

  return (
    <div ref={containerRef} className="w-full" style={{ minHeight: 200 }}>
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
        </div>
      ) : data.length > 0 ? (
        <>
          {width > 0 && (
            <PieChart width={width} height={height}>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={Math.round(width * 0.17)}
                outerRadius={Math.round(width * 0.24)}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry: any) => (
                  <span className="text-sm text-gray-700">
                    {value}: {entry.payload.value}%
                  </span>
                )}
              />
            </PieChart>
          )}
          
          <div className="mt-4 space-y-2">
            {data.map((appliance, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: appliance.color }}></div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{appliance.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">₹{appliance.cost.toLocaleString('en-IN')}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{appliance.value}%</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No appliance data available</p>
      )}
    </div>
  );
}