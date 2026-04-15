import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Save, Loader, Clock, History, ChevronDown, ChevronUp, RefreshCw, X, XCircle } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

// --- Skeleton Components ---
const TableSkeleton = ({ cols }) => (
  <>
    {[...Array(6)].map((_, i) => (
      <tr key={i} className="border-b border-gray-100 last:border-0 h-16">
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
      <div key={i} className="p-4 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2 w-2/3">
            <div className="h-3 w-1/3 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-5 w-full bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="h-6 w-16 bg-gray-100 rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
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

const SkipDelivered = () => {
  const [pendingItems, setPendingItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRows, setSelectedRows] = useState({});
  const [editData, setEditData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const abortControllerRef = useRef(null);

  const [godowns, setGodowns] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // --- Real-time Stock fetching from Sheets ---
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingIntransit, setLoadingIntransit] = useState(false);
  const [stockDataMap, setStockDataMap] = useState({});
  const [intransitDataMap, setIntransitDataMap] = useState({});

  const STOCK_LIST_API = import.meta.env.VITE_STOCK_LIST_API;
  const INDENT_API = import.meta.env.VITE_INDENT_API;

  const normalize = useCallback((str) =>
    String(str || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')   // remove extra spaces
      .replace(/[^a-z0-9*]/g, ''), // remove special chars except *
    []);

  const fetchStockData = useCallback(async () => {
    setLoadingStock(true);
    try {
      const { data, error } = await supabase
        .from('stock_levels')
        .select('item_name, godown_name, closing_stock')
        .limit(5000);

      if (error) throw error;

      const sMap = {};
      (data || []).forEach(row => {
        const item = normalize(row.item_name);
        const godown = String(row.godown_name || "").trim();
        const stock = Number(row.closing_stock) || 0;

        const displayGodown = godown.toLowerCase() === 'godown' ? 'Gdn' : godown;
        if (!sMap[item]) sMap[item] = [];
        sMap[item].push(`${displayGodown}:${stock}`);
      });
      setStockDataMap(sMap);
    } catch (err) {
      console.error("Supabase stock fetch error:", err);
    } finally {
      setLoadingStock(false);
    }
  }, []);

  // Format date for display (e.g., 25-Feb-2026)
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
    } catch {
      return dateStr;
    }
  };

  // Format date for input value (YYYY-MM-DD)
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  };

  // --- Unified fetch: Connected to Supabase ---
  const fetchAllData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch Orders, Plans, and Master Godowns in parallel
      const [ordersRes, plansRes, godownsRes] = await Promise.all([
        supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('dispatch_plans').select('*'),
        supabase.from('master_godowns').select('godown_name').order('godown_name')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (plansRes.error) throw plansRes.error;
      if (godownsRes.error) throw godownsRes.error;

      // Group plans by order_id to calculate sums
      const planSumMap = {};
      const deliveredSumMap = {};
      plansRes.data.forEach(p => {
        if (p.order_id) {
          if (p.status === 'Canceled') return; // Do not include canceled dispatches in delivery/plan totals

          const qty = parseFloat(p.planned_qty) || 0;
          planSumMap[p.order_id] = (planSumMap[p.order_id] || 0) + qty;
          if (p.dispatch_completed) {
            deliveredSumMap[p.order_id] = (deliveredSumMap[p.order_id] || 0) + qty;
          }
        }
      });

      // Map Pending Items from app_orders
      const pending = (ordersRes.data || []).map((item, idx) => {
        const alreadyPlanned = planSumMap[item.id] || 0;
        const alreadyDelivered = deliveredSumMap[item.id] || 0;
        const remaining = (parseFloat(item.qty) || 0) - alreadyPlanned;

        const itemKey = normalize(item.item_name);

        let stockValues = stockDataMap[itemKey];
        if (!stockValues) {
          const stockEntry = Object.keys(stockDataMap).find(key =>
            itemKey.includes(key) || key.includes(itemKey)
          );
          if (stockEntry) stockValues = stockDataMap[stockEntry];
        }

        const allStockInfo = stockValues ? stockValues.join(', ') : '-';

        return {
          id: item.id,
          originalIndex: idx,
          orderNumber: item.order_number || '-',
          orderDate: item.order_date || '-',
          clientName: item.client_name || '-',
          godown: item.godown_name || '-',
          itemName: item.item_name || '-',
          rate: item.rate || '0',
          orderQty: item.qty || '0',
          currentStock: allStockInfo,
          intransitQty: intransitDataMap[`${itemKey}|${String(item.godown_name || "").trim().toLowerCase()}`] !== undefined ? intransitDataMap[`${itemKey}|${String(item.godown_name || "").trim().toLowerCase()}`] : '0',
          planningQty: alreadyPlanned,
          planningPendingQty: remaining > 0 ? remaining : 0,
          qtyDelivered: alreadyDelivered
        };
      }).filter(item => item.planningPendingQty > 0.001);

      // Map History Items from completed plans that were SKIPPED
      const history = (plansRes.data || [])
        .filter(p => p.is_skip === true)
        .map((p, idx) => {
          const order = (ordersRes.data || []).find(o => o.id === p.order_id);
          return {
            originalIndex: idx,
            orderNumber: order?.order_number || '-',
            orderDate: order?.order_date || '-',
            clientName: order?.client_name || '-',
            godown: order?.godown_name || '-',
            itemName: order?.item_name || '-',
            rate: order?.rate || '0',
            orderQty: order?.qty || '0',
            dispatchQty: p.planned_qty || '0',
            dispatchDate: p.planned_date || '-',
            dispatchNo: p.dispatch_number || '-',
            godownName: p.godown_name || '-',
            skipped: true
          };
        });

      setPendingItems(pending);
      setHistoryItems(history);

      const uniqueGodowns = (godownsRes.data || []).map(g => g.godown_name);
      setGodowns(uniqueGodowns);

    } catch (error) {
      console.error('fetchAllData error:', error);
      showToast(`Failed to load data: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchStockData();
    }
  }, [showToast, fetchStockData]);

  const handleCancelSelected = async () => {
    const ids = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (ids.length === 0) {
      showToast('Please select at least one order to cancel.', 'info');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently CANCEL the selected quantity for these ${ids.length} orders? \n\nThis will reduce the actual quantity in the Order table.`)) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      for (const indexKey of ids) {
        const order = pendingItems.find(o => String(o.originalIndex) === String(indexKey));
        const edits = editData[indexKey];
        if (!order) continue;

        const dbOrderId = order.id; // Use the actual DB ID
        const qtyToCancel = edits?.dispatchQty !== undefined ? parseFloat(edits.dispatchQty) : parseFloat(order.planningPendingQty);
        if (qtyToCancel <= 0 || isNaN(qtyToCancel)) continue;

        const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
        const maxNo = (plans || []).reduce((max, p) => {
          const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
          return isNaN(n) ? max : Math.max(max, n);
        }, 1000);

        // 1. FIRST: Insert a "Canceled" plan record for tracking history with additional fields
        const { error: insErr } = await supabase
          .from('dispatch_plans')
          .insert({
            order_id: dbOrderId,
            dispatch_number: `DN-${maxNo + 1}`,
            planned_qty: qtyToCancel,
            planned_date: now.split('T')[0],
            godown_name: edits?.godown || order.godown,
            status: 'Canceled',
            gst_included: edits?.gstInc || 'No',
            submitted_by: user?.name || 'System',
            dispatch_completed: true,
            informed_before_dispatch: true,
            informed_after_dispatch: true,
            // NEW FIELDS
            product_name: order.itemName || null,
            order_qty: order.orderQty || 0,
            client_name: order.clientName || null,
            order_number: order.orderNumber || null
          });
        if (insErr) throw insErr;

        // 2. ONLY IF SUCCESSFUL: Permanently REDUCE the qty in the app_orders table
        const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', dbOrderId).single();
        const newOrderTotal = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;
        const { error: ordErr } = await supabase
          .from('app_orders')
          .update({ qty: newOrderTotal })
          .eq('id', dbOrderId);
        if (ordErr) throw ordErr;
      }
      showToast('Orders updated and quantities permanently reduced.', 'success');
      setSelectedRows({});
      setEditData({});
      handleRefresh();
    } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    setSelectedRows({});
    setEditData({});
  }, [activeTab]);

  const handleRefresh = useCallback(() => {
    fetchAllData(true);
  }, [fetchAllData]);

  const allUniqueClients = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.clientName), ...historyItems.map(h => h.clientName)])].sort(),
    [pendingItems, historyItems]
  );
  const allUniqueGodowns = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort(),
    [pendingItems, historyItems]
  );

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedItems = useCallback((itemsToSort) => {
    if (!sortConfig.key) return itemsToSort;
    return [...itemsToSort].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const currentItems = activeTab === 'pending' ? pendingItems : historyItems;
  const filteredItems = useMemo(() => {
    const enriched = currentItems.map(item => {
      if (activeTab === 'pending') {
        const itemKey = String(item.itemName || "").trim().toLowerCase();
        const allStockInfo = stockDataMap[itemKey] ? stockDataMap[itemKey].join(', ') : '-';
        return {
          ...item,
          currentStock: allStockInfo,
          intransitQty: intransitDataMap[`${itemKey}|${String(item.godown || "").trim().toLowerCase()}`] !== undefined
            ? intransitDataMap[`${itemKey}|${String(item.godown || "").trim().toLowerCase()}`]
            : '0'
        };
      }
      return item;
    });

    return getSortedItems(
      enriched.filter(item => {
        const matchesSearch = Object.values(item).some(val =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = !clientFilter || item.clientName === clientFilter;
        const matchesGodown = !godownFilter || item.godown === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
      })
    );
  }, [currentItems, searchTerm, clientFilter, godownFilter, getSortedItems, stockDataMap, intransitDataMap, activeTab]);

  const handleCheckboxToggle = (originalIdx) => {
    const isSelectedNow = !selectedRows[originalIdx];
    setSelectedRows(prev => {
      const newState = { ...prev };
      if (isSelectedNow) newState[originalIdx] = true;
      else delete newState[originalIdx];
      return newState;
    });
    setEditData(prev => {
      const newState = { ...prev };
      if (isSelectedNow) {
        const item = pendingItems.find(it => it.originalIndex === originalIdx);
        newState[originalIdx] = {
          dispatchQty: item?.planningPendingQty || '',
          dispatchDate: new Date().toISOString().split('T')[0],
          gstIncluded: 'No',
          godown: item?.godown || ''
        };
      } else delete newState[originalIdx];
      return newState;
    });
  };

  const toggleSelectAll = () => {
    const allFilteredIndices = filteredItems.map(item => item.originalIndex);
    const allAreCurrentlySelected = allFilteredIndices.length > 0 && allFilteredIndices.every(idx => selectedRows[idx]);
    if (allAreCurrentlySelected) {
      setSelectedRows(prev => { const next = { ...prev }; allFilteredIndices.forEach(idx => delete next[idx]); return next; });
      setEditData(prev => { const next = { ...prev }; allFilteredIndices.forEach(idx => delete next[idx]); return next; });
    } else {
      const today = new Date().toISOString().split('T')[0];
      setSelectedRows(prev => { const next = { ...prev }; allFilteredIndices.forEach(idx => { next[idx] = true; }); return next; });
      setEditData(prev => {
        const next = { ...prev };
        allFilteredIndices.forEach(idx => {
          if (!next[idx]) {
            const item = pendingItems.find(it => it.originalIndex === idx);
            next[idx] = { dispatchQty: item?.planningPendingQty || '', dispatchDate: today, gstIncluded: 'No', godown: item?.godown || '' };
          }
        });
        return next;
      });
    }
  };

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;
  const isAllFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedRows[item.originalIndex]);

  const handleEditChange = (originalIdx, field, value) => {
    setEditData(prev => ({ ...prev, [originalIdx]: { ...prev[originalIdx], [field]: value } }));
  };

  const handleSave = async () => {
    const selectedIndices = Object.keys(selectedRows).filter(idx => selectedRows[idx]);
    if (selectedIndices.length === 0) return;
    if (!window.confirm(`Are you sure you want to mark ${selectedIndices.length} items as completed and skipped?`)) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
      let maxNo = plans?.reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000) || 1000;

      for (const idx of selectedIndices) {
        const item = pendingItems.find(it => String(it.originalIndex) === String(idx));
        const edit = editData[idx];
        if (!item || !edit) continue;

        maxNo++;
        const dNo = `DN-${maxNo}`;

        // 1. Create plan with all lifecycle flags set to true and additional fields
        const { data: newPlan, error: pErr } = await supabase
          .from('dispatch_plans')
          .insert({
            order_id: item.id,
            dispatch_number: dNo,
            planned_qty: parseFloat(edit.dispatchQty) || 0,
            planned_date: edit.dispatchDate,
            godown_name: edit.godown,
            dispatch_completed: true,
            informed_before_dispatch: false,
            informed_after_dispatch: false,
            status: 'Completed',
            is_skip: true,
            submitted_by: user?.name || 'System',
            completed_at: now,
            informed_at: null,
            // NEW FIELDS
            product_name: item.itemName || null,
            order_qty: item.orderQty || 0,
            client_name: item.clientName || null,
            order_number: item.orderNumber || null
          })
          .select().single();

        if (pErr) throw pErr;

        // 2. Add to log with additional fields
        await supabase.from('dispatch_completed_log').insert({
          dispatch_id: newPlan.id,
          dispatch_number: dNo,
          dispatch_date: edit.dispatchDate,
          complete_date: now.split('T')[0],
          client_name: item.clientName,
          product_name: item.itemName,
          godown_name: edit.godown,
          order_qty: parseFloat(item.orderQty) || 0,
          dispatch_qty: parseFloat(edit.dispatchQty) || 0,
          crm_name: user?.name || 'System',
          status: 'Completed',
          // NEW FIELDS for log as well
          order_number: item.orderNumber || null
        });
      }

      showToast('Items processed successfully!', 'success');
      fetchAllData(true);
      setSelectedRows({});
      setEditData({});
    } catch (error) {
      console.error('Save error:', error);
      showToast(`Save failed: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="">
      <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-gray-100 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Skip Delivered</h1>
            <div className="flex bg-gray-100 p-1 rounded">
              <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><Clock size={16} />Pending</button>
              <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><History size={16} />History</button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all" />
            <div className="h-[42px]"><SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="w-full h-full" focusColor="primary" /></div>
            <div className="h-[42px]"><SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="w-full h-full" focusColor="primary" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button onClick={handleRefresh} disabled={refreshing || isSaving} className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-bold border border-gray-200 disabled:opacity-50"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
            {(searchTerm || clientFilter || godownFilter) && <button onClick={() => { setSearchTerm(''); setClientFilter(''); setGodownFilter(''); }} className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-sm font-bold border border-green-100"><X size={15} />Clear</button>}
            {activeTab === 'pending' && selectedCount > 0 && (
              <button onClick={handleCancelSelected} disabled={isSaving} className="flex items-center justify-center gap-2 px-5 h-[42px] bg-red-600 text-white rounded shadow-md font-bold text-sm hover:bg-red-700 transition-all shadow-red-500/20">
                <XCircle size={16} /> Cancel Selected
              </button>
            )}
            {activeTab === 'pending' && (<button onClick={handleSave} disabled={isSaving || selectedCount === 0} className={`flex items-center justify-center gap-2 px-5 h-[42px] rounded shadow-md font-bold text-sm transition-all flex-1 sm:flex-none ml-auto sm:ml-0 ${selectedCount > 0 ? 'bg-primary text-white hover:bg-primary-hover shadow-primary/20' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none border border-gray-200'}`}>{isSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}{isSaving ? 'Saving...' : selectedCount > 0 ? `Mark ${selectedCount} Completed` : 'Mark Completed'}</button>)}
          </div>
        </div>
      </div>

      {isSaving && (<div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/40 backdrop-blur-md"><div className="bg-white/80 p-10 rounded-3xl shadow-xl flex flex-col items-center gap-4 border border-white/50"><Loader className="w-10 h-10 animate-spin text-primary" /><p className="text-sm font-black text-gray-700 uppercase tracking-widest">Processing Skip...</p></div></div>)}
      {refreshing && (<div className="fixed top-0 left-0 right-0 h-1 z-[101] bg-gray-100 overflow-hidden"><div className="h-full bg-primary animate-shimmer" style={{ width: '40%' }}></div></div>)}

      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden max-w-[1200px] mx-auto">
        <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                {activeTab === 'pending' && (
                  <th className="px-6 py-4 text-center w-16">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-400">All</span>
                      <input type="checkbox" checked={isAllFilteredSelected} onChange={toggleSelectAll} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" />
                    </div>
                  </th>
                )}
                {activeTab === 'pending' && (
                  <>
                    <th className="px-6 py-4 text-primary-hover text-right whitespace-nowrap">Dispatch Qty</th>
                    <th className="px-6 py-4 text-primary-hover text-center whitespace-nowrap">Dispatch Date</th>
                    <th className="px-6 py-4 text-primary-hover text-center whitespace-nowrap">GST Inc.</th>
                  </>
                )}
                {[
                  { label: 'Order Number', key: 'orderNumber' },
                  { label: 'Order Date', key: 'orderDate', align: 'center' },
                  { label: 'Client Name', key: 'clientName' },
                  { label: 'Godown', key: 'godown', align: 'center' },
                  { label: 'Item Name', key: 'itemName' },
                  { label: 'Rate', key: 'rate', align: 'right' },
                  { label: 'Order Qty', key: 'orderQty', align: 'right' },
                  { label: 'Stock', key: 'currentStock', align: 'right' },
                  { label: 'Intransit', key: 'intransitQty', align: 'right' },
                  ...(activeTab === 'pending' ? [{ label: 'Planning Qty', key: 'planningQty', align: 'right' }, { label: 'Pending Qty', key: 'planningPendingQty', align: 'right' }, { label: 'Qty Delivered', key: 'qtyDelivered', align: 'right' }] : []),
                  ...(activeTab === 'history' ? [{ label: 'Dispatch No', key: 'dispatchNo' }, { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' }, { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' }, { label: 'Godown Name', key: 'godownName', align: 'center' }] : [])
                ].map((col) => (
                  <th key={col.key} className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => requestSort(col.key)}>
                    <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.label}
                      <div className="flex flex-col"><ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-primary' : 'text-gray-300'} /><ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-primary' : 'text-gray-300'} /></div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {loading ? (<TableSkeleton cols={activeTab === 'pending' ? 14 : 10} />) : filteredItems.length === 0 ? (<tr><td colSpan={activeTab === 'pending' ? 14 : 10} className="px-6 py-20 text-center text-gray-400 italic text-sm font-bold">No items found.</td></tr>) : null}
              {!loading && filteredItems.map((item, idx) => {
                const originalIdx = item.originalIndex;
                const isSelected = activeTab === 'pending' && !!selectedRows[originalIdx];
                const edit = editData[originalIdx] || {};
                return (
                  <tr key={idx} className={isSelected ? 'bg-green-50/50' : 'hover:bg-gray-50'}>
                    {activeTab === 'pending' && (<td className="px-6 py-4 text-center"><input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(originalIdx)} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" /></td>)}
                    {activeTab === 'pending' && (
                      <>
                        <td className="px-6 py-4 text-right">{isSelected ? (<input type="number" value={edit.dispatchQty || ''} onChange={(e) => handleEditChange(originalIdx, 'dispatchQty', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm outline-none text-right" placeholder="Qty" />) : (<span className="text-gray-300 italic text-[10px]">Select to edit</span>)}</td>
                        <td className="px-6 py-4 text-center">{isSelected ? (<input type="date" value={edit.dispatchDate || ''} onChange={(e) => handleEditChange(originalIdx, 'dispatchDate', e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm outline-none" />) : (<span className="text-gray-300 italic text-[10px]">-</span>)}</td>
                        <td className="px-6 py-4 text-center">{isSelected ? (<select value={edit.gstIncluded || 'No'} onChange={(e) => handleEditChange(originalIdx, 'gstIncluded', e.target.value)} className="w-full px-1 py-1 border border-gray-300 rounded text-sm outline-none"><option value="Yes">Yes</option><option value="No">No</option></select>) : (<span className="text-gray-300 italic text-[10px]">-</span>)}</td>
                      </>
                    )}
                    <td className="px-6 py-4 font-semibold text-gray-900">{item.orderNumber}</td>
                    <td className="px-6 py-4 text-gray-600 text-xs text-center">{formatDisplayDate(item.orderDate)}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">{item.clientName}</td>
                    <td className="px-6 py-4 text-gray-600 text-center">{isSelected ? (<SearchableDropdown value={edit.godown || ''} onChange={(val) => handleEditChange(originalIdx, 'godown', val)} options={godowns} placeholder="Select Godown" showAll={false} className="w-full text-left" />) : (item.godown)}</td>
                    <td className="px-6 py-4 text-gray-600">{item.itemName}</td>
                    <td className="px-6 py-4 text-gray-600 text-right">{item.rate}</td>
                    <td className="px-6 py-4 text-gray-600 text-right font-bold">{item.orderQty}</td>
                    <td className="px-6 py-4 text-right text-[11px] font-bold text-gray-500">
                      {loadingStock ? <RefreshCw size={12} className="animate-spin inline" /> : item.currentStock}
                    </td>
                    <td className="px-6 py-4 text-right text-[11px] font-bold text-gray-500">
                      {loadingIntransit ? <RefreshCw size={12} className="animate-spin inline" /> : item.intransitQty}
                    </td>
                    {activeTab === 'pending' && (<><td className="px-6 py-4 font-bold text-primary text-right">{item.planningQty}</td><td className="px-6 py-4 text-gray-600 text-right">{item.planningPendingQty}</td><td className="px-6 py-4 text-gray-600 text-right">{item.qtyDelivered}</td></>)}
                    {activeTab === 'history' && (<><td className="px-6 py-4 text-gray-600 font-bold">{item.dispatchNo}</td><td className="px-6 py-4 text-gray-600 text-right font-bold">{item.dispatchQty}</td><td className="px-6 py-4 text-gray-600 text-xs text-center">{formatDisplayDate(item.dispatchDate)}</td><td className="px-6 py-4 text-gray-600 text-center">{item.godownName}</td></>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile View */}
        {loading && <MobileSkeleton />}
        <div className="md:hidden space-y-3 p-1">
          {!loading && filteredItems.length === 0 && (
            <div className="bg-white p-10 text-center rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-400 italic text-sm">No items found.</p>
            </div>
          )}
          {!loading && filteredItems.map((item, idx) => {
            const originalIdx = item.originalIndex;
            const isSelected = activeTab === 'pending' && !!selectedRows[originalIdx];
            const edit = editData[originalIdx] || {};

            return (
              <div
                key={idx}
                className={`bg-white rounded-xl shadow-sm border transition-all overflow-hidden ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-gray-100'
                  }`}
              >
                <div className="p-4">
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-3">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleCheckboxToggle(originalIdx)}
                          className="mt-1 rounded text-primary focus:ring-primary w-5 h-5 cursor-pointer"
                        />
                      )}
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm leading-tight">{item.clientName}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Order: {item.orderNumber}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${activeTab === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-green-50 text-primary border border-green-100'
                      }`}>
                      {activeTab === 'pending' ? 'Pending' : 'Completed'}
                    </span>
                  </div>

                  {/* Product Info */}
                  <div className="bg-gray-50/50 rounded-lg p-2.5 mb-3 border border-gray-100/50">
                    <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Product</p>
                    <p className="text-xs font-bold text-gray-700 leading-tight">{item.itemName}</p>
                  </div>

                  {/* Grid Data */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Order Qty</p>
                      <p className="text-xs font-bold text-gray-900">{item.orderQty}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Date</p>
                      <p className="text-xs font-bold text-gray-900">{formatDisplayDate(activeTab === 'pending' ? item.orderDate : item.dispatchDate)}</p>
                    </div>
                  </div>

                  {/* Quantity Breakdown (Pending Tab Only) */}
                  {activeTab === 'pending' && (
                    <div className="grid grid-cols-3 gap-2 py-2 border-t border-gray-50 border-dashed">
                      <div className="text-center bg-blue-50/30 rounded p-1">
                        <p className="text-[8px] font-bold text-blue-400 uppercase">Planned</p>
                        <p className="text-[11px] font-black text-blue-600">{item.planningQty}</p>
                      </div>
                      <div className="text-center bg-amber-50/30 rounded p-1">
                        <p className="text-[8px] font-bold text-amber-400 uppercase">Remaining</p>
                        <p className="text-[11px] font-black text-amber-600">{item.planningPendingQty}</p>
                      </div>
                      <div className="text-center bg-green-50/30 rounded p-1">
                        <p className="text-[8px] font-bold text-green-400 uppercase">Deliv</p>
                        <p className="text-[11px] font-black text-green-600">{item.qtyDelivered}</p>
                      </div>
                    </div>
                  )}

                  {/* Edit Form (if selected) */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Dispatch Qty</label>
                          <input
                            type="number"
                            value={edit.dispatchQty || ''}
                            onChange={(e) => handleEditChange(originalIdx, 'dispatchQty', e.target.value)}
                            className="w-full px-3 py-2 border border-blue-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-blue-50/30 font-bold"
                            placeholder="Qty"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Dispatch Date</label>
                          <input
                            type="date"
                            value={edit.dispatchDate || ''}
                            onChange={(e) => handleEditChange(originalIdx, 'dispatchDate', e.target.value)}
                            className="w-full px-3 py-2 border border-blue-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-blue-50/30 font-bold"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-primary mb-1 uppercase">GST Included</label>
                          <select
                            value={edit.gstIncluded || 'No'}
                            onChange={(e) => handleEditChange(originalIdx, 'gstIncluded', e.target.value)}
                            className="w-full px-3 py-2 border border-blue-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-blue-50/30 font-bold"
                          >
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div className="flex flex-col justify-end">
                          {/* Empty space or secondary info */}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Godown</label>
                        <SearchableDropdown
                          value={edit.godown || ''}
                          onChange={(val) => handleEditChange(originalIdx, 'godown', val)}
                          options={godowns}
                          placeholder="Select Godown"
                          showAll={false}
                          className="w-full text-left"
                        />
                      </div>
                    </div>
                  )}

                  {/* Additional Labels for Completed Tab */}
                  {activeTab === 'history' && (
                    <div className="mt-3 pt-3 border-t border-gray-50 space-y-2 text-[10px]">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 font-bold uppercase">Dispatch No:</span>
                        <span className="text-gray-900 font-black bg-gray-100 px-2 py-0.5 rounded">{item.dispatchNo}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-gray-400 font-bold uppercase mr-2">Godown:</span>
                          <span className="text-gray-700 font-black">{item.godownName}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 font-bold uppercase mr-2">Disp Qty:</span>
                          <span className="text-primary font-black">{item.dispatchQty}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default SkipDelivered;