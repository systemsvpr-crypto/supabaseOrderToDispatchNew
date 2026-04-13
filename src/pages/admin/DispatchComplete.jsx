import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CheckCircle, History, Save, ChevronDown, ChevronUp, RefreshCw, ClipboardList, X, XCircle, Trash2 } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

// --- Constants ---
const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
const MASTER_URL = import.meta.env.VITE_MASTER_URL;
const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

// --- Helper: get value from object regardless of key casing/spaces ---
const getVal = (obj, ...possibleKeys) => {
  if (!obj) return undefined;
  const keys = Object.keys(obj);
  for (const pKey of possibleKeys) {
    if (obj[pKey] !== undefined) return obj[pKey];
    if (typeof pKey !== 'string') continue;
    const normalizedPKey = pKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedPKey);
    if (foundKey) return obj[foundKey];
  }
  return undefined;
};

// --- Format date for display (e.g., 25-Feb-2026) ---
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

// --- Format date for input (YYYY-MM-DD) ---
const formatDateToYYYYMMDD = (dateVal) => {
  if (!dateVal) return '';
  try {
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return dateVal;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return dateVal;
  }
};

const DispatchComplete = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  // --- UI state ---
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedRows, setSelectedRows] = useState({});
  const [editData, setEditData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isSaving, setIsSaving] = useState(false);

  // --- Data state ---
  const [orders, setOrders] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);

  // --- Master data (item names, godowns) ---
  const [itemNames, setItemNames] = useState([]);
  const [godowns, setGodowns] = useState([]);

  // Abort controllers for pending requests
  const pendingAbortRef = useRef(null);
  const historyAbortRef = useRef(null);

  // --- Fetch pending orders from Planning sheet ---
  const fetchPendingOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingOrders(true);
    else setLoadingOrders(true);

    try {
      // Fetch plans that are NOT yet completed
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`
          *,
          order:app_orders(*)
        `)
        .eq('dispatch_completed', false)
        .eq('informed_before_dispatch', true) // Only show items AFTER they are notified before dispatch
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((item, idx) => ({
        id: item.id,
        order_id: item.order_id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNumber: item.order?.order_number || '-',
        clientName: item.order?.client_name || '-',
        itemName: item.order?.item_name || '-',
        godownName: item.godown_name || '-',
        qty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        gstIncluded: item.gst_included || 'No',
        crmName: item.order?.submittedby || '-',
        originalIndex: idx
      }));

      setOrders(mapped);
    } catch (error) {
      console.error('fetchPendingOrders error:', error);
      showToast('Error', 'Failed to load pending dispatches: ' + error.message);
    } finally {
      setLoadingOrders(false);
      setRefreshingOrders(false);
    }
  }, [showToast]);

  // --- Fetch history from Dispatch Completed sheet ---
  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingHistory(true);
    else setLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`
          *,
          order:app_orders(*)
        `)
        .eq('dispatch_completed', true)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(item => ({
        id: item.id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNumber: item.order?.order_number || '-',
        clientName: item.order?.client_name || '-',
        itemName: item.order?.item_name || '-',
        godownName: item.godown_name || '-',
        qty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        crmName: item.order?.submittedby || '-',
        completedAt: item.completed_at,
        status: item.status
      }));

      setHistoryItems(mapped.filter(i => i.status !== 'Canceled'));
    } catch (error) {
      console.error('fetchHistory error:', error);
      showToast('Error', 'Failed to load history: ' + error.message);
    } finally {
      setLoadingHistory(false);
      setRefreshingHistory(false);
    }
  }, [showToast]);

  // Initial load on mount
  useEffect(() => {
    fetchPendingOrders();
    fetchHistory();

    return () => {
      if (pendingAbortRef.current) pendingAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
    };
  }, [fetchPendingOrders, fetchHistory]);

  // --- Fetch master data from Supabase ---
  const fetchMasterData = useCallback(async () => {
    try {
      const [productsRes, godownsRes] = await Promise.all([
        supabase.from('master_products').select('product_name').order('product_name'),
        supabase.from('master_godowns').select('godown_name').order('godown_name')
      ]);

      if (productsRes.error) throw productsRes.error;
      if (godownsRes.error) throw godownsRes.error;

      setItemNames(productsRes.data.map(p => p.product_name));
      setGodowns(godownsRes.data.map(g => g.godown_name));
    } catch (error) {
      console.error('Error fetching master data:', error);
      showToast('Error', 'Failed to load master data: ' + error.message);
    }
  }, [showToast]);

  // Load master data on mount
  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  // Clear selection/edit data when tab changes
  useEffect(() => {
    setSelectedRows({});
    setEditData({});
  }, [activeTab]);

  const isLoading = loadingOrders || loadingHistory;
  const isRefreshing = refreshingOrders || refreshingHistory;

  // --- Memoized unique values for filters ---
  const allUniqueClients = useMemo(() =>
    [...new Set([...(orders || []).map(o => o.clientName), ...(historyItems || []).map(h => h.clientName)])].sort(),
    [orders, historyItems]
  );
  const allUniqueGodowns = useMemo(() =>
    [...new Set([...(orders || []).map(o => o.godownName), ...(historyItems || []).map(h => h.godownName)])].sort(),
    [orders, historyItems]
  );

  // --- Sorting logic ---
  const requestSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

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

      if (sortConfig.key.toLowerCase().includes('date')) {
        const aDate = new Date(aVal);
        const bDate = new Date(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
        }
      }

      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const filteredAndSortedPending = useMemo(() =>
    getSortedItems(
      (orders || []).filter(item => {
        const matchesSearch = Object.values(item).some(val =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = clientFilter === '' || item.clientName === clientFilter;
        const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
      })
    ),
    [orders, searchTerm, clientFilter, godownFilter, getSortedItems]
  );

  const handleCancelDispatch = async (item) => {
    const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for ${item.dispatchNo} (Max: ${item.dispatchQty}):`, item.dispatchQty);
    if (cancelQtyStr === null) return;

    const qtyToCancel = parseFloat(cancelQtyStr);
    const currentQty = parseFloat(item.dispatchQty);

    if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
      showToast('Error', 'Please enter a valid quantity');
      return;
    }

    if (qtyToCancel > currentQty + 0.001) {
      showToast('Error', 'Cannot cancel more than the planned quantity');
      return;
    }

    setIsSaving(true);
    try {
      const orderId = item.order_id;
      const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', orderId).single();
      const newOrderTotal = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;

      const { data: allPlans } = await supabase.from('dispatch_plans').select('dispatch_number');
      const maxNo = (allPlans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace('DSP', ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      // 1. FIRST: Create History Record / Update Status (Safety Lock)
      if (Math.abs(qtyToCancel - currentQty) < 0.001) {
        // Full cancel: Update the existing plan status to 'Canceled'
        const { error } = await supabase.from('dispatch_plans').update({
          status: 'Canceled',
          dispatch_completed: true,
          informed_after_dispatch: true
        }).eq('id', item.id);
        if (error) throw new Error(`Audit update failed: ${error.message}`);
      } else {
        // Partial cancel: Reduce existing plan, and create a NEW canceled record for the difference
        const remainingPlannedQty = currentQty - qtyToCancel;
        const { error: upErr } = await supabase.from('dispatch_plans').update({
          planned_qty: remainingPlannedQty
        }).eq('id', item.id);
        if (upErr) throw new Error(`Existing plan update failed: ${upErr.message}`);

        const { error: inErr } = await supabase.from('dispatch_plans').insert({
          order_id: orderId,
          dispatch_number: `DSP${maxNo + 1}-CXL`,
          planned_qty: qtyToCancel,
          planned_date: item.dispatchDate,
          godown_name: item.godownName,
          status: 'Canceled',
          gst_included: item.gstIncluded || 'No',
          dispatch_completed: true,
          informed_before_dispatch: true,
          informed_after_dispatch: true
        });
        if (inErr) throw new Error(`Audit record creation failed: ${inErr.message}`);
      }

      // 2. SECOND: Permanently REDUCE the qty in the app_orders table
      const { error: ordErr } = await supabase.from('app_orders').update({ qty: newOrderTotal }).eq('id', orderId);
      if (ordErr) throw ordErr;

      showToast('Order quantity reduced and dispatch cancellation processed', 'success');
      await fetchPendingOrders(true);
    } catch (err) {
      console.error(err);
      showToast('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkCancelDispatch = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedIds.length === 0) return;

    if (!window.confirm(`Are you sure you want to permanently CANCEL and REDUCE the quantity for these ${selectedIds.length} dispatches?`)) return;

    setIsSaving(true);
    try {
      const { data: plansData } = await supabase.from('dispatch_plans').select('dispatch_number');
      let currentMaxNo = (plansData || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      for (const dispatchId of selectedIds) {
        const rowData = orders.find(o => String(o.id) === String(dispatchId));
        if (!rowData) continue;

        const loopOrderId = rowData.order_id;
        const qtyToCancel = editData[dispatchId]?.dispatchQty !== undefined
          ? parseFloat(editData[dispatchId].dispatchQty)
          : parseFloat(rowData.dispatchQty);

        const currentQty = parseFloat(rowData.dispatchQty);

        // 1. FIRST: Create History Record / Update Status
        if (Math.abs(qtyToCancel - currentQty) < 0.001) {
          // Full cancel: Update the existing plan status to 'Canceled'
          const { error: updErr } = await supabase.from('dispatch_plans').update({
            status: 'Canceled',
            submitted_by: user?.name || 'System',
            dispatch_completed: true,
            informed_after_dispatch: true
          }).eq('id', rowData.id);
          if (updErr) throw new Error(`Audit update failed: ${updErr.message}`);
        } else {
          // Partial cancel: Reduce existing plan, and create a NEW canceled record for the difference
          const remainingPlannedQty = currentQty - qtyToCancel;
          const { error: upErr } = await supabase.from('dispatch_plans').update({
            planned_qty: remainingPlannedQty
          }).eq('id', rowData.id);
          if (upErr) throw new Error(`Existing plan update failed: ${upErr.message}`);

          currentMaxNo++;
          const { error: insErr } = await supabase.from('dispatch_plans').insert({
            order_id: loopOrderId,
            dispatch_number: `DN-${currentMaxNo}-CXL`,
            planned_qty: qtyToCancel,
            planned_date: rowData.dispatchDate,
            godown_name: rowData.godownName,
            status: 'Canceled',
            gst_included: rowData.gstIncluded || 'No',
            submitted_by: user?.name || 'System',
            dispatch_completed: true,
            informed_before_dispatch: true,
            informed_after_dispatch: true
          });
          if (insErr) throw new Error(`Audit record creation failed: ${insErr.message}`);
        }

        // 2. SECOND: Permanently REDUCE the qty in the app_orders table
        const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', loopOrderId).single();
        const newOrderTotal = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;
        const { error: ordErr } = await supabase.from('app_orders').update({ qty: newOrderTotal }).eq('id', loopOrderId);
        if (ordErr) throw ordErr;
      }

      showToast('Selected dispatches reduced/canceled successfully', 'success');
      await fetchPendingOrders(true);
      setSelectedRows({});
      setEditData({});
    } catch (err) {
      console.error(err);
      showToast('Error during bulk cancel', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAndSortedHistory = useMemo(() =>
    getSortedItems(
      (historyItems || []).filter(item => {
        const matchesSearch = Object.values(item).some(val =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = clientFilter === '' || item.clientName === clientFilter;
        const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
      })
    ),
    [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]
  );

  const handleCheckboxToggle = useCallback((id) => {
    setSelectedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);

  const handleEditChange = useCallback((idx, field, value) => {
    setEditData(prev => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value }
    }));
  }, []);

  const handleSave = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const rowsToLog = [];
      const updates = [];

      for (const id of selectedIds) {
        const item = orders.find(o => String(o.id) === String(id));
        if (item) {
          const finalQty = editData[id]?.dispatchQty !== undefined
            ? parseInt(editData[id].dispatchQty, 10)
            : parseInt(item.dispatchQty, 10);

          const finalGodown = editData[id]?.godown || item.godownName;
          const finalProduct = editData[id]?.product || item.itemName;

          rowsToLog.push({
            dispatch_id: item.id,
            dispatch_number: item.dispatchNo,
            dispatch_date: item.dispatchDate,
            complete_date: now.split('T')[0],
            client_name: item.clientName,
            product_name: finalProduct,
            godown_name: finalGodown,
            order_qty: parseInt(item.qty, 10),
            dispatch_qty: finalQty,
            crm_name: item.crmName,
            status: 'Completed'
          });

          // Dispatch Plan Update
          updates.push(
            supabase.from('dispatch_plans').update({
              planned_qty: finalQty,
              godown_name: finalGodown,
              dispatch_completed: true,
              completed_at: now,
              status: 'Completed'
            }).eq('id', item.id)
          );

          // Order Item Name Update (if changed)
          if (finalProduct !== item.itemName) {
            updates.push(
              supabase.from('app_orders').update({ item_name: finalProduct }).eq('id', item.order_id)
            );
          }
        }
      }

      const results = await Promise.all([
        supabase.from('dispatch_completed_log').insert(rowsToLog),
        ...updates
      ]);

      const errorRes = results.find(res => res.error);
      if (errorRes) throw errorRes.error;

      showToast('Dispatch marked as completed and updated!', 'success');
      setSelectedRows({});
      setEditData({});
      await fetchPendingOrders(true);
      await fetchHistory(true);
    } catch (error) {
      console.error('Save failed:', error);
      showToast('Error', `Failed to save dispatch completion: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchPendingOrders(true);
    fetchHistory(true);
    fetchMasterData();
  }, [fetchPendingOrders, fetchHistory, fetchMasterData]);

  const TableSkeleton = ({ cols = 10 }) => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden h-16">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden w-full">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  const MobileSkeleton = () => (
    <div className="md:hidden divide-y divide-gray-100">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-6 space-y-4 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-5 w-40 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-4 w-16 bg-primary/5 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="">
      <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-white/50 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Dispatch Completed</h1>
            <div className="flex bg-gray-100 p-1 rounded">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <CheckCircle size={16} />
                Pending
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <History size={16} />
                History
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
            />
            <div className="h-[42px]">
              <SearchableDropdown
                value={clientFilter}
                onChange={setClientFilter}
                options={allUniqueClients}
                allLabel="All Clients"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
            <div className="h-[42px]">
              <SearchableDropdown
                value={godownFilter}
                onChange={setGodownFilter}
                options={allUniqueGodowns}
                allLabel="All Godowns"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isSaving}
              className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-bold border border-gray-200 disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            {(searchTerm || clientFilter || godownFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setClientFilter('');
                  setGodownFilter('');
                }}
                className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-sm font-bold border border-green-100"
              >
                <X size={15} />
                Clear
              </button>
            )}
            {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
              <div className="flex items-center gap-2 sm:border-l sm:border-gray-200 sm:pl-3">
                <button
                  onClick={() => {
                    setSelectedRows({});
                    setEditData({});
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-white text-gray-700 rounded hover:bg-gray-50 transition-colors font-bold text-sm border border-gray-200"
                >
                  <X size={15} />
                  Cancel
                </button>
                <button
                  onClick={handleBulkCancelDispatch}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-4 h-[42px] bg-red-600 text-white rounded hover:bg-red-700 shadow-md font-bold text-sm shadow-red-500/20 transition-all"
                >
                  <XCircle size={15} />
                  Cancel Selected
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-5 h-[42px] bg-primary text-white rounded hover:bg-primary-hover shadow-md font-bold text-sm disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={16} />}
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(refreshingOrders || refreshingHistory) && (
        <div className="fixed top-0 left-0 w-full h-1 z-[101] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-progress-loading shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
        </div>
      )}

      <div className="bg-white rounded shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden max-w-[1200px] mx-auto">
        <div className="hidden md:block relative overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px] mx-0">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                {activeTab === 'pending' && <th className="px-6 py-4 text-center w-16">Action</th>}
                {[
                  { label: 'Dispatch No', key: 'dispatchNo' },
                  { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                  ...(activeTab === 'pending' ? [{ label: 'Order No', key: 'orderNumber' }] : []),
                  { label: 'Customer', key: activeTab === 'pending' ? 'clientName' : 'customer' },
                  { label: 'Product', key: activeTab === 'pending' ? 'itemName' : 'product' },
                  { label: 'Godown', key: activeTab === 'pending' ? 'godownName' : 'godown', align: 'center' },
                  { label: 'Order Qty', key: activeTab === 'pending' ? 'qty' : 'orderQty', align: 'right' },
                  { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                  { label: 'Complete Date', key: 'completeDate', align: 'center' },
                  { label: 'Status', key: 'status', align: 'center', minWidth: activeTab === 'pending' ? '140px' : '120px' },
                  ...(activeTab === 'pending' ? [{ label: 'CRM Name', key: 'crmName' }] : [])
                ].map((col) => (
                  <th
                    key={col.key}
                    className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : {}}
                    onClick={() => requestSort(col.key)}
                  >
                    <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.label}
                      <div className="flex flex-col">
                        <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-primary' : 'text-gray-300'} />
                        <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-primary' : 'text-gray-300'} />
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {loadingOrders || loadingHistory ? (
                <TableSkeleton cols={activeTab === 'pending' ? 12 : 9} />
              ) : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'pending' ? 12 : 9} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-50 rounded-full">
                        <ClipboardList size={32} className="text-gray-200" />
                      </div>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No items found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                  const itemId = item.id;
                  const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                  return (
                    <tr
                      key={itemId}
                      className={`transition-colors ${isSelected ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
                    >
                      {activeTab === 'pending' && (
                        <td className="px-6 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleCheckboxToggle(itemId)}
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-bold text-gray-900">{item.dispatchNo}</td>
                      <td className="px-6 py-4 text-gray-500 text-center text-xs font-medium">{formatDisplayDate(item.dispatchDate)}</td>
                      {activeTab === 'pending' && <td className="px-6 py-4 text-gray-600 text-xs font-medium">{item.orderNumber}</td>}
                      <td className="px-6 py-4 font-semibold text-gray-800">{item.clientName || item.customer}</td>
                      <td className={`px-6 py-4 text-gray-600 font-medium whitespace-nowrap relative ${isSelected ? 'z-[70]' : ''}`}>
                        {activeTab === 'pending' && isSelected ? (
                          <div className="w-64">
                            <SearchableDropdown
                              value={editData[itemId]?.product || item.itemName}
                              onChange={(val) => handleEditChange(itemId, 'product', val)}
                              options={itemNames}
                              placeholder="Select Product"
                              showAll={false}
                              focusColor="primary"
                              className="w-full"
                            />
                          </div>
                        ) : (
                          item.itemName || item.product
                        )}
                      </td>
                      <td className={`px-6 py-4 text-center font-bold text-gray-800 relative ${isSelected ? 'z-[60]' : ''}`}>
                        {activeTab === 'pending' && isSelected ? (
                          <div className="w-64 mx-auto">
                            <SearchableDropdown
                              value={editData[itemId]?.godown || item.godownName}
                              onChange={(val) => handleEditChange(itemId, 'godown', val)}
                              options={godowns}
                              placeholder="Select Godown"
                              showAll={false}
                              focusColor="green-800"
                              className="w-full"
                            />
                          </div>
                        ) : (
                          item.godownName || item.godown
                        )}
                      </td>
                      <td className="px-6 py-4 border-l border-gray-50 text-right text-xs font-medium text-gray-700">{item.qty || item.orderQty}</td>
                      <td className="px-6 py-4 border-l border-gray-50 text-right text-xs font-black text-primary bg-primary/5">
                        {activeTab === 'pending' && isSelected ? (
                          <input
                            type="text"
                            value={editData[itemId]?.dispatchQty || item.dispatchQty}
                            onChange={(e) => handleEditChange(itemId, 'dispatchQty', e.target.value)}
                            className="w-full px-1 py-0.5 border rounded text-xs outline-none focus:border-primary"
                          />
                        ) : (
                          item.dispatchQty
                        )}
                      </td>
                      {activeTab === 'pending' && (
                        <>
                          <td className={`px-6 py-4 text-center relative ${isSelected ? 'z-[50]' : ''}`}>
                            <input
                              type="date"
                              disabled={!isSelected}
                              value={editData[itemId]?.completeDate || ''}
                              onChange={(e) => handleEditChange(itemId, 'completeDate', e.target.value)}
                              className="px-1 py-0.5 border rounded text-xs outline-none focus:border-primary disabled:opacity-50"
                            />
                          </td>
                          <td className={`px-6 py-4 text-center relative ${isSelected ? 'z-[50]' : ''}`}>
                            <div className="relative group">
                              <select
                                disabled={!isSelected}
                                value={editData[itemId]?.status || 'Completed'}
                                onChange={(e) => handleEditChange(itemId, 'status', e.target.value)}
                                className={`w-full pl-3 pr-8 py-2 border border-gray-200 rounded text-xs font-semibold appearance-none bg-white transition-all shadow-sm ${isSelected
                                    ? 'cursor-pointer hover:border-primary focus:ring-primary focus:border-transparent outline-none'
                                    : 'bg-gray-50 opacity-70 cursor-not-allowed'
                                  }`}
                              >
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <ChevronDown size={14} />
                              </div>
                            </div>
                          </td>
                        </>
                      )}
                      {activeTab === 'history' && (
                        <>
                          <td className="px-6 py-4 text-gray-500 text-center text-[11px] font-bold">
                            {item.completedAt ? new Date(item.completedAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border border-green-200 shadow-sm">
                              {item.status}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === 'pending' && (
                        <td className="px-6 py-4 border-l border-gray-50 text-xs font-medium text-gray-500">
                          <div className="flex items-center justify-between gap-2">
                            <span>{item.crmName}</span>
                            <button
                              onClick={() => handleCancelDispatch(item)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Cancel Dispatch"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none opacity-30"></div>
        </div>

        <div className="md:hidden">
          {loadingOrders || loadingHistory ? (
            <MobileSkeleton />
          ) : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-gray-50 rounded-full">
                  <ClipboardList size={32} className="text-gray-200" />
                </div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No items found</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                const itemId = item.id;
                const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                return (
                  <div
                    key={activeTab === 'pending' ? `mp-${item.id}` : `mh-${item.id}`}
                    className={`p-4 space-y-4 transition-colors ${isSelected ? 'bg-green-50/50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch No</p>
                        <p className="font-bold text-gray-900 text-sm">{item.dispatchNo}</p>
                      </div>
                      {activeTab === 'pending' && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleCancelDispatch(item)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleCheckboxToggle(itemId)}
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-1"
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Customer</p>
                        <p className="font-semibold text-gray-800">{item.clientName || item.customer}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch Date</p>
                        <p className="text-gray-600">{formatDisplayDate(item.dispatchDate)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Product</p>
                        {activeTab === 'pending' && isSelected ? (
                          <SearchableDropdown
                            value={editData[itemId]?.product || item.itemName}
                            onChange={(val) => handleEditChange(itemId, 'product', val)}
                            options={itemNames}
                            placeholder="Select Product"
                            showAll={false}
                            focusColor="primary"
                            className="w-full"
                          />
                        ) : (
                          <p className="text-gray-700">{item.itemName || item.product}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Godown</p>
                        {activeTab === 'pending' && isSelected ? (
                          <SearchableDropdown
                            value={editData[itemId]?.godown || item.godownName}
                            onChange={(val) => handleEditChange(itemId, 'godown', val)}
                            options={godowns}
                            placeholder="Select Godown"
                            showAll={false}
                            focusColor="primary"
                            className="w-full"
                          />
                        ) : (
                          <p className="text-gray-700">{item.godownName || item.godown}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch Qty</p>
                        {activeTab === 'pending' && isSelected ? (
                          <input
                            type="text"
                            value={editData[itemId]?.dispatchQty || item.dispatchQty}
                            onChange={(e) => handleEditChange(itemId, 'dispatchQty', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-primary"
                          />
                        ) : (
                          <p className="font-black text-primary">{item.dispatchQty}</p>
                        )}
                      </div>
                      {activeTab === 'pending' && (
                        <>
                          <div>
                            <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Complete Date</p>
                            <input
                              type="date"
                              disabled={!isSelected}
                              value={editData[itemId]?.completeDate || ''}
                              onChange={(e) => handleEditChange(itemId, 'completeDate', e.target.value)}
                              className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-primary disabled:opacity-50"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DispatchComplete;