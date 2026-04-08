import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Pencil, Trash2, Check, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { toast } from 'sonner';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-091ae39b`;
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

interface Appliance {
  id: string;
  name: string;
  percentage: number;
  color: string;
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F97316', // orange
];

export function ApplianceManager({ onClose, onUpdate }: { onClose: () => void; onUpdate: () => void }) {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', percentage: '', color: PRESET_COLORS[0] });

  useEffect(() => {
    fetchAppliances();
  }, []);

  const fetchAppliances = async () => {
    try {
      const res = await fetch(`${BASE_URL}/appliances?t=${Date.now()}`, { headers: HEADERS, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAppliances(data.appliances);
      }
    } catch (err) {
      console.log('Error fetching appliances:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const totalPercentage = appliances
      .filter(a => a.id !== editingId)
      .reduce((sum, a) => sum + a.percentage, 0) + parseFloat(formData.percentage);

    if (totalPercentage > 100) {
      toast.error('Total percentage cannot exceed 100%');
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Please enter an appliance name');
      return;
    }

    try {
      if (editingId) {
        // Update
        const res = await fetch(`${BASE_URL}/appliances/${editingId}`, {
          method: 'PUT',
          headers: HEADERS,
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          toast.success('Appliance updated successfully');
          await fetchAppliances();
          resetForm();
          onUpdate();
        } else {
          const error = await res.json();
          toast.error(error.error || 'Failed to update appliance');
        }
      } else {
        // Create
        const res = await fetch(`${BASE_URL}/appliances`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          toast.success('Appliance added successfully');
          await fetchAppliances();
          resetForm();
          onUpdate();
        } else {
          const error = await res.json();
          toast.error(error.error || 'Failed to add appliance');
        }
      }
    } catch (err) {
      console.log('Error saving appliance:', err);
      toast.error('Failed to save appliance');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this appliance?')) return;

    try {
      const res = await fetch(`${BASE_URL}/appliances/${id}`, {
        method: 'DELETE',
        headers: HEADERS,
      });
      if (res.ok) {
        toast.success('Appliance deleted successfully');
        await fetchAppliances();
        onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to delete appliance');
      }
    } catch (err) {
      console.log('Error deleting appliance:', err);
      toast.error('Failed to delete appliance');
    }
  };

  const handleEdit = (appliance: Appliance) => {
    setEditingId(appliance.id);
    setFormData({
      name: appliance.name,
      percentage: appliance.percentage.toString(),
      color: appliance.color,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ name: '', percentage: '', color: PRESET_COLORS[0] });
    setEditingId(null);
    setShowForm(false);
  };

  const handleResetAllData = async () => {
    if (!confirm('⚠️ WARNING: This will DELETE ALL your electricity readings and reset your bill to zero. This action cannot be undone. Continue?')) {
      return;
    }

    if (!confirm('Are you ABSOLUTELY sure? All data will be permanently deleted!')) {
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/readings/reset`, {
        method: 'DELETE',
        headers: HEADERS,
      });

      if (res.ok) {
        toast.success('All data reset to zero! Reloading...');
        
        // Refresh the page to show empty state
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to reset data');
      }
    } catch (err) {
      console.log('Error resetting data:', err);
      toast.error('Failed to reset data');
    }
  };

  const totalPercentage = appliances.reduce((sum, a) => sum + a.percentage, 0);
  const isValid = totalPercentage <= 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Manage Appliances</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Total Percentage Indicator */}
          <div className={`mb-4 p-4 rounded-xl border-2 ${
            isValid 
              ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700' 
              : 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Percentage</span>
              <span className={`text-2xl font-bold ${
                isValid ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
              }`}>
                {totalPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  isValid ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(totalPercentage, 100)}%` }}
              />
            </div>
            {!isValid && (
              <p className="text-xs text-red-700 dark:text-red-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Total must not exceed 100%
              </p>
            )}
          </div>

          {/* Appliances List */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full" />
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              <AnimatePresence>
                {appliances.map((appliance) => (
                  <motion.div
                    key={appliance.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: appliance.color }}
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{appliance.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{appliance.percentage}%</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(appliance)}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(appliance.id)}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm ? (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleSubmit}
              className="bg-blue-50 dark:bg-slate-800 p-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 space-y-3"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Appliance Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., AC, Refrigerator"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Percentage (%)
                </label>
                <input
                  type="number"
                  value={formData.percentage}
                  onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                  placeholder="0-100"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        formData.color === color
                          ? 'ring-4 ring-blue-500 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {formData.color === color && (
                        <Check className="w-5 h-5 text-white mx-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {editingId ? 'Update' : 'Add'} Appliance
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Add New Appliance
            </button>
          )}

          {/* Reset All Data Button */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleResetAllData}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <AlertCircle className="w-5 h-5" />
              Reset All Data (Start Fresh)
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
              This will delete all readings and reset bill to ₹0
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
