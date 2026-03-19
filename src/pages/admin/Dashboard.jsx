import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Truck,
  PackageCheck,
  ClipboardCheck,
  TrendingUp,
  Clock,
  CheckCircle,
  BellRing,
  AlertCircle,
  Activity,
  RefreshCw,
  Loader2,
  Send,
  CheckCircle2,
  Calendar
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useToast } from '../../contexts/ToastContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

const CACHE_KEY = 'dashboardAnalyticsData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const getVal = (obj, ...possibleKeys) => {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of possibleKeys) {
        if (typeof key === 'number') {
            const vals = Object.values(obj);
            if (vals[key] !== undefined) return vals[key];
        } else if (obj[key] !== undefined) {
            return obj[key];
        }
    }
    return null;
};

const Dashboard = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState({
    orderQtySum: 0,
    cancelQtySum: 0,
    remainingQtySum: 0,
    deliveredQtySum: 0,
    pendingPlanning: 0,
    completedPlanning: 0,
    pendingNotification: 0,
    completedNotification: 0,
    pendingCompletion: 0,
    completedCompletion: 0,
    pendingPostNotify: 0,
    fullyCompleted: 0
  });

  // New state for timeline chart (Monthly trends)
  const [allMonthlyMap, setAllMonthlyMap] = useState({ months: [], clientData: new Map() });
  // New state for godown load (from Planning sheet)
  const [godownLoad, setGodownLoad] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Initial Load with Cache Support
  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { stats: cStats, trim: cTrend, godown: cGodown, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_DURATION) {
          setStats(cStats);
          // Deep deserialize: Convert nested entries arrays back to Maps
          setAllMonthlyMap({
            months: cTrend.months || [],
            clientData: new Map((cTrend.clientData || []).map(([client, monthEntries]) => [
              client,
              new Map(monthEntries)
            ]))
          });
          setGodownLoad(cGodown || []);
          setLoading(false);
          return; // Skip fetch if cache is fresh
        }
      } catch (e) {
        // Cache corrupted
      }
    }
    loadDashboardData();
  }, []);

  // Sync state changes to cache
  useEffect(() => {
    if (!loading && (stats.orderQtySum > 0 || allMonthlyMap.months.length > 0)) {
        // Deep serialize: Convert nested Maps to entries arrays for JSON serialization
        const serializedTrends = {
            months: allMonthlyMap.months,
            clientData: Array.from(allMonthlyMap.clientData.entries()).map(([client, monthMap]) => [
                client,
                Array.from(monthMap.entries())
            ])
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            stats,
            trim: serializedTrends,
            godown: godownLoad,
            timestamp: Date.now()
        }));
    }
  }, [stats, allMonthlyMap, godownLoad, loading]);

  const safeNumber = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  const countStage = (items, pendingCol, completedCol) => {
    let pending = 0;
    let completed = 0;
    items.forEach(item => {
      const pendingVal = (item[pendingCol] || '').toString().trim();
      const completedVal = (item[completedCol] || '').toString().trim();
      if (completedVal !== '') {
        completed++;
      } else if (pendingVal !== '') {
        pending++;
      }
    });
    return { pending, completed };
  };

  // Helper to extract date part (YYYY-MM-DD) from various date formats
  const extractDateKey = (dateStr) => {
    if (!dateStr || dateStr === '-') return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return null;
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // ===== 1. Fetch ORDER sheet data =====
      const orderUrl = new URL(API_URL);
      orderUrl.searchParams.set('sheet', 'ORDER');
      orderUrl.searchParams.set('mode', 'table');
      if (SHEET_ID) orderUrl.searchParams.set('sheetId', SHEET_ID);

      const orderRes = await fetch(orderUrl.toString());
      const orderResult = await orderRes.json();

      if (orderResult.success && Array.isArray(orderResult.data)) {
        const orders = orderResult.data.slice(5); // adjust slicing if needed

        // Sums for the four cards
        const orderQtySum = orders.reduce((sum, item) => sum + safeNumber(item.qty), 0);
        const cancelQtySum = orders.reduce((sum, item) => sum + safeNumber(item.cancelQty), 0);
        const remainingQtySum = orders.reduce((sum, item) => sum + safeNumber(item.planningPendingQty), 0);
        const deliveredQtySum = orders.reduce((sum, item) => sum + safeNumber(item.qtyDelivered), 0);

        // Stage 1 counts (columns Q & R)
        const stage1 = countStage(orders, 'columnQ', 'columnR');

        // Build monthly trends: Total quantity per client per month
        const monthlyMap = new Map();
        orders.forEach(order => {
          if (order.orderDate && order.orderDate !== "-") {
            const date = new Date(order.orderDate);
            if (!isNaN(date.getTime())) {
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              const client = (order.clientName || "Unknown").trim();
              const qty = safeNumber(order.qty);

              if (!monthlyMap.has(monthKey)) {
                monthlyMap.set(monthKey, new Map());
              }
              const clientMonthMap = monthlyMap.get(monthKey);
              const data = clientMonthMap.get(client) || { 
                  qty: 0, 
                  planningQty: 0, 
                  remainingQty: 0, 
                  deliveredQty: 0, 
                  cancelQty: 0, 
                  completedCount: 0 
              };
              
              data.qty += qty;
              data.planningQty += safeNumber(getVal(order, 'planningQty', 10));
              data.remainingQty += safeNumber(getVal(order, 'planningPendingQty', 11));
              data.deliveredQty += safeNumber(getVal(order, 'qtyDelivered', 12));
              data.cancelQty += safeNumber(getVal(order, 'cancelQty', 13));
              
              const status = String(getVal(order, 'dispatchStatus', 14) || '').toLowerCase();
              if (status.includes('complete')) {
                  data.completedCount++;
              }
              
              clientMonthMap.set(client, data);
            }
          }
        });

        // Get sorted months
        const sortedMonths = Array.from(monthlyMap.keys()).sort();
        
        // Store the master trend data
        setAllMonthlyMap({
            months: sortedMonths,
            clientData: monthlyMap
        });

        setStats(prev => ({
          ...prev,
          orderQtySum,
          cancelQtySum,
          remainingQtySum,
          deliveredQtySum,
          pendingPlanning: stage1.pending,
          completedPlanning: stage1.completed
        }));
      } else {
        showToast('Failed to load ORDER data', 'error');
      }

      // ===== 2. Fetch Planning sheet data =====
      const planningUrl = new URL(API_URL);
      planningUrl.searchParams.set('sheet', 'Planning');
      planningUrl.searchParams.set('mode', 'table');
      if (SHEET_ID) planningUrl.searchParams.set('sheetId', SHEET_ID);

      const planningRes = await fetch(planningUrl.toString());
      const planningResult = await planningRes.json();

      if (planningResult.success && Array.isArray(planningResult.data)) {
        const planningRows = planningResult.data.slice(3);

        // Stage counts (existing)
        const stage2 = countStage(planningRows, 'columnK', 'columnL');
        const stage3 = countStage(planningRows, 'columnO', 'columnP');
        const stage4 = countStage(planningRows, 'columnT', 'columnU');

        setStats(prev => ({
          ...prev,
          pendingNotification: stage2.pending,
          completedNotification: stage2.completed,
          pendingCompletion: stage3.pending,
          completedCompletion: stage3.completed,
          pendingPostNotify: stage4.pending,
          fullyCompleted: stage4.completed
        }));

        // ===== Compute Godown Load from Planning sheet =====
        const godownMap = new Map();
        planningRows.forEach(item => {
          const godown = item.godownName || 'Unassigned';
          const qty = safeNumber(item.dispatchQty); // using dispatch quantity as load
          if (qty > 0) {
            godownMap.set(godown, (godownMap.get(godown) || 0) + qty);
          }
        });

        // Convert to array and sort by load descending
        const godownArray = Array.from(godownMap.entries())
          .map(([godown, total]) => ({ godown, total }))
          .sort((a, b) => b.total - a.total);
        setGodownLoad(godownArray);
      } else {
        showToast('Failed to load Planning data', 'error');
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showToast('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reactive Chart Data Construction – Handles 1000s of clients professionally
  const monthlyTrendData = React.useMemo(() => {
    const { months, clientData } = allMonthlyMap;
    if (months.length === 0) return { labels: [], datasets: [] };

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const displayLabels = months.map(m => {
      const [y, mm] = m.split('-');
      return `${monthNames[parseInt(mm) - 1]} ${y}`;
    });

    const colors = [
      'rgba(153, 27, 27, 1)',   // Red
      'rgba(37, 99, 235, 1)',   // Blue
      'rgba(22, 163, 74, 1)',   // Green
      'rgba(147, 51, 234, 1)',  // Purple
      'rgba(245, 158, 11, 1)',  // Amber
      'rgba(107, 114, 128, 1)'  // Gray (for Others)
    ];

    let datasets = [];
    const isSearching = searchTerm.trim().length > 0;

    if (isSearching) {
      // Find all matching clients
      const matches = Array.from(clientData.entries())
        .filter(([name]) => name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => { // Sort by total volume within matches
            const aT = Array.from(a[1].values()).reduce((sum, d) => sum + d.qty, 0);
            const bT = Array.from(b[1].values()).reduce((sum, d) => sum + d.qty, 0);
            return bT - aT;
        })
        .slice(0, 8); // Performance cap: show top 8 matching results

      datasets = matches.map(([name, dataMap], idx) => ({
        label: name,
        data: months.map(m => (dataMap.get(m) || { qty: 0 }).qty),
        extra: months.map(m => dataMap.get(m) || { planningQty: 0, remainingQty: 0, deliveredQty: 0, cancelQty: 0, completedCount: 0 }),
        borderColor: colors[idx % 5],
        backgroundColor: colors[idx % 5].replace('1)', '0.1)'),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderWidth: 2,
      }));
    } else {
      // DEFAULT: Top 5 + Others aggregation
      const sortedClients = Array.from(clientData.entries())
        .sort((a, b) => {
          const aTotal = Array.from(a[1].values()).reduce((sum, d) => sum + d.qty, 0);
          const bTotal = Array.from(b[1].values()).reduce((sum, d) => sum + d.qty, 0);
          return bTotal - aTotal;
        });

      const top5 = sortedClients.slice(0, 5);
      const remaining = sortedClients.slice(5);

      datasets = top5.map(([name, dataMap], idx) => ({
        label: name,
        data: months.map(m => (dataMap.get(m) || { qty: 0 }).qty),
        extra: months.map(m => dataMap.get(m) || { planningQty: 0, remainingQty: 0, deliveredQty: 0, cancelQty: 0, completedCount: 0 }),
        borderColor: colors[idx % 5],
        backgroundColor: colors[idx % 5].replace('1)', '0.1)'),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderWidth: 2,
      }));

      if (remaining.length > 0) {
        // Aggregate all "Others" data points per month
        const othersData = months.map(m => {
          let summary = { qty: 0, planningQty: 0, remainingQty: 0, deliveredQty: 0, cancelQty: 0, completedCount: 0 };
          remaining.forEach(([_, dataMap]) => {
            const d = dataMap.get(m);
            if (d) {
              summary.qty += d.qty;
              summary.planningQty += d.planningQty;
              summary.remainingQty += d.remainingQty;
              summary.deliveredQty += d.deliveredQty;
              summary.cancelQty += d.cancelQty;
              summary.completedCount += d.completedCount;
            }
          });
          return summary;
        });

        datasets.push({
          label: `Others (${remaining.length} clients)`,
          data: othersData.map(d => d.qty),
          extra: othersData,
          borderColor: colors[5],
          backgroundColor: colors[5].replace('1)', '0.1)'),
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          borderDash: [5, 5], // Professional dashed style for 'Others'
          pointHoverRadius: 4,
        });
      }
    }

    return { labels: displayLabels, datasets };
  }, [allMonthlyMap, searchTerm]);

  const StatCard = ({ title, value, icon: Icon, color, bgColor }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-3xl font-black text-gray-900">{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${bgColor}`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
    </div>
  );

  const WorkflowStageCard = ({ title, pending, completed, icon: Icon, color, bgColor, stage }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:ring-1 hover:ring-gray-200 transition-all">
      <div className="flex items-center gap-3 mb-5">
        <div className={`p-2.5 rounded-xl ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-sm">{title}</h4>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Stage {stage}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
          <p className="text-[9px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-orange-500" /> Pending
          </p>
          <span className="text-xl font-black text-orange-600 leading-none">{pending}</span>
        </div>
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
          <p className="text-[9px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" /> Done
          </p>
          <span className="text-xl font-black text-green-600 leading-none">{completed}</span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-50">
        <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-2">
          <span className="uppercase tracking-widest">Efficiency</span>
          <span className={color}>{completed + pending > 0 ? Math.round((completed / (completed + pending)) * 100) : 0}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${color.replace('text', 'bg')}`}
            style={{ width: `${completed + pending > 0 ? (completed / (completed + pending)) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-[88vh] bg-transparent flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-red-800 animate-spin" />
            <Activity className="w-6 h-6 text-red-800 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-sm font-bold text-gray-600 uppercase tracking-widest animate-pulse">Synchronizing Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="p-3 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-red-800 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Real-time Overview</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">System Dashboard</h1>
            <p className="text-sm text-gray-500 font-medium">
              Monitor your order to dispatch workflow pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Last Updated</span>
              <span className="text-xs font-bold text-gray-700">{new Date().toLocaleTimeString()}</span>
            </div>
            <button
              onClick={() => {
                  sessionStorage.removeItem(CACHE_KEY);
                  loadDashboardData();
              }}
              className="group flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-800 rounded-xl hover:bg-red-900 transition-all shadow-lg shadow-red-800/20 active:scale-95"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              Refresh Analytics
            </button>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard
            title="Order Qty"
            value={stats.orderQtySum.toLocaleString()}
            icon={FileText}
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <StatCard
            title="Cancel qty"
            value={stats.cancelQtySum.toLocaleString()}
            icon={Activity}
            color="text-red-600"
            bgColor="bg-red-50"
          />
          <StatCard
            title="Remaining Qty"
            value={stats.remainingQtySum.toLocaleString()}
            icon={BellRing}
            color="text-purple-600"
            bgColor="bg-purple-50"
          />
          <StatCard
            title="Delivered Qty"
            value={stats.deliveredQtySum.toLocaleString()}
            icon={TrendingUp}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
          />
        </div>

        {/* Workflow Pipeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              <Truck className="w-6 h-6 text-red-800" />
              Dispatch Pipeline
            </h2>
            <span className="hidden sm:block text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
              5 Active Stages
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <WorkflowStageCard
              stage="1"
              title="Planning"
              pending={stats.pendingPlanning}
              completed={stats.completedPlanning}
              icon={ClipboardCheck}
              color="text-blue-600"
              bgColor="bg-blue-50"
            />
            <WorkflowStageCard
              stage="2"
              title="Inform to Party Before Dispatch"
              pending={stats.pendingNotification}
              completed={stats.completedNotification}
              icon={Send}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <WorkflowStageCard
              stage="3"
              title="Dispatch Completed"
              pending={stats.pendingCompletion}
              completed={stats.completedCompletion}
              icon={PackageCheck}
              color="text-green-600"
              bgColor="bg-green-50"
            />
            <WorkflowStageCard
              stage="4"
              title="Inform to Party After Dispatch"
              pending={stats.pendingPostNotify}
              completed={stats.fullyCompleted}
              icon={BellRing}
              color="text-amber-600"
              bgColor="bg-amber-50"
            />
          </div>
        </div>

        {/* Chart Section – Recent Workflow Activity + Godown Load */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity Timeline (from ORDER) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-red-800" />
                Client Monthly Volume Trend
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter date..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-3 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-red-800 w-32 sm:w-48 transition-all"
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">
                  Last 7 days
                </span>
              </div>
            </div>

            {/* Area Chart for monthly trends */}
            <div className="h-[300px] w-full bg-gray-50/30 rounded-xl p-2 border border-gray-50">
              {monthlyTrendData.labels.length > 0 ? (
                <Line
                  data={monthlyTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                      mode: 'index',
                      intersect: false,
                    },
                    plugins: {
                      legend: {
                        position: 'top',
                        labels: {
                          font: { size: 10, weight: 'bold' },
                          usePointStyle: true,
                          padding: 15
                        }
                      },
                      tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1f2937',
                        bodyColor: '#4b5563',
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        padding: 10,
                        usePointStyle: true,
                        callbacks: {
                          label: (context) => {
                            const dataset = context.dataset;
                            const index = context.dataIndex;
                            const extra = dataset.extra ? dataset.extra[index] : null;
                            const label = dataset.label || '';
                            
                            const lines = [`${label}: ${context.parsed.y.toLocaleString()} Total Qty`];
                            
                            if (extra) {
                                lines.push(`Planning Qty: ${extra.planningQty.toLocaleString()}`);
                                lines.push(`Remaining Plan Qty: ${extra.remainingQty.toLocaleString()}`);
                                lines.push(`Delivered Qty: ${extra.deliveredQty.toLocaleString()}`);
                                lines.push(`Order Cancel: ${extra.cancelQty.toLocaleString()}`);
                                lines.push(`Completed Dispatches: ${extra.completedCount}`);
                            }
                            
                            return lines;
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: 'bold' } }
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: '#f3f4f6' },
                        ticks: { font: { size: 10, weight: 'bold' } }
                      }
                    }
                  }}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Activity className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">No Trend Data Available</p>
                </div>
              )}
            </div>
          </div>

          {/* Godown Load (from Planning) – Bar Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2">
              <Truck className="w-5 h-5 text-red-800" />
              Godown Load (Dispatch Qty)
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {godownLoad.length > 0 ? (
                godownLoad.map((item) => {
                  const maxTotal = Math.max(...godownLoad.map(g => g.total), 1);
                  const percent = (item.total / maxTotal) * 100;
                  return (
                    <div key={item.godown} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-600 w-24 truncate">{item.godown}</span>
                      <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-red-800 rounded-lg flex items-center justify-end pr-2 text-[10px] font-bold text-white"
                          style={{ width: `${percent}%` }}
                        >
                          {item.total}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center">
                  <PackageCheck className="w-12 h-12 text-gray-100 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No Active Load</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;