import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, X, Save, ChevronUp, ChevronDown, RefreshCw, Search, CheckCircle, Trash2, XCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import SearchableDropdown from '../../components/SearchableDropdown';
import { supabase } from '../../supabaseClient';

const Order = () => {
  const calculateNextOrderNo = (existingOrders) => {
    const allNumbers = (existingOrders || [])
      .map(o => o.orderNumber || o.order_number)
      .filter(no => no && String(no).startsWith('VPR/OR-'))
      .map(no => parseInt(String(no).split('-')[1], 10))
      .filter(n => !isNaN(n));
    
    const maxNo = allNumbers.length > 0 ? Math.max(...allNumbers) : 100;
    return `VPR/OR-${maxNo + 1}`;
  };

  const { showToast } = useToast();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    clientName: '',
    items: [{ itemName: '', rate: '', qty: '', godownName: '' }],
    orderNo: ''
  });

  const [itemNames, setItemNames] = useState([]);
  const [clients, setClients] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [initialLoading, setInitialLoading] = useState(true);

  // --- External Sheets Data ---
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingIntransit, setLoadingIntransit] = useState(false);
  const [stockDataMap, setStockDataMap] = useState({});
  const [intransitDataMap, setIntransitDataMap] = useState({});
  const [productGodownMap, setProductGodownMap] = useState({});

  const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
  const MASTER_URL = import.meta.env.VITE_MASTER_URL;
  const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;
  const STOCK_LIST_API = import.meta.env.VITE_STOCK_LIST_API;
  const INDENT_API = import.meta.env.VITE_INDENT_API;

  const abortControllerRef = useRef(null);

  const normalize = useCallback((str) =>
    String(str || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9*]/g, ''), 
    []);

  const fetchAllRows = useCallback(async (table, columns, orderCol) => {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .order(orderCol)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      allData = allData.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allData;
  }, []);

  const fetchStockData = useCallback(async () => {
    setLoadingStock(true);
    try {
      const allStock = await fetchAllRows('stock_levels', 'item_name, godown_name, closing_stock', 'item_name');

      const sMap = {};
      allStock.forEach(row => {
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
  }, [fetchAllRows, normalize]);

  const fetchOrdersData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshingOrders(true);
    else setIsLoadingOrders(true);

    try {
      const [ordersRes, cancelRes] = await Promise.all([
        supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('dispatch_plans').select('order_id, planned_qty').eq('status', 'Canceled')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (cancelRes.error) throw cancelRes.error;

      const cancelMap = {};
      cancelRes.data.forEach(c => {
        if (c.order_id) {
          cancelMap[c.order_id] = (cancelMap[c.order_id] || 0) + (parseFloat(c.planned_qty) || 0);
        }
      });
      
      const mappedOrders = (ordersRes.data || []).map((item) => {
        return {
          id: item.id,
          orderNumber: item.order_number || '-',
          clientName: item.client_name || '-',
          orderDate: item.order_date || '-',
          godownName: item.godown_name || '-',
          itemName: item.item_name || '-',
          rate: item.rate || '0',
          qty: item.qty || '0',
          canceledQty: cancelMap[item.id] || 0,
          planning: '0',
          remaining: item.qty || '0',
          createdBy: item.submittedby || '-'
        };
      });

      setOrders(mappedOrders);
      
      fetchStockData();

      setFormData(prev => ({
          ...prev,
          orderNo: calculateNextOrderNo(mappedOrders)
      }));
    } catch (error) {
      console.error('fetchOrdersData error:', error);
      showToast('Error', 'Failed to load orders: ' + error.message);
    } finally {
      setIsLoadingOrders(false);
      setIsRefreshingOrders(false);
      setInitialLoading(false);
    }
  }, [showToast, fetchStockData]);

  const fetchMasterData = useCallback(async () => {
    try {
      const [productsData, customersData, godownsData] = await Promise.all([
        fetchAllRows('master_products', 'product_name, godown_name', 'product_name'),
        fetchAllRows('master_customers', 'customer_name', 'customer_name'),
        fetchAllRows('master_godowns', 'godown_name', 'godown_name'),
      ]);

      const mapping = {};
      productsData.forEach(p => {
        if (p.product_name) mapping[p.product_name] = p.godown_name;
      });
      setProductGodownMap(mapping);

      setItemNames(productsData.map(p => p.product_name));
      setClients(customersData.map(c => c.customer_name));
      setGodowns(godownsData.map(g => g.godown_name));
    } catch (error) {
      console.error('fetchMasterData error:', error);
      showToast('Error', 'Failed to load master data: ' + error.message);
    }
  }, [showToast, fetchAllRows]);

  useEffect(() => {
    fetchOrdersData();
    fetchMasterData();
  }, [fetchOrdersData, fetchMasterData]);

  const handleRefresh = useCallback(() => {
    fetchOrdersData(true);
    fetchMasterData();
  }, [fetchOrdersData, fetchMasterData]);

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

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
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

      if (sortConfig.key === 'orderDate') {
        const aDate = new Date(aVal);
        const bDate = new Date(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
        }
      }

      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const filterClients = useMemo(() => [...new Set(orders?.map(o => o.clientName) || [])].filter(Boolean).sort(), [orders]);
  const filterGodowns = useMemo(() => [...new Set(orders?.map(o => o.godownName) || [])].filter(Boolean).sort(), [orders]);

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];
    const filtered = orders.map(order => {
      const itemKey = normalize(order.itemName);
      
      let stockValues = stockDataMap[itemKey];
      if (!stockValues) {
          const stockEntry = Object.keys(stockDataMap).find(key =>
            itemKey.includes(key) || key.includes(itemKey)
          );
          if (stockEntry) stockValues = stockDataMap[stockEntry];
      }
      
      const allStockInfo = stockValues ? stockValues.join(', ') : '-';
      
      return {
        ...order,
        currentStock: allStockInfo,
        intransitQty: intransitDataMap[`${itemKey}|${String(order.godownName || "").trim().toLowerCase()}`] !== undefined ? intransitDataMap[`${itemKey}|${String(order.godownName || "").trim().toLowerCase()}`] : '0'
      };
    }).filter(order => {
      const matchesSearch = Object.values(order).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesClient = !clientFilter || order.clientName === clientFilter;
      const matchesGodown = !godownFilter || order.godownName === godownFilter;
      return matchesSearch && matchesClient && matchesGodown;
    });
    return getSortedItems(filtered);
  }, [orders, searchTerm, clientFilter, godownFilter, stockDataMap, intransitDataMap, getSortedItems]);

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { itemName: '', rate: '', qty: '', godownName: '' }]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index][field] = value;

      if (field === 'itemName' && value && productGodownMap[value]) {
        newItems[index].godownName = productGodownMap[value];
      }

      return { ...prev, items: newItems };
    });
  };

  const handleCancelOrder = async (order) => {
    const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for Order ${order.orderNumber} (Max: ${order.qty}):`, order.qty);
    if (cancelQtyStr === null) return;
    
    const qtyToCancel = parseFloat(cancelQtyStr);
    if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
      showToast('Error', 'Please enter a valid quantity');
      return;
    }

    if (qtyToCancel > parseFloat(order.qty) + 0.001) {
      showToast('Error', 'Cannot cancel more than the remaining order quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
      const maxNo = (plans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);
      
      const newDNo = `DN-${maxNo + 1}-CXL`;

      const { error: insErr } = await supabase.from('dispatch_plans').insert({
        order_id: order.id,
        dispatch_number: newDNo,
        planned_qty: qtyToCancel,
        planned_date: now.split('T')[0],
        godown_name: order.godownName || '-',
        status: 'Canceled',
        dispatch_completed: true,
        informed_before_dispatch: true,
        informed_after_dispatch: true
      });

      if (insErr) throw insErr;

      const newOrderTotal = (parseFloat(order.qty) || 0) - qtyToCancel;
      const { error: ordErr } = await supabase
        .from('app_orders')
        .update({ qty: newOrderTotal })
        .eq('id', order.id);
      
      if (ordErr) {
        throw ordErr;
      }

      showToast('Order quantity canceled and record created successfully', 'success');
      await fetchOrdersData(true);
    } catch (err) {
      console.error(err);
      showToast('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const rowsToInsert = formData.items.map(item => ({
        order_date: formData.orderDate,
        client_name: formData.clientName,
        godown_name: item.godownName || '-',
        order_number: formData.orderNo,
        item_name: item.itemName,
        rate: parseFloat(item.rate) || 0,
        qty: parseInt(item.qty, 10) || 0,
        submittedby: user?.name || user?.id || 'Unknown'
      }));

      const { error } = await supabase
        .from('app_orders')
        .insert(rowsToInsert);

      if (error) throw error;

      setShowSuccessOverlay(true);
      setFormData(prev => ({
        orderDate: new Date().toISOString().split('T')[0],
        clientName: '',
        items: [{ itemName: '', rate: '', qty: '', godownName: '' }],
        orderNo: calculateNextOrderNo(orders)
      }));
      setIsModalOpen(false);

      await fetchOrdersData(true);
      setTimeout(() => setShowSuccessOverlay(false), 2500);
    } catch (error) {
      console.error('Submit error details:', error);
      let errorMsg = error.message || 'Unknown error';
      if (error.code === '23505') {
          errorMsg = `Duplicate Order Number: The number "${formData.orderNo}" is already in use. Please use a different number.`;
      }
      showToast('Error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const TableSkeleton = () => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden">
          {[...Array(14)].map((_, colIdx) => (
             <td key={colIdx} className="px-6 py-4">
               <div className="h-4 w-full max-w-[100px] bg-gray-100 rounded-lg relative overflow-hidden">
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
              <div className="h-4 w-24 bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-20 bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <div className="col-span-2 space-y-2">
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
      <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-gray-100 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Orders</h1>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Manage Dispatch Orders</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
            <input
              type="text"
              placeholder="Search by Client, Godown or Order Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
            />
            <div className="h-[42px]">
              <SearchableDropdown
                value={clientFilter}
                onChange={setClientFilter}
                options={filterClients}
                allLabel="All Clients"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
            <div className="h-[42px]">
              <SearchableDropdown
                value={godownFilter}
                onChange={setGodownFilter}
                options={filterGodowns}
                allLabel="All Godowns"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshingOrders}
              className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-bold border border-gray-200 disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshingOrders ? 'animate-spin' : ''} />
              Refresh
            </button>

            {(searchTerm || clientFilter || godownFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setClientFilter(''); setGodownFilter(''); }}
                className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-sm font-bold border border-green-100"
              >
                <X size={15} />
                Clear
              </button>
            )}

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 px-5 h-[42px] bg-primary text-white rounded shadow-md shadow-primary/20 hover:bg-primary-hover font-bold text-sm transition-all flex-1 sm:flex-none ml-auto sm:ml-0"
            >
              <Plus size={16} className="stroke-[3]" />
              New Order
            </button>
          </div>
        </div>
      </div>

      {(isLoadingOrders || isRefreshingOrders) && !initialLoading && (
        <div className="fixed top-0 left-0 w-full h-1 z-[101] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-progress-loading shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
        </div>
      )}

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white px-10 py-8 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col items-center gap-5 animate-in zoom-in-95 fade-in duration-300 border border-gray-100">
            <div className="h-16 w-16 bg-green-100/50 rounded-full flex items-center justify-center relative">
              <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
              <CheckCircle className="w-8 h-8 text-green-600 relative z-10" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-gray-900">Order Saved Successfully</h3>
              <p className="text-xs font-medium text-gray-500">Your order has been added to the dispatch queue.</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden max-w-[1200px] mx-auto">
        <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 backdrop-blur-sm border-b border-gray-100 text-[10px] uppercase text-gray-400 font-black tracking-widest sticky top-0 z-10 shadow-sm">
              <tr>
                {[
                  { label: 'Order No', key: 'orderNumber' },
                  { label: 'Client Name', key: 'clientName' },
                  { label: 'Item Name', key: 'itemName' },
                  { label: 'Godown', key: 'godownName' },
                  { label: 'Order Qty', key: 'qty', align: 'center' }, // Changed to center
                  // { label: 'Remaining', key: 'remaining', align: 'center' }, // Changed to center
                  { label: 'Current Stock', key: 'currentStock', align: 'center' }, // Changed to center
                  // { label: 'Planning', key: 'planning', align: 'center' }, // Changed to center
                  { label: 'Order Date', key: 'orderDate', align: 'center' },
                  { label: 'Rate', key: 'rate', align: 'center' }, // Changed to center
                  { label: 'Canceled Qty', key: 'canceledQty', align: 'center' }, // Changed to center
                  { label: 'Intransit', key: 'intransitQty', align: 'center' }, // Changed to center
                  { label: 'Submitted By', key: 'createdBy', align: 'center' },
                  { label: ' total Order Qty', key: 'totalQty', align: 'center' }, // Changed to center
                ].map((col) => (
                  <th
                    key={col.key}
                    className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    onClick={() => requestSort(col.key)}
                  >
                    <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
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
            <tbody className="divide-y divide-gray-200">
              {(isLoadingOrders || isRefreshingOrders) ? (
                <TableSkeleton />
              ) : filteredAndSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-50 rounded-full">
                        <Search size={32} className="text-gray-200" />
                      </div>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No orders found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedOrders.map((order, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50 transition-all duration-300">
                    <td className="px-6 py-4 font-bold text-primary relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-primary group-hover:h-8 transition-all duration-300 rounded-r-full"></div>
                      {order.orderNumber}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">{order.clientName}</td>
                    <td className="px-6 py-4 text-gray-800 font-semibold">{order.itemName}</td>
                    <td className="px-6 py-4 text-gray-600 font-medium">{order.godownName}</td>
                    <td className="px-6 py-4 text-center font-black text-primary text-base">{order.qty}</td> {/* text-center */}
                    {/* <td className="px-6 py-4 text-center font-medium text-gray-600">{order.remaining}</td> text-center */}
                    <td className="px-6 py-4 text-gray-500 text-[10px] font-bold text-center bg-slate-50/50"> {/* text-center */}
                      {loadingStock ? (
                        <RefreshCw size={12} className="animate-spin inline text-primary/40" />
                      ) : (
                        order.currentStock
                      )}
                    </td>
                    {/* <td className="px-6 py-4 text-center font-medium text-gray-600">{order.planning}</td> text-center */}
                    <td className="px-6 py-4 text-gray-500 text-[11px] font-black uppercase text-center">{formatDisplayDate(order.orderDate)}</td>
                    <td className="px-6 py-4 font-medium text-center text-slate-500">₹{order.rate}</td> {/* text-center */}
                    <td className="px-6 py-4 text-center font-black text-red-500 text-sm italic">{order.canceledQty > 0 ? `${order.canceledQty}` : '0'}</td> {/* text-center and minus symbol */}
                    <td className="px-6 py-4 text-gray-500 text-[11px] font-bold text-center"> {/* text-center */}
                      {loadingIntransit ? (
                        <RefreshCw size={12} className="animate-spin inline text-primary/40" />
                      ) : (
                        order.intransitQty
                      )}
                    </td>
                    <td className="px-6 py-4 text-[10px] text-center text-gray-400 font-bold uppercase tracking-tighter italic whitespace-nowrap">{order.createdBy}</td>
                     <td className="px-6 py-4 text-center font-black text-primary text-base">{order.qty+order.canceledQty}</td> {/* text-center */}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleCancelOrder(order)}
                        className="p-1.5 text-red-100 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                        title="Cancel Order Quantity"
                      >
                        
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                  
                  
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-200">
          {(isLoadingOrders || isRefreshingOrders) ? (
            <MobileSkeleton />
          ) : filteredAndSortedOrders.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="p-4 bg-gray-50 rounded-full">
                <Search size={32} className="text-gray-200" />
              </div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No records matching your filters</p>
            </div>
          ) : (
            filteredAndSortedOrders.map((order, idx) => (
              <div key={idx} className="p-6 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-gray-900 text-lg leading-tight">{order.clientName}</h4>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{order.godownName}</p>
                  </div>
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-tighter">
                    #{order.orderNumber}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="col-span-2">
                    <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1 leading-none">Ordered Item</p>
                    <p className="font-bold text-gray-800 text-sm">{order.itemName}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1 leading-none">Rate</p>
                    <p className="font-black text-gray-700">₹{order.rate}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1">Order Qty</p>
                    <p className="font-black text-primary text-lg">{order.qty}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-red-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Rejected</p>
                    <p className="font-black text-red-500 text-lg">{order.canceledQty > 0 ? `${order.canceledQty}` : '0'}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Stock</p>
                    <p className="font-black text-gray-700 text-lg">
                       {loadingStock ? <RefreshCw size={14} className="animate-spin text-primary/40" /> : (order.currentStock || '-')}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Intransit</p>
                    <p className="font-black text-gray-700 text-lg">
                       {loadingIntransit ? <RefreshCw size={14} className="animate-spin text-primary/40" /> : (order.intransitQty || '0')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-gray-500 uppercase">
                      {order.createdBy.charAt(0)}
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">{order.createdBy}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDisplayDate(order.orderDate)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 transition-all duration-300">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />
          <div className="relative bg-white sm:rounded-xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl lg:max-w-5xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <Plus size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">New Order</h2>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Fill in the order details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 transition-colors bg-gray-50 hover:bg-gray-100 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 custom-scrollbar bg-gray-50/30">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Order Date</label>
                    <input
                      type="date"
                      required
                      value={formData.orderDate}
                      onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Order Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VPR/OR-484"
                      value={formData.orderNo}
                      onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm font-bold text-primary"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Client Selection</label>
                    <SearchableDropdown
                      value={formData.clientName}
                      onChange={(val) => setFormData({ ...formData, clientName: val })}
                      options={clients}
                      placeholder="Choose Client"
                      showAll={false}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      Line Items
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] ml-1">{formData.items.length}</span>
                    </h3>
                    <div className="h-[1px] flex-1 bg-gray-200"></div>
                  </div>

                  <div className="space-y-4">
                    {formData.items.map((item, index) => (
                      <div
                        key={index}
                        className="relative flex flex-col gap-4 p-5 bg-white border border-gray-200 rounded shadow-sm hover:border-primary/30 transition-all duration-300 animate-in fade-in slide-in-from-top-4 ease-out"
                        style={{ animationDuration: '400ms' }}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                          <div className="sm:col-span-4 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Product / Item Name</label>
                            <SearchableDropdown
                              value={item.itemName}
                              onChange={(val) => handleItemChange(index, 'itemName', val)}
                              options={itemNames}
                              placeholder="Select Product"
                              showAll={false}
                            />
                            {item.itemName && stockDataMap[normalize(item.itemName)] && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {stockDataMap[normalize(item.itemName)].map((st, sIdx) => (
                                  <span key={sIdx} className="px-2 py-0.5 bg-slate-50 text-gray-500 rounded border border-gray-100 text-[9px] font-bold">
                                    {st}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="sm:col-span-3 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Location / Godown</label>
                            <SearchableDropdown
                              value={item.godownName}
                              onChange={(val) => handleItemChange(index, 'godownName', val)}
                              options={godowns}
                              placeholder="Select Godown"
                              showAll={false}
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Unit Price (₹)</label>
                            <input
                              type="number"
                              required
                              placeholder="0.00"
                              value={item.rate}
                              onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm"
                            />
                          </div>
                          <div className="sm:col-span-3 flex gap-3 items-end">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Quantity</label>
                              <input
                                type="number"
                                required
                                placeholder="0"
                                value={item.qty}
                                onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm font-bold text-gray-900 transition-all shadow-sm"
                              />
                            </div>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="shrink-0 p-2.5 text-red-500 hover:text-white hover:bg-red-500 transition-colors bg-red-50 rounded border border-red-100"
                                title="Remove Item"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-dashed border-gray-300 text-gray-600 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all rounded font-bold text-xs uppercase tracking-widest shadow-sm"
                    >
                      <Plus size={16} />
                      Add Another Item
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex sm:flex-row justify-end items-center gap-3 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => !isSubmitting && setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors font-bold text-xs uppercase tracking-widest shadow-sm"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[160px] flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded hover:bg-primary-hover transition-colors font-bold text-xs uppercase tracking-widest shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {isSubmitting ? 'Saving...' : 'Submit Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        @keyframes progress-loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress-loading {
          animation: progress-loading 1.5s infinite linear;
          width: 50%;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Order;