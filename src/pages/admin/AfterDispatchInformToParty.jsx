import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Mail, History, Save, ChevronUp, ChevronDown, RefreshCw, ClipboardList, CheckCircle } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

// --- Format date for display ---
const formatDisplayDate = (dateStr) => {
  if (!dateStr || dateStr === '-') return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch { return dateStr; }
};

// --- High-Fidelity Skeletons ---
const TableSkeleton = () => (
  <div className="w-full space-y-4 p-4">
    <div className="h-10 bg-gray-100 rounded-lg w-full mb-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
    </div>
    {[...Array(6)].map((_, i) => (
      <div key={i} className="flex space-x-4 border-b border-gray-50 pb-4 relative overflow-hidden">
        {[1 / 12, 2 / 12, 2 / 12, 3 / 12, 2 / 12, 1 / 12, 1 / 12].map((width, j) => (
          <div key={j} style={{ width: `${width * 100}%` }} className="h-4 bg-gray-50 rounded relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const AfterDispatchInformToParty = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedRows, setSelectedRows] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isSaving, setIsSaving] = useState(false);

  const [pendingItems, setPendingItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Data ---
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`
                *,
                order:app_orders(*)
            `)
        .order('informed_after_dispatch', { ascending: false });

      if (error) throw error;

      const allMapped = (data || []).map(item => ({
        id: item.id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNo: item.order?.order_number || '-',
        customerName: item.order?.client_name || '-',
        productName: item.order?.item_name || '-',
        godown: item.godown_name || '-',
        crmName: item.order?.submittedby || '-',
        orderQty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        completed: item.dispatch_completed,
        informedAfter: item.informed_after_dispatch,
        informedAt: item.informed_at,
        is_skip: item.is_skip,
        db_status: item.status,
        status: item.informed_after_dispatch ? 'Informed' : 'Pending'
      }));

      setPendingItems(allMapped.filter(i => i.completed && !i.informedAfter && i.db_status !== 'Canceled' && i.is_skip !== true));
      setHistoryItems(allMapped.filter(i => i.informedAfter && i.db_status !== 'Canceled' && i.is_skip !== true));

    } catch (error) {
      console.error('fetchData error:', error);
      showToast('Error', 'Failed to load items: ' + error.message);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Filtering & Sorting ---
  const allUniqueClients = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.customerName), ...historyItems.map(h => h.customerName)])].sort(),
    [pendingItems, historyItems]
  );
  const allUniqueGodowns = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort(),
    [pendingItems, historyItems]
  );

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

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

  const filteredItems = useMemo(() => {
    const source = activeTab === 'pending' ? pendingItems : historyItems;
    const filtered = source.filter(item => {
      const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesClient = !clientFilter || item.customerName === clientFilter;
      const matchesGodown = !godownFilter || item.godown === godownFilter;
      return matchesSearch && matchesClient && matchesGodown;
    });
    return getSortedItems(filtered);
  }, [pendingItems, historyItems, activeTab, searchTerm, clientFilter, godownFilter, getSortedItems]);

  // --- Actions ---
  const handleCheckboxToggle = (id) => {
    setSelectedRows(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const handleSave = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('dispatch_plans')
        .update({
          informed_after_dispatch: true,
          informed_after: new Date().toISOString(),
          submitted_by: user?.name || 'System'
        })
        .in('id', selectedIds);

      if (error) throw error;

      showToast('Notifications confirmed successfully!', 'success');
      setSelectedRows({});
      fetchData(true);
    } catch (error) {
      console.error('Save error:', error);
      showToast('Error', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = () => fetchData(true);

  return (
    <div className="">
      {/* Background Refresh Progress */}
      {isRefreshing && !isLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[100] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-shimmer-fast w-full origin-left"></div>
        </div>
      )}

      {/* Header & Controls */}
      <div className="max-w-[1400px] mx-auto mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Row 1: Title & Tabs */}
          <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-50 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Mail size={22} /></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none mb-1.5">Inform to Party</h1>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none">After Dispatch Notifications</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-gray-100/80 p-1 rounded-xl border border-gray-200/50">
              <button
                onClick={() => { setActiveTab('pending'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ClipboardList size={16} /> PENDING
              </button>
              <button
                onClick={() => { setActiveTab('history'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <History size={16} /> HISTORY
              </button>
            </div>
          </div>

          {/* Row 2: Filters & Actions */}
          <div className="px-6 py-4 bg-gray-50/30 flex flex-wrap items-center gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-[300px]">
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center text-gray-400"><RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /></div>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="ALL CLIENTS" placeholder="Client" />
              <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="ALL GODOWNS" placeholder="Godown" />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleRefresh} disabled={isRefreshing} className="px-4 py-2 bg-white text-gray-700 rounded-xl hover:bg-gray-50 text-xs font-black border border-gray-200 shadow-sm flex items-center gap-2">
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> REFRESH
              </button>
              {activeTab === 'pending' && Object.keys(selectedRows).length > 0 && (
                <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-primary text-white rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 font-black text-xs tracking-widest flex items-center gap-2">
                  {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                  {isSaving ? 'SAVING...' : 'CONFIRM NOTIFY'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                {activeTab === 'pending' && (
                  <th className="px-6 py-4 text-center w-16">
                    <input
                      type="checkbox"
                      checked={pendingItems.length > 0 && filteredItems.every(it => selectedRows[it.id])}
                      onChange={() => {
                        const allCurrent = filteredItems.map(it => it.id);
                        const allSelected = allCurrent.every(id => selectedRows[id]);
                        setSelectedRows(prev => {
                          const next = { ...prev };
                          allCurrent.forEach(id => { if (allSelected) delete next[id]; else next[id] = true; });
                          return next;
                        });
                      }}
                      className="rounded-md w-5 h-5 cursor-pointer"
                    />
                  </th>
                )}
                {[
                  { label: 'Dispatch No', key: 'dispatchNo' },
                  { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                  { label: 'Order No', key: 'orderNo' },
                  { label: 'Customer', key: 'customerName' },
                  { label: 'Product Name', key: 'productName' },
                  { label: 'Godown', key: 'godown', align: 'center' },
                  { label: 'CRM Name', key: 'crmName' },
                  { label: 'Order Qty', key: 'orderQty', align: 'right' },
                  { label: 'Status', key: 'status', align: 'center' },
                  { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                ].map(col => (
                  <th key={col.key} className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => requestSort(col.key)}>
                    <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''}`}>
                      <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">{col.label}</span>
                      <ChevronDown size={10} className={sortConfig.key === col.key ? 'text-primary' : 'text-gray-300'} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-medium">
              {isLoading ? (
                <tr><td colSpan="12"><TableSkeleton /></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="12" className="px-4 py-20 text-center text-gray-400 italic font-bold text-sm">No entries found for this selection.</td></tr>
              ) : filteredItems.map(item => {
                const isSelected = activeTab === 'pending' && !!selectedRows[item.id];
                return (
                  <tr key={item.id} className={`group ${isSelected ? 'bg-primary/5' : 'hover:bg-gray-50/50'} transition-all`}>
                    {activeTab === 'pending' && (
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(item.id)} className="rounded-md w-5 h-5 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-6 py-4"><span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-black text-[10px] tracking-wider uppercase">{item.dispatchNo}</span></td>
                    <td className="px-6 py-4 text-center font-bold text-[11px] text-gray-500">{formatDisplayDate(item.dispatchDate)}</td>
                    <td className="px-6 py-4 text-gray-600 text-[13px] font-bold">{item.orderNo}</td>
                    <td className="px-6 py-4 font-bold text-gray-900 text-sm whitespace-nowrap">{item.customerName}</td>
                    <td className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[200px]">{item.productName}</td>
                    <td className="px-6 py-4 text-center text-gray-600 font-bold text-[12px]">{item.godown}</td>
                    <td className="px-6 py-4 text-gray-400 text-[11px] italic font-bold">{item.crmName}</td>
                    <td className="px-6 py-4 text-right text-gray-700 font-black text-[13px]">{item.orderQty}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${activeTab === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-primary text-[14px]">{item.dispatchQty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AfterDispatchInformToParty;