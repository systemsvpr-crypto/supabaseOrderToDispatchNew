import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FileText,
  Truck,
  PackageCheck,
  ClipboardCheck,
  TrendingUp,
  Clock,
  CheckCircle,
  BellRing,
  Activity,
  RefreshCw,
  Send,
  CheckCircle2,
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
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../supabaseClient";

// Register ChartJS components
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

// --- Helpers ---
const getVal = (obj, ...possibleKeys) => {
  if (!obj || typeof obj !== "object") return null;
  for (const key of possibleKeys) {
    if (typeof key === "number") {
      const vals = Object.values(obj);
      if (vals[key] !== undefined) return vals[key];
    } else if (obj[key] !== undefined) {
      return obj[key];
    }
  }
  return null;
};

const safeNumber = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

// --- Dashboard Data Logic (Supabase) ---
const Dashboard = () => {
  const { showToast } = useToast();

  // State for data and loading
  const [orders, setOrders] = useState([]);
  const [planningData, setPlanningData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch all dashboard data from Supabase
  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch data from Supabase in parallel
      const [ordersRes, plansRes] = await Promise.all([
        supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('dispatch_plans').select('*, order:app_orders(*)').order('created_at', { ascending: false })
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (plansRes.error) throw plansRes.error;

      const ordersRaw = ordersRes.data || [];
      const plansRaw = plansRes.data || [];

      // 2. Process data to emulate legacy structure for analytics compatibility
      
      // Map dispatch stats by order_id
      const orderStats = {};
      plansRaw.forEach(plan => {
          const oid = plan.order_id;
          if (!orderStats[oid]) {
              orderStats[oid] = { planned: 0, cancel: 0, delivered: 0 };
          }
          const pQty = parseFloat(plan.planned_qty) || 0;
          if (plan.status === 'Canceled') {
              orderStats[oid].cancel += pQty;
          } else {
              orderStats[oid].planned += pQty;
              if (plan.dispatch_completed) {
                  orderStats[oid].delivered += pQty;
              }
          }
      });

      // Transform app_orders
      const mappedOrders = ordersRaw.map(o => {
          const stats = orderStats[o.id] || { planned: 0, cancel: 0, delivered: 0 };
          return {
              ...o,
              orderDate: o.order_date,
              clientName: o.client_name,
              qty: parseFloat(o.qty) || 0,
              planningQty: stats.planned,
              cancelQty: stats.cancel,
              qtyDelivered: stats.delivered,
              planningPendingQty: Math.max(0, (parseFloat(o.qty) || 0) - stats.planned),
              // Stage 1 emulation: column Q (available) and R (done)
              columnQ: "Available",
              columnR: (stats.planned > 0 || stats.cancel > 0) ? "Done" : null
          };
      });

      // Transform dispatch_plans
      const mappedPlanning = plansRaw.map(p => ({
          ...p,
          orderNo: p.order?.order_number || '-',
          orderDate: p.order?.order_date,
          clientName: p.order?.client_name,
          godownName: p.godown_name,
          dispatchQty: parseFloat(p.planned_qty) || 0,
          // Stages 2-4 emulation based on record booleans
          columnK: p.informed_before_dispatch ? "Done" : null,
          columnL: p.informed_before_dispatch ? "Done" : null,
          columnO: p.dispatch_completed ? "Done" : null,
          columnP: p.dispatch_completed ? "Done" : null,
          columnT: p.informed_after_dispatch ? "Done" : null,
          columnU: p.informed_after_dispatch ? "Done" : null,
      }));

      // 3. Update state
      setOrders(mappedOrders);
      setPlanningData(mappedPlanning);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      showToast("Failed to load dashboard data", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  // Initial load on mount
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Refresh
  const handleRefresh = useCallback(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // State for stats and chart data
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
    fullyCompleted: 0,
  });
  const [allMonthlyMap, setAllMonthlyMap] = useState({
    months: [],
    clientData: new Map(),
  });
  const [godownLoad, setGodownLoad] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Process orders data when it changes
  useEffect(() => {
    if (!orders || !planningData) return;

    // 1. Core Sums
    const orderQtySum = orders.reduce((sum, item) => sum + item.qty, 0);
    const cancelQtySum = planningData.reduce((sum, item) => sum + (item.status === 'Canceled' ? item.dispatchQty : 0), 0);
    const deliveredQtySum = planningData.reduce((sum, item) => sum + (item.dispatch_completed && item.status !== 'Canceled' ? item.dispatchQty : 0), 0);
    const remainingQtySum = orders.reduce((sum, item) => sum + item.planningPendingQty, 0);

    // 2. Stage 1: Planning
    // Pending: Orders with remaining quantity
    // Done: Total created dispatch plans (excluding canceled)
    const pendingPlanning = orders.filter(o => o.planningPendingQty > 0).length;
    const completedPlanning = planningData.filter(p => p.status !== 'Canceled').length;

    // 3. Stage 2: Inform Pre-Dispatch
    const stage2Pending = planningData.filter(p => !p.informed_before_dispatch && p.status !== 'Canceled').length;
    const stage2Done = planningData.filter(p => p.informed_before_dispatch && p.status !== 'Canceled').length;

    // 4. Stage 3: Dispatch Completion
    const stage3Pending = planningData.filter(p => !p.dispatch_completed && p.status !== 'Canceled').length;
    const stage3Done = planningData.filter(p => p.dispatch_completed && p.status !== 'Canceled').length;

    // 5. Stage 4: Inform Post-Dispatch
    const stage4Pending = planningData.filter(p => !p.informed_after_dispatch && p.status !== 'Canceled').length;
    const stage4Done = planningData.filter(p => p.informed_after_dispatch && p.status !== 'Canceled').length;

    // 6. Build monthly trend data
    const monthlyMap = new Map();
    orders.forEach((order) => {
      const dateStr = order.orderDate;
      if (dateStr && dateStr !== "-") {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          const client = (order.clientName || "Unknown").trim();
          
          if (!monthlyMap.has(client)) monthlyMap.set(client, new Map());
          const clientMonthMap = monthlyMap.get(client);
          const data = clientMonthMap.get(monthKey) || {
            qty: 0,
            planningQty: 0,
            remainingQty: 0,
            deliveredQty: 0,
            cancelQty: 0,
            completedCount: 0,
          };

          data.qty += order.qty;
          data.planningQty += order.planningQty;
          data.remainingQty += order.planningPendingQty;
          data.deliveredQty += order.qtyDelivered;
          data.cancelQty += order.cancelQty;
          if (order.planningPendingQty <= 0) data.completedCount++;

          clientMonthMap.set(monthKey, data);
        }
      }
    });

    const allMonths = new Set();
    monthlyMap.forEach(mMap => mMap.forEach((_, k) => allMonths.add(k)));
    const sortedMonths = Array.from(allMonths).sort();

    setAllMonthlyMap({ months: sortedMonths, clientData: monthlyMap });
    setStats({
      orderQtySum,
      cancelQtySum,
      remainingQtySum,
      deliveredQtySum,
      pendingPlanning,
      completedPlanning,
      pendingNotification: stage2Pending,
      completedNotification: stage2Done,
      pendingCompletion: stage3Pending,
      completedCompletion: stage3Done,
      pendingPostNotify: stage4Pending,
      fullyCompleted: stage4Done,
    });

    // 7. Godown load calculation
    const godownMap = new Map();
    planningData.forEach((item) => {
      if (item.status !== 'Canceled' && item.dispatchQty > 0) {
        const godown = item.godownName || "Unassigned";
        godownMap.set(godown, (godownMap.get(godown) || 0) + item.dispatchQty);
      }
    });
    setGodownLoad(Array.from(godownMap.entries())
      .map(([godown, total]) => ({ godown, total }))
      .sort((a, b) => b.total - a.total));

  }, [orders, planningData]);

  // Build chart data
  const monthlyTrendData = useMemo(() => {
    const { months, clientData } = allMonthlyMap;
    if (months.length === 0) return { labels: [], datasets: [] };

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const displayLabels = months.map((m) => {
      const [y, mm] = m.split("-");
      return `${monthNames[parseInt(mm) - 1]} ${y}`;
    });

    const colors = [
      "rgba(88, 204, 2, 1)", // Primary Green
      "rgba(22, 163, 74, 1)", // Green
      "rgba(37, 99, 235, 1)", // Blue
      "rgba(147, 51, 234, 1)", // Purple
      "rgba(245, 158, 11, 1)", // Amber
      "rgba(107, 114, 128, 1)", // Gray (Others)
    ];

    const isSearching = searchTerm.trim().length > 0;
    let datasets = [];

    if (isSearching) {
      // Show top matches (up to 8)
      const matches = Array.from(clientData.entries())
        .filter(([name]) => name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
          const aTotal = Array.from(a[1].values()).reduce((sum, d) => sum + d.qty, 0);
          const bTotal = Array.from(b[1].values()).reduce((sum, d) => sum + d.qty, 0);
          return bTotal - aTotal;
        })
        .slice(0, 8);

      datasets = matches.map(([name, dataMap], idx) => ({
        label: name,
        data: months.map((m) => (dataMap.get(m) || { planningQty: 0 }).planningQty),
        extra: months.map((m) => dataMap.get(m) || {}),
        borderColor: colors[idx % 5],
        backgroundColor: colors[idx % 5].replace("1)", "0.1)"),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#fff",
        pointBorderWidth: 2,
      }));
    } else {
      // Top 5 + Others
      const sortedClients = Array.from(clientData.entries()).sort((a, b) => {
        const aTotal = Array.from(a[1].values()).reduce((sum, d) => sum + d.planningQty, 0);
        const bTotal = Array.from(b[1].values()).reduce((sum, d) => sum + d.planningQty, 0);
        return bTotal - aTotal;
      });

      const top5 = sortedClients.slice(0, 5);
      const remaining = sortedClients.slice(5);

      datasets = top5.map(([name, dataMap], idx) => ({
        label: name,
        data: months.map((m) => (dataMap.get(m) || { planningQty: 0 }).planningQty),
        extra: months.map((m) => dataMap.get(m) || {}),
        borderColor: colors[idx % 5],
        backgroundColor: colors[idx % 5].replace("1)", "0.1)"),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#fff",
        pointBorderWidth: 2,
      }));

      if (remaining.length > 0) {
        const othersData = months.map((m) => {
          let summary = {
            qty: 0,
            planningQty: 0,
            remainingQty: 0,
            deliveredQty: 0,
            cancelQty: 0,
            completedCount: 0,
          };
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
          data: othersData.map((d) => d.planningQty),
          extra: othersData,
          borderColor: colors[5],
          backgroundColor: colors[5].replace("1)", "0.1)"),
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          borderDash: [5, 5],
          pointHoverRadius: 4,
        });
      }
    }

    return { labels: displayLabels, datasets };
  }, [allMonthlyMap, searchTerm]);

  // --- Stat Card Component ---
  const StatCard = ({ title, value, icon: Icon, color, bgColor }) => (
    <div className="bg-white rounded border border-gray-100/50 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 group-hover:text-gray-500 transition-colors">
            {title}
          </p>
          <h3 className="text-2xl font-black text-[#58cc02] group-hover:scale-105 transition-transform origin-left">
            {value}
          </h3>
        </div>
        <div className={`p-3 rounded ${bgColor} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
    </div>
  );

  // --- Workflow Stage Card Component ---
  const WorkflowStageCard = ({ title, pending, completed, icon: Icon, color, bgColor, stage }) => {
    const total = completed + pending;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const colorClasses = {
      "text-blue-600": "from-blue-500 to-blue-400 shadow-blue-500/20",
      "text-primary": "from-[#58cc02] to-[#86efac] shadow-[#58cc02]/20",
      "text-orange-600": "from-orange-500 to-orange-400 shadow-orange-500/20",
      "text-red-600": "from-red-500 to-red-400 shadow-red-500/20",
    };
    const barColorClass = colorClasses[color] || "from-primary to-green-400 shadow-primary/20";

    return (
      <div className="bg-white rounded border border-gray-100/50 p-5 shadow-sm hover:shadow-lg hover:ring-1 hover:ring-primary/20 transition-all duration-300 group relative overflow-hidden">
        <div
          className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 ${bgColor} group-hover:opacity-10 transition-opacity`}
        />
        <div className="flex items-center gap-3 mb-6 relative">
          <div className={`p-2.5 rounded ${bgColor} group-hover:rotate-12 transition-transform shadow-sm`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm group-hover:text-primary transition-colors">
              {title}
            </h4>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
              Stage {stage}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50/80 p-3 rounded border border-gray-100/50 group-hover:bg-white transition-colors">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-orange-500" /> Pending
            </p>
            <span className="text-xl font-black text-orange-600 leading-none">{pending}</span>
          </div>
          <div className="bg-gray-50/80 p-3 rounded border border-gray-100/50 group-hover:bg-white transition-colors">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" /> Done
            </p>
            <span className="text-xl font-black text-green-600 leading-none">{completed}</span>
          </div>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Completion
              </span>
              <span className={`text-lg font-black leading-none ${color}`}>{percentage}%</span>
            </div>
            <div
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bgColor} ${color} uppercase tracking-tighter shadow-sm border border-current opacity-70`}
            >
              Efficiency
            </div>
          </div>

          <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner p-[2px]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barColorClass} transition-all duration-1000 ease-out shadow-lg relative`}
              style={{ width: `${percentage}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:24px_24px] opacity-20" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Dashboard Skeleton Component ---
  const DashboardSkeleton = () => (
    <div className="min-h-screen bg-[#F5F5F5] p-3 sm:p-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white/70 backdrop-blur-sm p-6 rounded shadow-sm border border-white/50">
        <div className="space-y-3">
          <div className="h-2 w-24 bg-gray-200 rounded relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
          </div>
          <div className="h-8 w-64 bg-gray-200 rounded relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
          </div>
          <div className="h-4 w-48 bg-gray-100 rounded relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
          </div>
        </div>
        <div className="h-10 w-40 bg-gray-200 rounded shrink-0 relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
        </div>
      </div>

      {/* Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded border border-gray-100/50 p-5 shadow-sm h-28 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
             <div className="h-3 w-20 bg-gray-100 rounded mb-4"></div>
             <div className="h-8 w-16 bg-gray-200 rounded"></div>
             <div className="absolute top-5 right-5 w-10 h-10 bg-primary/5 rounded"></div>
          </div>
        ))}
      </div>

      {/* Workflow Cards Skeleton */}
      <div className="space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded relative overflow-hidden px-2">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded border border-gray-100/50 p-5 shadow-sm h-56 relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
               <div className="flex gap-3 mb-6">
                 <div className="w-10 h-10 bg-primary/5 rounded"></div>
                 <div className="space-y-2 flex-1 pt-1">
                   <div className="h-4 w-full bg-gray-200 rounded"></div>
                   <div className="h-3 w-20 bg-gray-100 rounded"></div>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4 mb-6">
                 <div className="h-14 bg-gray-50/80 rounded"></div>
                 <div className="h-14 bg-gray-50/80 rounded"></div>
               </div>
               <div className="space-y-4">
                 <div className="h-4 w-12 bg-gray-200 rounded mb-1"></div>
                 <div className="h-2.5 w-full bg-gray-100 rounded-full"></div>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded border border-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-[400px] relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
           <div className="flex justify-between mb-6">
             <div className="h-5 w-56 bg-gray-200 rounded"></div>
             <div className="h-8 w-32 bg-gray-100 rounded"></div>
           </div>
           <div className="h-[300px] w-full bg-gray-50/30 rounded border border-gray-50"></div>
        </div>
        <div className="bg-white rounded border border-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-[400px] relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
           <div className="h-5 w-48 bg-gray-200 rounded mb-6"></div>
           <div className="space-y-4 pt-2 max-h-[300px] overflow-hidden">
             {[...Array(6)].map((_, i) => (
               <div key={i} className="flex gap-4 items-center">
                 <div className="h-3 w-20 bg-gray-200 rounded"></div>
                 <div className="h-8 flex-1 bg-gray-100 rounded"></div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );

  // --- Loading Overlay ---
  if (loading) {
    return <DashboardSkeleton />;
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="p-3 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white/70 backdrop-blur-sm p-6 rounded shadow-sm border border-white/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-primary rounded animate-pulse"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                Real-time Overview
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              System Dashboard
            </h1>
            <p className="text-sm text-gray-500 font-medium">
              Monitor your order to dispatch workflow pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Last Updated</span>
              <span className="text-xs font-bold text-gray-700">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="group flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-primary rounded hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 active:scale-95"
            >
              <RefreshCw
                className={`w-4 h-4 transition-transform duration-500 ${refreshing ? "animate-spin" : "group-hover:rotate-180"
                  }`}
              />
              {refreshing ? "Refreshing..." : "Refresh Analytics"}
            </button>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard
            title="Order Qty"
            value={stats.orderQtySum.toLocaleString()}
            icon={FileText}
            color="text-primary"
            bgColor="bg-green-50"
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
            color="text-primary"
            bgColor="bg-green-50"
          />
          <StatCard
            title="Delivered Qty"
            value={stats.deliveredQtySum.toLocaleString()}
            icon={TrendingUp}
            color="text-primary"
            bgColor="bg-green-50"
          />
        </div>

        {/* Workflow Pipeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              <Truck className="w-6 h-6 text-green-500" />
              Dispatch Pipeline
            </h2>
            <span className="hidden sm:block text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded border border-gray-200">
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
              color="text-primary"
              bgColor="bg-green-50"
            />
            <WorkflowStageCard
              stage="3"
              title="Dispatch Completed"
              pending={stats.pendingCompletion}
              completed={stats.completedCompletion}
              icon={PackageCheck}
              color="text-primary"
              bgColor="bg-green-50"
            />
            <WorkflowStageCard
              stage="4"
              title="Inform to Party After Dispatch"
              pending={stats.pendingPostNotify}
              completed={stats.fullyCompleted}
              icon={BellRing}
              color="text-primary"
              bgColor="bg-green-50"
            />
          </div>
        </div>

        {/* Chart Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Trend Chart */}
          <div className="lg:col-span-2 bg-white rounded border border-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Client Monthly Volume Trend
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-3 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary w-32 sm:w-48 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="h-[300px] w-full bg-gray-50/30 rounded p-2 border border-gray-50">
              {monthlyTrendData.labels.length > 0 ? (
                <Line
                  data={monthlyTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                      mode: "index",
                      intersect: false,
                    },
                    plugins: {
                      legend: {
                        position: "top",
                        labels: {
                          font: { size: 10, weight: "bold" },
                          usePointStyle: true,
                          padding: 15,
                        },
                      },
                      tooltip: {
                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                        titleColor: "#1f2937",
                        bodyColor: "#4b5563",
                        borderColor: "#e5e7eb",
                        borderWidth: 1,
                        padding: 10,
                        usePointStyle: true,
                        callbacks: {
                          label: (context) => {
                            const dataset = context.dataset;
                            const index = context.dataIndex;
                            const extra = dataset.extra ? dataset.extra[index] : null;
                            const label = dataset.label || "";

                            const lines = [`${label}: ${context.parsed.y.toLocaleString()} Planning Qty`];

                            if (extra) {
                              lines.push(`Order Qty: ${(extra.qty || 0).toLocaleString()}`);
                              lines.push(`Remaining Plan Qty: ${(extra.remainingQty || 0).toLocaleString()}`);
                              lines.push(`Delivered Qty: ${(extra.deliveredQty || 0).toLocaleString()}`);
                              lines.push(`Cancel Qty: ${(extra.cancelQty || 0).toLocaleString()}`);
                              lines.push(`Completed Orders: ${(extra.completedCount || 0).toLocaleString()}`);
                            }

                            return lines;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: "bold" } },
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: "#f3f4f6" },
                        ticks: { font: { size: 10, weight: "bold" } },
                      },
                    },
                  }}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Activity className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">
                    No Trend Data Available
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Godown Load */}
          <div className="bg-white rounded border border-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Godown Load (Dispatch Qty)
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {godownLoad.length > 0 ? (
                godownLoad.map((item) => {
                  const maxTotal = Math.max(...godownLoad.map((g) => g.total), 1);
                  const percent = (item.total / maxTotal) * 100;
                  return (
                    <div key={item.godown} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-600 w-24 truncate">
                        {item.godown}
                      </span>
                      <div className="flex-1 h-8 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-primary rounded flex items-center justify-end pr-2 text-[10px] font-bold text-white"
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
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                    No Active Load
                  </p>
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