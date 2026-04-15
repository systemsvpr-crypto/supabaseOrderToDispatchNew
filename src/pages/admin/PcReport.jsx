import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Loader, Save, RefreshCcw, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../supabaseClient';

// --- Skeleton Components ---
const TableSkeleton = ({ cols = 9 }) => (
  <>
    {[...Array(7)].map((_, i) => (
      <tr key={i} className="border-b border-gray-100 last:border-0 h-16">
        {[...Array(cols)].map((_, j) => (
          <td key={j} className="px-6 py-4">
            <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden animate-pulse">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>
          </td>
        ))}
        
      </tr>
    ))}
  </>
);

const PcReport = () => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({
        stage: '',
        status: 'Running',
        remarks: ''
    });
    const { showToast } = useToast();
    const [sortConfig, setSortConfig] = useState({ key: 'orderNumber', direction: 'desc' });

    const formatDisplayDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const day = date.getDate().toString().padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
        } catch { return dateStr; }
    };

    const fetchTrackerData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const [ordersRes, plansRes] = await Promise.all([
                supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
                supabase.from('dispatch_plans').select('*')
            ]);

            if (ordersRes.error) throw ordersRes.error;
            if (plansRes.error) throw plansRes.error;

            const allOrders = ordersRes.data || [];
            const allPlans = plansRes.data || [];
            let report = [];

            // 1. Un-planned logic (Dispatch Planning Stage)
            allOrders.forEach(order => {
                const plans = allPlans.filter(p => p.order_id === order.id);
                const plannedSum = plans.filter(p => p.status !== 'Canceled').reduce((sum, p) => sum + (parseFloat(p.planned_qty) || 0), 0);
                const canceledSum = plans.filter(p => p.status === 'Canceled').reduce((sum, p) => sum + (parseFloat(p.planned_qty) || 0), 0);
                const remaining = (parseFloat(order.qty) || 0) - plannedSum - canceledSum;

                if (remaining > 0.001) {
                    report.push({
                        id: `ORDER-${order.id}`,
                        uniqueNumber: order.order_number || '-',
                        plannedDate: formatDisplayDate(order.order_date),
                        stepName: 'Dispatch Planning',
                        who: order.created_by || 'Ravi',
                        clientName: order.client_name || '-',
                        godown: order.godown_name || '-',
                        itemName: order.item_name || '-',
                        orderQty: order.qty || '0',
                        canceledQty: canceledSum || '0',
                        isDispatch: false
                    });
                }
            });

            // 2. Active Plans logic (Notification and Shipping Stages)
            allPlans.forEach(plan => {
                if (plan.status === 'Canceled') return; // Do not show canceled plans
                
                const order = allOrders.find(o => o.id === plan.order_id);
                
                let step = '';
                let who = '';

                if (!plan.informed_before_dispatch) {
                    step = 'Inform To Party Before Dispatch';
                    who = 'CRM';
                } else if (!plan.dispatch_completed) {
                    step = 'Dispatch Complete';
                    who = 'Godown';
                } else if (!plan.informed_after_dispatch) {
                    step = 'After Dispatch Inform';
                    who = 'CRM';
                } else {
                    return; // Skip completed items
                }

                report.push({
                    id: `PLAN-${plan.id}`,
                    uniqueNumber: plan.dispatch_number || order?.order_number || '-',
                    plannedDate: formatDisplayDate(plan.planned_date),
                    stepName: step,
                    who: who,
                    clientName: order?.client_name || '-',
                    godown: plan.godown_name || order?.godown_name || '-',
                    itemName: order?.item_name || '-',
                    orderQty: plan.planned_qty || '0',
                    canceledQty: '0',
                    isDispatch: true
                });
            });

            setItems(report);
        } catch (error) {
            console.error('Tracker error:', error);
            showToast('Error', 'Failed to update tracker: ' + error.message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => { fetchTrackerData(); }, [fetchTrackerData]);

    const handleRefresh = () => fetchTrackerData(true);

    const sortedItems = useMemo(() => {
        let result = [...items].filter(it => 
            Object.values(it).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
        );
        if (sortConfig.key) {
            result.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (sortConfig.direction === 'asc') return aVal > bVal ? 1 : -1;
                return aVal < bVal ? 1 : -1;
            });
        }
        return result;
    }, [items, searchTerm, sortConfig]);

    const requestSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const openReportModal = (item) => {
        setCurrentItem(item);
        setFormData({ stage: item.stepName, status: 'Running', remarks: '' });
        setModalOpen(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        showToast('Tracking is automated based on page progress.', 'info');
        setModalOpen(false);
    };

    return (
        <div className="p-4 lg:p-6 max-w-[1500px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-gray-800">PC Report</h1>
                    <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors border border-green-200 text-sm font-bold">
                        <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
                <div className="relative max-w-sm w-full">
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all" />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse min-w-[1300px]">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] uppercase text-gray-500 font-black tracking-widest">
                                <th className="px-6 py-4 text-center">Action</th>
                                {[
                                    { label: 'Unique Number', key: 'uniqueNumber' },
                                    { label: 'Planned Date', key: 'plannedDate', align: 'center' },
                                    { label: 'Step Name', key: 'stepName' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown', key: 'godown', align: 'center' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Order Qty', key: 'orderQty', align: 'right' },
                                    { label: 'Canceled Qty', key: 'canceledQty', align: 'right' }
                                ].map((col) => (
                                    <th key={col.key} onClick={() => requestSort(col.key)} className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}>
                                        <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''}`}>
                                            {col.label}
                                            <div className="flex flex-col opacity-30"><ChevronUp size={10} /><ChevronDown size={10} /></div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px]">
                            {isLoading ? <TableSkeleton cols={8} /> : sortedItems.length === 0 ? <tr><td colSpan="8" className="p-20 text-center italic text-gray-400">No pending orders in tracking.</td></tr> : (
                                sortedItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0 h-16">
                                        <td className="px-6 py-3 text-center">
                                            <button onClick={() => openReportModal(item)} className="px-3 py-1 bg-[#68d306] text-white rounded text-xs font-bold hover:bg-[#5bb805] shadow-sm transform active:scale-95 transition-all">Update</button>
                                        </td>
                                        <td className="px-6 py-3 font-bold text-gray-800">{item.uniqueNumber}</td>
                                        <td className="px-6 py-3 text-gray-500 text-center">{item.plannedDate}</td>
                                        <td className="px-6 py-3 text-gray-500">{item.stepName}</td>
                                        <td className="px-6 py-3 text-gray-500 font-medium">{item.clientName}</td>
                                        <td className="px-6 py-3 text-gray-500 text-center">{item.godown}</td>
                                        <td className="px-6 py-3 text-gray-500 truncate max-w-[250px]">{item.itemName}</td>
                                        <td className="px-6 py-3 text-gray-800 text-right font-black">{item.orderQty}</td>
                                        <td className="px-6 py-3 text-red-500 text-right font-black">{item.canceledQty > 0 ? `-${item.canceledQty}` : '0'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal - Exactly like Screenshot 2 */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 border-t-8 border-[#68d306]">
                        <div className="px-6 py-4 bg-[#68d306] text-white flex justify-between items-center shadow-md">
                            <h2 className="text-xl font-bold tracking-tight">Update PC Status</h2>
                            <button onClick={()=>setModalOpen(false)} className="bg-white/20 p-1 rounded-full hover:bg-white/30 transition-all"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="p-8 space-y-6">
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Unique Number</label>
                                <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded text-sm text-gray-800 font-bold">{currentItem?.uniqueNumber}</div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Stage / Step Name</label>
                                <div className="px-4 py-3 border border-gray-200 rounded text-sm text-gray-700 bg-white font-medium">{currentItem?.stepName}</div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Compliance Status</label>
                                <select value={formData.status} onChange={(e)=>setFormData({...formData, status: e.target.value})} className="w-full px-4 py-3 border border-gray-200 rounded text-sm font-medium focus:ring-2 focus:ring-[#68d306]/20 transition-all bg-white outline-none">
                                    <option value="Running">Running</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Order Cancel">Order Cancel</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Remarks</label>
                                <textarea placeholder="Enter details..." className="w-full px-4 py-3 border border-gray-200 rounded text-sm font-medium focus:ring-2 focus:ring-[#68d306]/20 transition-all outline-none resize-none h-24" />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={()=>setModalOpen(false)} className="flex-1 px-4 py-3 border border-gray-200 rounded text-gray-600 font-black text-xs uppercase hover:bg-gray-50 transition-all">Cancel</button>
                                <button type="submit" className="flex-1 px-4 py-3 bg-[#68d306] text-white rounded font-black text-xs uppercase shadow-lg shadow-[#68d306]/20 hover:bg-[#5bb805] flex items-center justify-center gap-2 tracking-widest transition-all">
                                    <Save size={16} /> Submit Update
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PcReport;