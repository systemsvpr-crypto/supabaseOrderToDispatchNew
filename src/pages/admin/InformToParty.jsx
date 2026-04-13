import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BellRing, History, Save, X, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

const InformToParty = () => {
    const { user } = useAuth();
    const [pendingItems, setPendingItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedRows, setSelectedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const { showToast } = useToast();

    const abortControllerRef = useRef(null);

    const formatDisplayDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).replace(/ /g, '-');
        } catch (e) {
            return dateStr;
        }
    };

    // --- Skeleton Components ---
    const TableSkeleton = ({ cols }) => (
        <>
            {[...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden">
                    {[...Array(cols)].map((_, j) => (
                        <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );

    const MobileSkeleton = () => (
        <div className="divide-y divide-gray-100">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4 space-y-4 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div className="space-y-2 w-2/3">
                            <div className="h-3 w-1/3 bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                            <div className="h-5 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                        </div>
                        <div className="h-6 w-12 bg-gray-100 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="h-8 bg-gray-50 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                        <div className="h-8 bg-gray-50 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const fetchInformData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from('dispatch_plans')
                .select(`
                    *,
                    order:app_orders(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const allItems = (data || []).map((item) => ({
                id: item.id,
                orderNo: item.order?.order_number || '-',
                dispatchNo: item.dispatch_number || '-',
                clientName: item.order?.client_name || '-',
                godownName: item.godown_name || '-',
                itemName: item.order?.item_name || '-',
                qty: item.order?.qty || '-',
                dispatchQty: item.planned_qty || '-',
                dispatchDate: item.planned_date || '-',
                informed: item.informed_before_dispatch,
                informedAt: item.informed_at,
                dispatchCompleted: item.dispatch_completed,
                status: item.status
            }));

            // Pending: Not informed, not completed, and not canceled
            setPendingItems(allItems.filter(item => !item.informed && !item.dispatchCompleted && item.status !== 'Canceled'));
            // History: Everything that has been informed, excluding Canceled
            setHistoryItems(allItems.filter(item => item.informed && item.status !== 'Canceled'));

        } catch (error) {
            console.error('fetchInformData error:', error);
            setError(error.message);
            showToast('Error', 'Failed to load data: ' + error.message);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchInformData();
    }, [fetchInformData]);

    const handleRefresh = useCallback(() => {
        fetchInformData(true);
    }, [fetchInformData]);

    const allUniqueClients = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.clientName), ...historyItems.map(h => h.clientName)])].sort(),
        [pendingItems, historyItems]
    );

    const allUniqueGodowns = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.godownName), ...historyItems.map(h => h.godownName)])].sort(),
        [pendingItems, historyItems]
    );

    const requestSort = useCallback((key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const getSortedItems = useCallback((itemsToSort) => {
        if (!sortConfig.key) return itemsToSort;
        return [...itemsToSort].sort((a, b) => {
            let aVal = a[sortConfig.key], bVal = b[sortConfig.key];
            const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
            const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(aNum) && !isNaN(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [sortConfig]);

    const filteredAndSortedPending = useMemo(() => {
        const filtered = pendingItems.filter(item => {
            const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [pendingItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    const filteredAndSortedHistory = useMemo(() => {
        const filtered = historyItems.filter(item => {
            const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    const handleCheckboxToggle = (id) => {
        setSelectedRows(prev => {
            const newSelected = { ...prev };
            if (newSelected[id]) delete newSelected[id];
            else newSelected[id] = 'yes';
            return newSelected;
        });
    };

    const handleStatusChange = (id, status) => {
        setSelectedRows(prev => ({ ...prev, [id]: status }));
    };

    const handleSave = async () => {
        const selectedIds = Object.keys(selectedRows);
        if (selectedIds.length === 0) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('dispatch_plans')
                .update({
                    informed_before_dispatch: true,
                    informed_at: new Date().toISOString(),
                    submitted_by: user?.name || 'System'
                })
                .in('id', selectedIds);

            if (error) throw error;
            showToast('Notification status updated successfully!', 'success');
            setSelectedRows({});
            await fetchInformData(true);
        } catch (error) {
            console.error('Submission failed:', error);
            showToast('Error', 'Submission failed: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="relative">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-gray-100 max-w-[1200px] mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight whitespace-nowrap">Inform to Party (Before Dispatch)</h1>
                        <div className="flex bg-gray-100 p-1 rounded">
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <BellRing size={16} /> Pending
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <History size={16} /> History
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col lg:flex-row justify-between gap-4 lg:items-start">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
                        <input
                            type="text"
                            placeholder="Search records..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
                        />
                        <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="h-[42px]" />
                        <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="h-[42px]" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button onClick={handleRefresh} disabled={refreshing || isSaving} className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-bold border border-gray-200 disabled:opacity-50">
                            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
                        </button>
                        {activeTab === 'pending' && Object.keys(selectedRows).length > 0 && (
                            <button onClick={handleSave} className="flex items-center justify-center gap-2 px-5 h-[42px] bg-primary text-white rounded hover:bg-primary-hover shadow-md font-bold text-sm">
                                <Save size={16} /> Confirm Notification
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden max-w-[1200px] mx-auto">
                <div className="hidden md:block overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-6 py-4 text-center">Action</th>}
                                {[
                                    { label: 'Order No', key: 'orderNo' },
                                    { label: 'Dispatch No', key: 'dispatchNo', color: 'blue' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                                    { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown Name', key: 'godownName', align: 'center' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Total Qty', key: 'qty', align: 'right' },
                                    ...(activeTab === 'history' ? [{ label: 'Status', key: 'status', align: 'center' }] : [])
                                ].map((col) => (
                                    <th key={col.key} onClick={() => requestSort(col.key)} className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.color === 'blue' ? 'text-primary' : ''} ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}>
                                        <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''}`}>
                                            {col.label}
                                            <ChevronDown size={10} className={sortConfig.key === col.key ? 'text-primary' : 'text-gray-300'} />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm font-medium">
                            {loading ? <TableSkeleton cols={activeTab === 'pending' ? 10 : 9} /> : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map(item => (
                                <tr key={item.id} className={`${selectedRows[item.id] ? 'bg-green-50/50' : 'hover:bg-gray-50'} transition-colors group`}>
                                    {activeTab === 'pending' && (
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center gap-2 justify-center">
                                                <input type="checkbox" checked={!!selectedRows[item.id]} onChange={() => handleCheckboxToggle(item.id)} className="rounded text-primary cursor-pointer w-4 h-4 shadow-sm" />
                                                {selectedRows[item.id] && (
                                                    <select value={selectedRows[item.id]} onChange={(e) => handleStatusChange(item.id, e.target.value)} className="text-[10px] font-black border border-green-200 rounded px-1.5 py-0.5 bg-green-50 text-primary outline-none">
                                                        <option value="yes">YES</option>
                                                        <option value="no">NO</option>
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-gray-500">{item.orderNo}</td>
                                    <td className="px-6 py-4 font-bold text-primary">{item.dispatchNo}</td>
                                    <td className="px-6 py-4 text-right font-black text-gray-800 text-base">{item.dispatchQty}</td>
                                    <td className="px-6 py-4 text-center font-bold text-primary uppercase text-[10px] tracking-tighter bg-slate-50/50 rounded-lg">{formatDisplayDate(item.dispatchDate)}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900">{item.clientName}</td>
                                    <td className="px-6 py-4 text-center text-gray-600 italic font-black text-[11px] uppercase opacity-60">{item.godownName}</td>
                                    <td className="px-6 py-4 font-semibold text-gray-700 truncate max-w-[200px]">{item.itemName}</td>
                                    <td className="px-6 py-4 text-right font-black text-gray-400">{item.qty}</td>
                                    {activeTab === 'history' && (
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700 shadow-sm">
                                                Informed
                                            </span>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isSaving && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-md">
                <RefreshCw size={40} className="animate-spin text-primary" />
            </div>}
        </div>
    );
};

export default InformToParty;