import React, { useState, useEffect } from "react";
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
import { useToast } from '../../contexts/ToastContext';
import { seedDummyData } from '../../utils/seedData';

const Dashboard = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingPlanning: 0,
    pendingNotification: 0,
    pendingCompletion: 0,
    pendingPostNotify: 0,
    fullyCompleted: 0
  });

  const [loading, setLoading] = useState(true);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = () => {
    setLoading(true);
    try {
      // Auto-seed data if no orders exist (moved from Order.jsx for instant dashboard calculations)
      let orders = JSON.parse(localStorage.getItem('orders') || '[]');
      if (orders.length === 0) {
        seedDummyData();
        orders = JSON.parse(localStorage.getItem('orders') || '[]');
      }
      const dispatchHistory = JSON.parse(localStorage.getItem('dispatchHistory') || '[]');

      const calculatedStats = {
        totalOrders: orders.length,
        pendingPlanning: orders.filter(o => !o.planned).length,
        pendingNotification: dispatchHistory.filter(d => !d.notified).length,
        pendingCompletion: dispatchHistory.filter(d => d.notified && !d.completeStageComplete).length,
        pendingPostNotify: dispatchHistory.filter(d => d.completeStageComplete && !d.postNotified).length,
        fullyCompleted: dispatchHistory.filter(d => d.postNotified).length
      };

      setStats(calculatedStats);
      setDispatchHistory(dispatchHistory);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setTimeout(() => setLoading(false), 500); // Slight delay for smooth transitions
    }
  };

  const activeWorkload = stats.pendingPlanning + stats.pendingNotification + stats.pendingCompletion + stats.pendingPostNotify;
  const completionRate = stats.totalOrders > 0
    ? Math.round((stats.fullyCompleted / stats.totalOrders) * 100)
    : 0;

  const StatCard = ({ title, value, icon: Icon, color, bgColor, subtitle }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-3xl font-black text-gray-900">{value}</h3>
          {subtitle && (
            <p className="text-[10px] text-gray-500 mt-1 font-medium italic">{subtitle}</p>
          )}
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
              onClick={loadDashboardData}
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
            title="Total Intake"
            value={stats.totalOrders}
            icon={FileText}
            color="text-blue-600"
            bgColor="bg-blue-50"
            subtitle="Total orders processed"
          />
          <StatCard
            title="Active Workload"
            value={activeWorkload}
            icon={Activity}
            color="text-red-600"
            bgColor="bg-red-50"
            subtitle="Pending in pipeline"
          />
          <StatCard
            title="Ready to Inform"
            value={stats.pendingNotification}
            icon={BellRing}
            color="text-purple-600"
            bgColor="bg-purple-50"
            subtitle="Awaiting notification"
          />
          <StatCard
            title="Success Rate"
            value={`${completionRate}%`}
            icon={TrendingUp}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            subtitle="Overall completion"
          />
        </div>

        {/* Workflow Overview */}
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
              completed={stats.totalOrders - stats.pendingPlanning}
              icon={ClipboardCheck}
              color="text-blue-600"
              bgColor="bg-blue-50"
            />
            <WorkflowStageCard
              stage="2"
              title="Notify Party"
              pending={stats.pendingNotification}
              completed={stats.totalOrders - stats.pendingPlanning - stats.pendingNotification}
              icon={Send}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <WorkflowStageCard
              stage="3"
              title="Completion"
              pending={stats.pendingCompletion}
              completed={stats.fullyCompleted + stats.pendingPostNotify}
              icon={PackageCheck}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
            />
            <WorkflowStageCard
              stage="4"
              title="Post-Notify"
              pending={stats.pendingPostNotify}
              completed={stats.fullyCompleted}
              icon={BellRing}
              color="text-amber-600"
              bgColor="bg-amber-50"
            />
          </div>
        </div>

        {/* Admin Utilities: Recent Activity & Godown Workload */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-red-800" />
                Recent Workflow Activity
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search activity..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-3 pr-8 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-red-800 w-32 sm:w-48 transition-all"
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">
                  {searchTerm ? 'Search Results' : 'Latest 5 Updates'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 sticky top-0 bg-white z-10 shadow-sm">
                    <th className="pb-3 px-2">Entity</th>
                    <th className="pb-3">Client</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(searchTerm
                    ? dispatchHistory.filter(item =>
                      Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    : dispatchHistory.slice(-5)
                  ).reverse().map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-2">
                        <p className="text-xs font-bold text-gray-900 leading-none">{item.dispatchNo || item.orderNo}</p>
                        <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold">{item.itemName}</p>
                      </td>
                      <td className="py-3 text-xs font-medium text-gray-600">{item.clientName}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.postNotified ? 'bg-indigo-50 text-indigo-700' :
                          item.completeStageComplete ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                          }`}>
                          {item.postNotified ? 'Notified' : item.completeStageComplete ? 'Completed' : 'Planned'}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[10px] font-mono font-bold text-gray-400">
                        {item.completeDate || item.dispatchDate}
                      </td>
                    </tr>
                  ))}
                  {(searchTerm
                    ? dispatchHistory.filter(item =>
                      Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    : dispatchHistory
                  ).length === 0 && (
                      <tr>
                        <td colSpan="4" className="py-8 text-center text-xs text-gray-400 italic font-medium">No activity matching your search.</td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2">
              <Truck className="w-5 h-5 text-red-800" />
              Godown Load
            </h3>
            <div className="space-y-4">
              {Object.entries(
                JSON.parse(localStorage.getItem('dispatchHistory') || '[]')
                  .filter(d => !d.completeStageComplete)
                  .reduce((acc, curr) => {
                    acc[curr.godownName] = (acc[curr.godownName] || 0) + 1;
                    return acc;
                  }, {})
              ).slice(0, 4).sort((a, b) => b[1] - a[1]).map(([name, count], idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-1.5 px-1">
                    <span className="text-xs font-bold text-gray-700">{name}</span>
                    <span className="text-xs font-black text-red-800">{count} Items</span>
                  </div>
                  <div className="w-full bg-gray-50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-red-800 h-full rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((count / 20) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {Object.keys(JSON.parse(localStorage.getItem('dispatchHistory') || '[]').filter(d => !d.completeStageComplete)).length === 0 && (
                <div className="py-12 text-center">
                  <PackageCheck className="w-12 h-12 text-gray-100 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No Active Load</p>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-50">
              <div className="bg-red-50 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-1">Logistics Tip</p>
                <p className="text-xs text-red-700 font-medium leading-relaxed">
                  Monitor Godown capacity to avoid dispatch delays. High volume units require extra workforce.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;