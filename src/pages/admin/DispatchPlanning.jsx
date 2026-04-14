import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Save, History, ClipboardList, X, ChevronUp, ChevronDown, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';



const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

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

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '-';
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

// ========== Skeleton Sub-components ==========

const TableSkeleton = ({ cols = 13 }) => (
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
  <div className="divide-y divide-gray-100">
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
          {[...Array(4)].map((_, j) => (
            <div key={j} className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {[...Array(4)].map((_, k) => (
            <div key={k} className="bg-gray-50 p-2 rounded space-y-1">
              <div className="h-2 w-8 bg-gray-100 rounded relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ========== Sort Icon ==========
const SortIcon = ({ column, sortConfig }) => (
  <div className="flex flex-col">
    <ChevronUp size={10} className={sortConfig.key === column && sortConfig.direction === 'asc' ? 'text-primary' : 'text-gray-300'} />
    <ChevronDown size={10} className={sortConfig.key === column && sortConfig.direction === 'desc' ? 'text-primary' : 'text-gray-300'} />
  </div>
);

// ========== Main Component ==========
const DispatchPlanning = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedRows, setSelectedRows] = useState({});
  const [editData, setEditData] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [orderNoFilter, setOrderNoFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [stockLocationFilter, setStockLocationFilter] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [orders, setOrders] = useState([]);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);

  const [godowns, setGodowns] = useState([]);
  const [itemNames, setItemNames] = useState([]);

  const pendingAbortRef = useRef(null);
  const historyAbortRef = useRef(null);

  // --- Fetch master data from Supabase ---
  const fetchMasterData = useCallback(async () => {
    try {
      const [productsRes, godownsRes] = await Promise.all([
        supabase.from('master_products').select('product_name').order('product_name'),
        supabase.from('master_godowns').select('godown_name').order('godown_name')
      ]);

      if (productsRes.error) throw productsRes.error;
      if (godownsRes.error) throw godownsRes.error;

      setItemNames((productsRes.data || []).map(p => p.product_name));
      setGodowns((godownsRes.data || []).map(g => g.godown_name));
    } catch (error) {
      console.error('Error fetching master data:', error);
      showToast('Error', 'Failed to load master data: ' + error.message);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  const fetchPendingOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingOrders(true);
    else setLoadingOrders(true);

    try {
      // 1. Fetch Orders and Stock Levels in parallel
      const [ordersRes, stockRes] = await Promise.all([
        supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_levels').select('item_name, godown_name, closing_stock')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (stockRes.error) throw stockRes.error;

      // 2. Create smart lookup map
      const stockMap = {};
      stockRes.data.forEach(s => {
        const key = `${String(s.item_name).trim().toLowerCase()}|${String(s.godown_name).trim().toLowerCase()}`;
        stockMap[key] = s.closing_stock;
      });

      // 3. Map orders and calculate real-time stock
      const mapped = (ordersRes.data || []).map((item, index) => {
        const stockKey = `${String(item.item_name || '').trim().toLowerCase()}|${String(item.godown_name || '').trim().toLowerCase()}`;
        const realTimeStock = stockMap[stockKey] !== undefined ? stockMap[stockKey] : '-';

        return {
          id: item.id,
          orderNo: item.order_number || '-',
          orderDate: item.order_date,
          clientName: item.client_name,
          godownName: item.godown_name,
          itemName: item.item_name,
          rate: item.rate,
          qty: item.qty || 0,
          currentStock: realTimeStock,
          intransitQty: item.intransit_qty || '0',
          planningQty: 0,
          planningPendingQty: item.qty || 0,
          qtyDelivered: 0,
          gstIncluded: item.gst_included || 'No',
          originalIndex: index
        };
      });

      setOrders(mapped);
    } catch (error) {
      console.error('fetchPendingOrders error:', error);
      showToast('Error', 'Failed to load pending orders: ' + error.message);
    } finally {
      setLoadingOrders(false);
      setRefreshingOrders(false);
    }
  }, [showToast]);

  const fetchPlanningHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingHistory(true);
    else setLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`
          *,
          order:app_orders(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(item => ({
        ...item,
        id: item.id,
        dispatchNo: item.dispatch_number || '-',
        orderNo: item.order?.order_number || '-',
        orderDate: item.order?.order_date,
        clientName: item.order?.client_name,
        itemName: item.order?.item_name,
        qty: item.order?.qty,
        dispatchQty: item.planned_qty,
        dispatchDate: item.planned_date,
        gstIncluded: item.gst_included,
        godownName: item.godown_name
      }));

      setDispatchHistory(mapped);
    } catch (error) {
      console.error('fetchPlanningHistory error:', error);
      showToast('Error', 'Failed to load planning history: ' + error.message);
    } finally {
      setLoadingHistory(false);
      setRefreshingHistory(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchPendingOrders();
    fetchPlanningHistory();
    return () => {
      if (pendingAbortRef.current) pendingAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
    };
  }, [fetchPendingOrders, fetchPlanningHistory]);

  useEffect(() => {
    setSelectedRows({});
    setEditData({});
  }, [activeTab]);

  const isRefreshing = refreshingOrders || refreshingHistory;

  const allUniqueClients = useMemo(
    () => [...new Set([...(orders || []).map(o => o.clientName), ...(dispatchHistory || []).map(h => h.clientName)])].sort(),
    [orders, dispatchHistory]
  );
  const allUniqueGodowns = useMemo(
    () => [...new Set([...(orders || []).map(o => o.godownName), ...(dispatchHistory || []).map(h => h.godownName)])].sort(),
    [orders, dispatchHistory]
  );
  const allUniqueOrderNos = useMemo(
    () => [...new Set([...(orders || []).map(o => o.orderNo), ...(dispatchHistory || []).map(h => h.orderNo)])].sort(),
    [orders, dispatchHistory]
  );
  const allUniqueItems = useMemo(
    () => [...new Set([...(orders || []).map(o => o.itemName), ...(dispatchHistory || []).map(h => h.itemName)])].sort(),
    [orders, dispatchHistory]
  );
  const allUniqueDates = useMemo(() => {
    const rawDates = [...new Set([
      ...(orders || []).map(o => o.orderDate),
      ...(dispatchHistory || []).map(h => h.orderDate)
    ])].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
    return rawDates.map(d => formatDisplayDate(d));
  }, [orders, dispatchHistory]);
  const allUniqueStockLocs = useMemo(() => {
    const locations = new Set();
    (orders || []).forEach(order => {
      if (order.currentStock) {
        String(order.currentStock).split(',').forEach(part => {
          const loc = part.split(':')[0].trim();
          if (loc) locations.add(loc);
        });
      }
    });
    return [...locations].sort();
  }, [orders]);








  const requestSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const handleBulkCancelOrder = async () => {
    const selectedIds = Object.keys(selectedRows).filter(key => selectedRows[key]);
    if (selectedIds.length === 0) return;

    if (!window.confirm(`Are you sure you want to permanently CANCEL the selected quantity for these ${selectedIds.length} items? \nThis will reduce the actual quantity in the Order table.`)) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
      let currentMaxNo = (plans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      const cancelRecords = [];
      const orderUpdates = [];

      for (const key of selectedIds) {
        const order = orders.find(o => getRowKey(o) === key);
        const planningData = editData[key];
        if (!order || !planningData) continue;

        const qtyToCancel = parseFloat(planningData.dispatchQty);
        if (isNaN(qtyToCancel) || qtyToCancel <= 0) continue;

        // 1. Prepare Order Update (subtract qty)
        const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', order.id).single();
        const currentTotalRecordQty = (parseFloat(currentOrder?.qty) || 0);
        const newOrderTotal = currentTotalRecordQty - qtyToCancel;

        orderUpdates.push(
          supabase.from('app_orders').update({ qty: newOrderTotal }).eq('id', order.id)
        );






        // 2. Prepare History Record
        currentMaxNo++;
        cancelRecords.push({
          order_id: String(order.id),
          dispatch_number: `DN-${currentMaxNo}-CXL`,
          planned_qty: Number(qtyToCancel),
          planned_date: now.split('T')[0],
          godown_name: String(planningData.godownName || order.godownName || '-'),
          status: 'Canceled',
          gst_included: planningData.gstIncluded || 'No',
          submitted_by: user?.name || 'System',
          dispatch_completed: true,
          informed_before_dispatch: true,
          informed_after_dispatch: true
        });
      }

      // 3. FIRST: Execute the bulk insert for history records
      const { error: insErr } = await supabase.from('dispatch_plans').insert(cancelRecords);
      if (insErr) throw insErr;

      // 4. ONLY IF SUCCESSFUL: Execute all order quantity reductions
      const updateResults = await Promise.all(orderUpdates);
      const updateErrors = updateResults.filter(r => r.error).map(r => r.error);
      if (updateErrors.length > 0) {
        console.error('Some order reductions failed:', updateErrors);
        // We still show success for what worked, or alert the user
      }

      showToast('Selected orders quantities permanently reduced.', 'success');
      await fetchPendingOrders(true);
      await fetchPlanningHistory(true);
      setSelectedRows({});
      setEditData({});
    } catch (err) {
      console.error('Bulk Cancel Error:', err);
      showToast('Error during bulk cancel', err.message || 'Check database connection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelOrder = async (order) => {
    const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for ${order.orderNo} (Max: ${order.planningPendingQty}):`, order.planningPendingQty);
    if (cancelQtyStr === null) return;

    const qtyToCancel = parseFloat(cancelQtyStr);
    if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
      showToast('Error', 'Please enter a valid quantity');
      return;
    }

    if (qtyToCancel > order.planningPendingQty + 0.001) {
      showToast('Error', 'Cannot cancel more than the remaining pending quantity');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
      const maxNo = (plans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);
      const newDNo = `DN-${maxNo + 1}-CXL`;

      const { data: currentOrderData } = await supabase.from('app_orders').select('qty').eq('id', order.id).single();
      const newOrderTotal = (parseFloat(currentOrderData?.qty) || 0) - qtyToCancel;

      // 1. FIRST: Track in dispatch_plans for history (Safety Lock)
      const { error } = await supabase.from('dispatch_plans').insert({
        order_id: order.id,
        dispatch_number: newDNo,
        planned_qty: qtyToCancel,
        planned_date: now.split('T')[0],
        godown_name: order.godownName || '-',
        status: 'Canceled',
        gst_included: order.gstIncluded || 'No',
        submitted_by: user?.name || 'System',
        dispatch_completed: true,
        informed_before_dispatch: true,
        informed_after_dispatch: true
      });
      if (error) throw error;

      // 2. SECOND: Permanently REDUCE the qty in the app_orders table
      const { error: ordErr } = await supabase
        .from('app_orders')
        .update({ qty: newOrderTotal })
        .eq('id', order.id);
      if (ordErr) throw ordErr;

      showToast('Order quantity permanently reduced successfully', 'success');
      await fetchPendingOrders(true);
    } catch (err) {
      console.error(err);
      showToast('Error', err.message);
    } finally {
      setIsSaving(false);
    }
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

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];

    // Group all plans by order_id and sum their quantities
    const plannedQtyMap = {};
    const deliveredQtyMap = {};

    (dispatchHistory || []).forEach(plan => {
      if (plan.order_id) {
        const qtyValue = parseFloat(plan.dispatchQty) || 0;

        // Exclude cancelled items from calculations as they are already removed from order qty in app_orders
        if (plan.status !== 'Canceled') {
          // Total Planned (everything except Canceled)
          plannedQtyMap[plan.order_id] = (plannedQtyMap[plan.order_id] || 0) + qtyValue;

          // Total Delivered (only if marked completed and NOT Canceled)
          if (plan.dispatch_completed) {
            deliveredQtyMap[plan.order_id] = (deliveredQtyMap[plan.order_id] || 0) + qtyValue;
          }
        }
      }
    });

    const filtered = orders.map(order => {
      const totalOrderQty = parseFloat(order.qty) || 0;
      const totalAlreadyPlanned = plannedQtyMap[order.id] || 0;
      const totalAlreadyDelivered = deliveredQtyMap[order.id] || 0;

      // The balance available to plan is what hasn't been put into a dispatch plan yet
      const remainingToPlan = totalOrderQty - totalAlreadyPlanned;

      return {
        ...order,
        qtyDelivered: totalAlreadyDelivered,
        planningPendingQty: remainingToPlan > 0 ? remainingToPlan : 0,
        alreadyPlannedSum: totalAlreadyPlanned
      };
    }).filter(order => {
      // CRITICAL: Show the order if there is still quantity left to plan (remaining > 0)
      const hasBalance = order.planningPendingQty > 0.001; // use small epsilon for float safety
      if (!hasBalance) return false;

      const matchesSearch = Object.values(order).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesClient = clientFilter === '' || order.clientName === clientFilter;
      const matchesGodown = godownFilter === '' || order.godownName === godownFilter;
      const matchesOrderNo = orderNoFilter === '' || order.orderNo === orderNoFilter;
      const matchesItem = itemFilter === '' || order.itemName === itemFilter;
      const matchesDate = dateFilter === '' || formatDisplayDate(order.orderDate) === dateFilter;
      const stockData = String(order.currentStock || '');
      const matchesStockLocation = stockLocationFilter === '' || stockData.toLowerCase().includes(stockLocationFilter.toLowerCase());
      return matchesSearch && matchesClient && matchesGodown && matchesOrderNo && matchesItem && matchesDate && matchesStockLocation;
    });
    return getSortedItems(filtered);
  }, [orders, dispatchHistory, searchTerm, clientFilter, godownFilter, orderNoFilter, itemFilter, dateFilter, stockLocationFilter, getSortedItems]);

  const filteredAndSortedHistory = useMemo(() => {
    if (!dispatchHistory) return [];
    const filtered = dispatchHistory.filter(item => {
      // Exclude skips (is_skip) and Canceled items from Planning history
      if (item.is_skip === true || item.status === 'Canceled') return false;
      // Show both Planned and Completed items that followed the normal planning route
      if (item.status !== 'Planned' && item.status !== 'Completed') return false;
      const matchesSearch = Object.values(item).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesClient = clientFilter === '' || item.clientName === clientFilter;
      const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
      const matchesOrderNo = orderNoFilter === '' || item.orderNo === orderNoFilter;
      const matchesItem = itemFilter === '' || item.itemName === itemFilter;
      const matchesDate = dateFilter === '' || formatDisplayDate(item.orderDate) === dateFilter;
      return matchesSearch && matchesClient && matchesGodown && matchesOrderNo && matchesItem && matchesDate;
    });
    return getSortedItems(filtered);
  }, [dispatchHistory, searchTerm, clientFilter, godownFilter, orderNoFilter, itemFilter, dateFilter, getSortedItems]);

  const getRowKey = useCallback((order) => `${order.orderNo}_${order.itemName}_${order.originalIndex}`, []);

  const handleCheckboxToggle = useCallback((order) => {
    const key = getRowKey(order);
    setSelectedRows(prev => {
      const isSelected = !prev[key];
      const next = { ...prev, [key]: isSelected };
      if (isSelected) {
        setEditData(prevEdit => ({
          ...prevEdit,
          [key]: {
            dispatchQty: order.planningPendingQty, // Use the remaining balance as default
            dispatchDate: new Date().toISOString().split('T')[0],
            gstIncluded: 'Yes',
            godownName: order.godownName
          }
        }));
      } else {
        setEditData(prevEdit => {
          const newEditData = { ...prevEdit };
          delete newEditData[key];
          return newEditData;
        });
      }
      return next;
    });
  }, [getRowKey]);

  const handleEditChange = useCallback((key, field, value) => {
    setEditData(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  }, []);

  const handleSave = useCallback(async () => {
    let currentMaxNo = (() => {
      const allNos = (dispatchHistory || [])
        .map(h => h.dispatchNo || h.dispatch_number)
        .filter(no => no && (no.startsWith('DSP') || no.startsWith('DN-')))
        .map(no => parseInt(String(no).replace(/^(DSP|DN-)/, ''), 10))
        .filter(n => !isNaN(n));
      return allNos.length > 0 ? Math.max(...allNos) : 1000;
    })();

    const plansToSubmit = [];

    Object.keys(selectedRows).forEach((key) => {
      if (selectedRows[key]) {
        const order = orders?.find(o => getRowKey(o) === key);
        const planningData = editData[key];
        if (order && planningData) {
          currentMaxNo++; // Increment for every single item to ensure uniqueness
          const individualDispatchNo = `DN-${currentMaxNo}`;

          plansToSubmit.push({
            order_id: order.id,
            dispatch_number: individualDispatchNo,
            planned_qty: parseInt(planningData.dispatchQty, 10) || 0,
            planned_date: planningData.dispatchDate,
            gst_included: planningData.gstIncluded,
            godown_name: planningData.godownName || order.godownName,
            status: 'Planned',
            submitted_by: user?.name || 'System'
          });
        }
      }
    });

    if (plansToSubmit.length === 0) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('dispatch_plans')
        .insert(plansToSubmit);

      if (error) throw error;

      showToast('Planning saved successfully!', 'success');
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 2500);
      await fetchPendingOrders(true);
      await fetchPlanningHistory(true);
      setSelectedRows({});
      setEditData({});

    } catch (error) {
      console.error('Save failed details:', error);
      showToast('Error', `Failed to save planning: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedRows, orders, editData, fetchPendingOrders, fetchPlanningHistory, showToast, getRowKey, user]);

  const handleRefresh = useCallback(() => {
    fetchPendingOrders(true);
    fetchPlanningHistory(true);
  }, [fetchPendingOrders, fetchPlanningHistory]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setClientFilter('');
    setGodownFilter('');
    setOrderNoFilter('');
    setItemFilter('');
    setDateFilter('');
    setStockLocationFilter('');
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectedRows({});
    setEditData({});
  }, []);

  const isAnySelected = Object.values(selectedRows).some(Boolean);

  return (
    <div className="">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-white/50 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Dispatch Planning</h1>
            <div className="flex bg-gray-100 p-1 rounded">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <ClipboardList size={16} />
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>

            {(searchTerm || clientFilter || godownFilter || orderNoFilter || itemFilter || dateFilter || stockLocationFilter) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-xs font-bold border border-green-100"
              >
                <X size={14} />
                Clear Filters
              </button>
            )}

            {activeTab === 'pending' && isAnySelected && (
              <div className="flex items-center gap-2 sm:border-l sm:border-gray-200 sm:pl-3">
                <button
                  onClick={handleCancelSelection}
                  className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded hover:bg-gray-50 transition-colors font-bold text-[13px] border border-gray-200"
                >
                  <X size={14} />
                  Clear Selection
                </button>
                <button
                  onClick={handleBulkCancelOrder}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-bold text-[13px] shadow-sm shadow-red-500/20"
                >
                  <XCircle size={14} />
                  Cancel Selected
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover shadow-md shadow-primary/20 font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed transition-all min-w-[100px]"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-primary focus:border-primary"
          />
          <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="w-full" />
          <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="w-full" />
          <SearchableDropdown value={orderNoFilter} onChange={setOrderNoFilter} options={allUniqueOrderNos} allLabel="All Order No" className="w-full" focusColor="primary" />
          <SearchableDropdown value={itemFilter} onChange={setItemFilter} options={allUniqueItems} allLabel="All Items" className="w-full" focusColor="primary" />
          <SearchableDropdown value={dateFilter} onChange={setDateFilter} options={allUniqueDates} allLabel="All Dates" className="w-full" focusColor="primary" />
          <SearchableDropdown value={stockLocationFilter} onChange={setStockLocationFilter} options={allUniqueStockLocs} allLabel="Stock Loc" className="w-full" focusColor="primary" />
        </div>
      </div>

      {/* Progress bar on refresh */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 w-full h-1 z-[101] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-progress-loading shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
        </div>
      )}

      {/* Success overlay */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white px-10 py-8 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col items-center gap-5 animate-in zoom-in-95 fade-in duration-300 border border-gray-100">
            <div className="h-16 w-16 bg-green-100/50 rounded-full flex items-center justify-center relative">
              <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
              <CheckCircle className="w-8 h-8 text-green-600 relative z-10" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-gray-900">Planning Saved Successfully</h3>
              <p className="text-xs font-medium text-gray-500">The dispatch planning has been successfully updated.</p>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden max-w-[1200px] mx-auto">

        {/* ==================== PENDING TAB ==================== */}
        {activeTab === 'pending' ? (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block relative overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[1400px] mx-0">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                    <th className="px-6 py-4 text-center">Action</th>
                    {isAnySelected && (
                      <>
                        <th className="px-6 py-4 animate-column text-right">Dispatch Qty</th>
                        <th className="px-6 py-4 animate-column text-center">Dispatch Date</th>
                        <th className="px-6 py-4 animate-column text-center">GST</th>
                        <th className="px-6 py-4 animate-column text-center">Dispatch Godown</th>
                      </>
                    )}
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('orderNo')}>
                      <div className="flex items-center gap-1">Order No <SortIcon column="orderNo" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-center" onClick={() => requestSort('orderDate')}>
                      <div className="flex items-center gap-1 justify-center">Order Date <SortIcon column="orderDate" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('clientName')}>
                      <div className="flex items-center gap-1">Client Name <SortIcon column="clientName" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-center" onClick={() => requestSort('godownName')}>
                      <div className="flex items-center gap-1 justify-center">Godown <SortIcon column="godownName" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('itemName')}>
                      <div className="flex items-center gap-1">Item Name <SortIcon column="itemName" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('rate')}>
                      <div className="flex items-center gap-1 justify-end">Rate <SortIcon column="rate" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('qty')}>
                      <div className="flex items-center gap-1 justify-end">Order Qty <SortIcon column="qty" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('currentStock')}>
                      <div className="flex items-center gap-1 justify-end">Current Stock <SortIcon column="currentStock" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('intransitQty')}>
                      <div className="flex items-center gap-1 justify-end">Intransit Qty <SortIcon column="intransitQty" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('planningQty')}>
                      <div className="flex items-center gap-1 justify-end">Planning Qty <SortIcon column="planningQty" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('planningPendingQty')}>
                      <div className="flex items-center gap-1 justify-end">Remaining Planning Qty <SortIcon column="planningPendingQty" sortConfig={sortConfig} /></div>
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 text-right" onClick={() => requestSort('qtyDelivered')}>
                      <div className="flex items-center gap-1 justify-end">Qty Delivered <SortIcon column="qtyDelivered" sortConfig={sortConfig} /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {loadingOrders ? (
                    <TableSkeleton cols={isAnySelected ? 17 : 13} />
                  ) : filteredAndSortedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={isAnySelected ? 17 : 13} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-4 bg-gray-50 rounded-full">
                            <ClipboardList size={32} className="text-gray-200" />
                          </div>
                          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No pending orders found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedOrders.map((order) => {
                      const key = getRowKey(order);
                      return (
                        <tr key={key} className={`group ${selectedRows[key] ? 'bg-green-50/50' : 'hover:bg-gray-50'} transition-all duration-300`}>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={!!selectedRows[key]}
                              onChange={() => handleCheckboxToggle(order)}
                              className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            />
                          </td>
                          {isAnySelected && (
                            <>
                              <td className="px-6 py-4 animate-column text-right">
                                {selectedRows[key] ? (
                                  <input
                                    type="number"
                                    value={editData[key]?.dispatchQty || ''}
                                    onChange={(e) => handleEditChange(key, 'dispatchQty', e.target.value)}
                                    className="w-20 px-2 py-1 border rounded text-xs outline-none focus:border-primary text-right"
                                  />
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 animate-column text-center">
                                {selectedRows[key] ? (
                                  <input
                                    type="date"
                                    value={editData[key]?.dispatchDate || ''}
                                    onChange={(e) => handleEditChange(key, 'dispatchDate', e.target.value)}
                                    className="px-2 py-1 border rounded text-xs outline-none focus:border-primary"
                                  />
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 animate-column text-center">
                                {selectedRows[key] ? (
                                  <select
                                    value={editData[key]?.gstIncluded || ''}
                                    onChange={(e) => handleEditChange(key, 'gstIncluded', e.target.value)}
                                    className="px-2 py-1 border rounded text-xs outline-none focus:border-primary"
                                  >
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                  </select>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 animate-column text-center">
                                {selectedRows[key] ? (
                                  <div className="w-full min-w-[150px]">
                                    <SearchableDropdown
                                      value={editData[key]?.godownName || order.godownName}
                                      onChange={(val) => handleEditChange(key, 'godownName', val)}
                                      options={godowns}
                                      placeholder="Select Godown"
                                      showAll={false}
                                      focusColor="primary"
                                      className="w-full h-8"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 font-bold text-gray-900">{order.orderNo}</td>
                          <td className="px-6 py-4 text-center text-[11px] font-black uppercase text-gray-500">{formatDisplayDate(order.orderDate)}</td>
                          <td className="px-6 py-4 font-bold text-gray-800">{order.clientName}</td>
                          <td className="px-6 py-4 text-center font-medium text-gray-600">{order.godownName}</td>
                          <td className="px-6 py-4 font-semibold text-gray-700">{order.itemName}</td>
                          <td className="px-6 py-4 text-right text-slate-500 font-medium">₹{order.rate}</td>
                          <td className="px-6 py-4 text-right font-black text-primary text-base">{order.qty}</td>
                          <td className="px-6 py-4 text-right text-xs font-bold text-gray-500 bg-slate-50/50">{order.currentStock || '-'}</td>
                          <td className="px-6 py-4 text-right font-bold text-gray-500">{order.intransitQty || '0'}</td>
                          <td className="px-6 py-4 text-right font-bold text-gray-500">{order.planningQty || '0'}</td>
                          <td className="px-6 py-4 text-right font-bold text-primary">{order.planningPendingQty || '0'}</td>
                          <td className="px-6 py-4 text-right font-bold text-green-600">{order.qtyDelivered || '0'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none opacity-30"></div>
            </div>

            {/* ---- Mobile Card View for Pending ---- */}
            <div className="md:hidden divide-y divide-gray-200">
              {loadingOrders ? (
                /* FIX: Mobile skeleton now shown when loadingOrders is true */
                <MobileSkeleton />
              ) : filteredAndSortedOrders.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center gap-4">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <ClipboardList size={32} className="text-gray-200" />
                  </div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No items found matching your filters.</p>
                </div>
              ) : (
                filteredAndSortedOrders.map((order) => {
                  const key = getRowKey(order);
                  return (
                    <div key={key} className={`p-4 space-y-4 ${selectedRows[key] ? 'bg-green-50/30' : 'bg-white'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!selectedRows[key]}
                            onChange={() => handleCheckboxToggle(order)}
                            className="mt-1 rounded text-primary focus:ring-primary w-5 h-5"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-gray-900">{order.clientName}</h4>
                            <p className="text-[10px] mt-1 text-gray-500">Order: {order.orderNo} | {order.itemName}</p>
                          </div>
                        </div>
                      </div>

                      {selectedRows[key] && (
                        <div className="grid grid-cols-2 gap-3 bg-green-50/50 p-3 rounded border border-green-100">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Dispatch Date</label>
                            <input
                              type="date"
                              value={editData[key]?.dispatchDate || ''}
                              onChange={(e) => handleEditChange(key, 'dispatchDate', e.target.value)}
                              className="w-full px-3 py-1.5 border border-green-200 rounded text-xs outline-none focus:border-primary bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Disp Qty</label>
                            <input
                              type="number"
                              value={editData[key]?.dispatchQty || ''}
                              onChange={(e) => handleEditChange(key, 'dispatchQty', e.target.value)}
                              className="w-full px-3 py-1.5 border border-green-200 rounded text-xs outline-none focus:border-primary bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-primary mb-1 uppercase">GST</label>
                            <select
                              value={editData[key]?.gstIncluded || ''}
                              onChange={(e) => handleEditChange(key, 'gstIncluded', e.target.value)}
                              className="w-full px-3 py-1.5 border border-green-200 rounded text-xs outline-none focus:border-primary bg-white"
                            >
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-primary mb-1 uppercase">Godown Name</label>
                            <SearchableDropdown
                              value={editData[key]?.godownName || order.godownName}
                              onChange={(val) => handleEditChange(key, 'godownName', val)}
                              options={godowns}
                              placeholder="Select Godown"
                              showAll={false}
                              focusColor="primary"
                              className="w-full h-8"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-2 text-[10px] text-gray-500 pt-2 border-t border-gray-50">
                        <div>
                          <p className="uppercase text-[8px] font-bold text-gray-400">Rate</p>
                          <p className="font-bold text-gray-700">{order.rate}</p>
                        </div>
                        <div>
                          <p className="uppercase text-[8px] font-bold text-gray-400">Order Qty</p>
                          <p className="font-bold text-primary">{order.qty}</p>
                        </div>
                        <div>
                          <p className="uppercase text-[8px] font-bold text-gray-400">Godown</p>
                          <p className="font-bold text-gray-700 truncate">{order.godownName}</p>
                        </div>
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          <p className="uppercase text-[8px] font-bold text-gray-400">Stock</p>
                          <p className="font-bold text-gray-700 leading-tight">{order.currentStock || '-'}</p>
                        </div>
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          <p className="uppercase text-[8px] font-bold text-gray-400">Intransit</p>
                          <p className="font-bold text-gray-700">{order.intransitQty || '0'}</p>
                        </div>
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          <p className="uppercase text-[8px] font-bold text-gray-400">Plan Qty</p>
                          <p className="font-bold text-gray-700">{order.planningQty || '0'}</p>
                        </div>
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          <p className="uppercase text-[8px] font-bold text-gray-400">Plan Pend</p>
                          <p className="font-bold text-gray-700">{order.planningPendingQty || '0'}</p>
                        </div>
                        <div className="bg-gray-50 p-1 rounded border border-gray-100">
                          <p className="uppercase text-[8px] font-bold text-gray-400">Delivered</p>
                          <p className="font-bold text-gray-700">{order.qtyDelivered || '0'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (

          // ==================== HISTORY TAB ====================
          <>
            {/* Desktop Table */}
            <div className="hidden md:block relative overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[1200px] mx-0">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                    {[
                      { label: 'Order No', key: 'orderNo' },
                      { label: 'Dispatch No', key: 'dispatchNo' },
                      { label: 'Disp Qty', key: 'dispatchQty', align: 'right' },
                      { label: 'Disp Date', key: 'dispatchDate', align: 'center' },
                      { label: 'GST', key: 'gstIncluded', align: 'center' },
                      { label: 'Client', key: 'clientName' },
                      { label: 'Godown', key: 'godownName', align: 'center' },
                      { label: 'Order Date', key: 'orderDate', align: 'center' },
                      { label: 'Item Name', key: 'itemName' },
                      { label: 'Rate', key: 'rate', align: 'right' },
                      { label: 'Qty', key: 'qty', align: 'right' }
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                        onClick={() => requestSort(col.key)}
                      >
                        <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                          {col.label}
                          <SortIcon column={col.key} sortConfig={sortConfig} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm italic">
                  {loadingHistory ? (
                    <TableSkeleton cols={11} />
                  ) : filteredAndSortedHistory.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-4 bg-gray-50 rounded-full">
                            <History size={32} className="text-gray-200" />
                          </div>
                          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No planning history found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedHistory.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4 font-medium text-gray-500">{item.orderNo}</td>
                        <td className="px-6 py-4 font-bold text-primary">{item.dispatchNo}</td>
                        <td className="px-6 py-4 font-black text-right text-base text-gray-800">{item.dispatchQty}</td>
                        <td className="px-6 py-4 text-center text-[11px] font-black uppercase text-gray-500">{formatDisplayDate(item.dispatchDate)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${item.gstIncluded === 'Yes' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            GST: {item.gstIncluded}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-800">{item.clientName}</td>
                        <td className="px-6 py-4 text-center font-medium text-gray-600">{item.godownName}</td>
                        <td className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase">{formatDisplayDate(item.orderDate)}</td>
                        <td className="px-6 py-4 font-semibold text-gray-700">{item.itemName}</td>
                        <td className="px-6 py-4 text-right text-slate-400 font-medium">₹{item.rate}</td>
                        <td className="px-6 py-4 text-right font-black text-gray-400">{item.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none opacity-30"></div>
            </div>

            {/* Mobile Card View for History */}
            <div className="md:hidden divide-y divide-gray-200">
              {loadingHistory ? (
                <MobileSkeleton />
              ) : filteredAndSortedHistory.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <History size={32} className="text-gray-200" />
                  </div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">History is empty</p>
                </div>
              ) : (
                filteredAndSortedHistory.map((item, idx) => (
                  <div key={idx} className="p-6 space-y-4 hover:bg-slate-50 transition-colors bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">{item.dispatchNo}</p>
                        <h4 className="text-lg font-black text-gray-900 leading-tight">{item.clientName}</h4>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Order: {item.orderNo} | {item.itemName}</p>
                      </div>
                      <div className="text-right">
                        <span className="block px-3 py-1 bg-primary text-white rounded-lg text-sm font-black tracking-tighter shadow-sm">
                          {item.dispatchQty}
                        </span>
                        <span className="block text-[9px] font-black text-gray-300 uppercase tracking-tighter mt-1">Disp Qty</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[11px] bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em]">Disp Date</span>
                        <span className="font-bold text-gray-700">{formatDisplayDate(item.dispatchDate)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em]">GST</span>
                        <span className="font-bold text-gray-700">{item.gstIncluded === 'Yes' ? 'Included' : 'Excluded'}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em]">Godown</span>
                        <span className="font-bold text-gray-700">{item.godownName}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em]">Rate</span>
                        <span className="font-bold text-gray-700">₹{item.rate}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .animate-column {
            animation: fadeIn 0.3s ease-out forwards;
          }
        `
      }} />
    </div>
  );
};

export default DispatchPlanning;