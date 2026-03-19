import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Save, History, ClipboardList, X, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';

const GODOWNS = ['Godown 1', 'Godown 2', 'Main Store', 'North Warehouse'];

const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;

// Cache configuration
const CACHE_KEY = 'dispatchPlanningData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Professional Date Formatter
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

const DispatchPlanning = () => {
    const [orders, setOrders] = useState([]);
    const [dispatchHistory, setDispatchHistory] = useState([]);
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

    const [isLoading, setIsLoading] = useState(false);

    const fetchOrders = useCallback(async (forceRefresh = false) => {
        console.log('[DispatchPlanning] Fetching from:', API_URL);
        setIsLoading(true);
        try {
            // Fetch Pending Orders from 'ORDER'
            const response = await fetch(`${API_URL}?sheet=ORDER&mode=table`);
            const result = await response.json();
            let newOrders = [];
            let newHistory = [];

            if (result.success) {
                const mappedData = result.data.slice(4).map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    orderNo: item.orderNumber,
                    qty: item.qty || 0
                }));
                
                // Filter: Column Q is not null AND Column R is null AND Remaining Planning Qty > 0
                newOrders = mappedData.filter(item => {
                    const hasQ = item.columnQ !== undefined && item.columnQ !== null && String(item.columnQ).trim() !== '';
                    const hasR = item.columnR !== undefined && item.columnR !== null && String(item.columnR).trim() !== '';
                    
                    const pendingQty = parseFloat(String(getVal(item, 'planningPendingQty', 11) || '0').replace(/[^0-9.-]+/g, ''));
                    // Only show planned, un-finished items with positive pending quantity
                    return hasQ && !hasR && !isNaN(pendingQty) && pendingQty > 0;
                });
            }

            // Fetch History from 'Planning'
            const historyResponse = await fetch(`${API_URL}?sheet=Planning&mode=table`);
            const historyResult = await historyResponse.json();
            if (historyResult.success) {
                newHistory = historyResult.data.slice(3).map(item => ({
                    ...item,
                    orderNo: item.orderNumber || item.orderNo
                }));
            }

            setOrders(newOrders);
            setDispatchHistory(newHistory);
        } catch (error) {
            console.error('[DispatchPlanning] Fetch Error:', error);
        } finally {
            setIsLoading(false);
        }
    }, []); // Stable Fetcher

    // Load cached data on mount, or fetch if stale/missing
    useEffect(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { orders: cachedOrders, dispatchHistory: cachedHistory, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < CACHE_DURATION) {
                    setOrders(cachedOrders);
                    setDispatchHistory(cachedHistory);
                    return; // Use cache, skip fetch
                }
            } catch (e) {
                // Cache corrupted – ignore and fetch fresh
            }
        }
        fetchOrders();
    }, [fetchOrders]);

    // Independent UI State Management - Clear selection/edit data on tab switch
    useEffect(() => {
        setSelectedRows({});
        setEditData({});
    }, [activeTab]);

    // Dedicated Cache Sync Effect: Watches state changes and updates sessionStorage
    // This breaks the circular dependency between fetchers and cache
    useEffect(() => {
        if (orders.length > 0 || dispatchHistory.length > 0) {
            const cacheData = {
                orders: orders,
                dispatchHistory: dispatchHistory,
                timestamp: Date.now()
            };
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        }
    }, [orders, dispatchHistory]);

    // Get unique values for filters - Memoized
    const allUniqueClients = useMemo(() => [...new Set([...orders.map(o => o.clientName), ...dispatchHistory.map(h => h.clientName)])].sort(), [orders, dispatchHistory]);
    const allUniqueGodowns = useMemo(() => [...new Set([...orders.map(o => o.godownName), ...dispatchHistory.map(h => h.godownName)])].sort(), [orders, dispatchHistory]);
    const allUniqueOrderNos = useMemo(() => [...new Set([...orders.map(o => o.orderNo), ...dispatchHistory.map(h => h.orderNo)])].sort(), [orders, dispatchHistory]);
    const allUniqueItems = useMemo(() => [...new Set([...orders.map(o => o.itemName), ...dispatchHistory.map(h => h.itemName)])].sort(), [orders, dispatchHistory]);
    const allUniqueDates = useMemo(() => {
        const rawDates = [...new Set([
            ...orders.map(o => o.orderDate), 
            ...dispatchHistory.map(h => h.orderDate)
        ])].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
        return rawDates.map(d => formatDisplayDate(d));
    }, [orders, dispatchHistory]);
    const allUniqueStockLocs = useMemo(() => {
        const locations = new Set();
        orders.forEach(order => {
            if (order.currentStock) {
                order.currentStock.split(',').forEach(part => {
                    const loc = part.split(':')[0].trim();
                    if (loc) locations.add(loc);
                });
            }
        });
        return [...locations].sort();
    }, [orders]);

    // Sorting logic
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

            // Numeric
            const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
            const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            }

            // Date
            if (sortConfig.key.toLowerCase().includes('date')) {
                const aDate = new Date(aVal);
                const bDate = new Date(bVal);
                if (!isNaN(aDate) && !isNaN(bDate)) {
                    return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
                }
            }

            // String
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [sortConfig]);

    const filteredAndSortedOrders = useMemo(() => {
        const filtered = orders.filter(order => {
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
    }, [orders, searchTerm, clientFilter, godownFilter, orderNoFilter, itemFilter, dateFilter, stockLocationFilter, getSortedItems]);

    const filteredAndSortedHistory = useMemo(() => {
        const filtered = dispatchHistory.filter(item => {
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

    const handleCheckboxToggle = useCallback((idx, order) => {
        setSelectedRows(prev => {
            const isSelected = !prev[idx];
            const next = { ...prev, [idx]: isSelected };
            
            if (isSelected) {
                setEditData(prevEdit => ({
                    ...prevEdit,
                    [idx]: {
                        dispatchQty: order.qty,
                        dispatchDate: new Date().toISOString().split('T')[0],
                        gstIncluded: 'Yes',
                        godownName: order.godownName
                    }
                }));
            } else {
                setEditData(prevEdit => {
                    const newEditData = { ...prevEdit };
                    delete newEditData[idx];
                    return newEditData;
                });
            }
            return next;
        });
    }, []);

    const handleEditChange = useCallback((idx, field, value) => {
        setEditData(prev => ({
            ...prev,
            [idx]: { ...prev[idx], [field]: value }
        }));
    }, []);

    const handleSave = useCallback(async () => {
        const rowsToSubmit = [];
        
        Object.keys(selectedRows).forEach((idx) => {
            if (selectedRows[idx]) {
                const order = orders.find(o => String(o.originalIndex) === String(idx));
                const planningData = editData[idx];

                if (order && planningData) {
                    rowsToSubmit.push({
                        ...order,
                        dispatchQty: planningData.dispatchQty,
                        dispatchDate: planningData.dispatchDate,
                        gstIncluded: planningData.gstIncluded,
                        godownName: planningData.godownName || order.godownName
                    });
                }
            }
        });

        if (rowsToSubmit.length === 0) return;

        setIsLoading(true);
        try {
            await fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sheetId: import.meta.env.VITE_orderToDispatch_SHEET_ID,
                    sheet: "Planning",
                    rows: rowsToSubmit
                })
            });

            alert('Planning saved successfully!');
            // Invalidate cache and refetch
            sessionStorage.removeItem(CACHE_KEY);
            await fetchOrders();
            setSelectedRows({});
            setEditData({});
        } catch (error) {
            console.error('Save failed:', error);
            alert('Failed to save planning. Please check console.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedRows, orders, editData, fetchOrders]);

    // Manual refresh: ignore cache and fetch fresh data
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchOrders(true);
    }, [fetchOrders]);

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
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header Row with Title, Tabs, Filters, and Actions */}
            <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded-xl shadow-sm border border-gray-100">
                {/* Top Section: Title & Tabs & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Dispatch Planning</h1>

                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-red-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <ClipboardList size={16} />
                                Pending
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-red-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                <History size={16} />
                                History
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Refresh button */}
                        <button
                            onClick={handleRefresh}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>

                        {(searchTerm || clientFilter || godownFilter || orderNoFilter || itemFilter || dateFilter || stockLocationFilter) && (
                            <button
                                onClick={clearFilters}
                                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-bold border border-red-100"
                            >
                                <X size={14} />
                                Clear Filters
                            </button>
                        )}
                        
                        {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
                            <div className="flex items-center gap-2 sm:border-l sm:border-gray-200 sm:pl-3">
                                <button
                                    onClick={handleCancelSelection}
                                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-bold text-[13px] border border-gray-200"
                                >
                                    <X size={14} />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 shadow-md font-bold text-[13px]"
                                >
                                    <Save size={14} />
                                    Save
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Section: Grid Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 focus:border-transparent outline-none text-sm transition-all"
                    />
                    <SearchableDropdown
                        value={clientFilter}
                        onChange={setClientFilter}
                        options={allUniqueClients}
                        allLabel="All Clients"
                        className="w-full"
                    />
                    <SearchableDropdown
                        value={godownFilter}
                        onChange={setGodownFilter}
                        options={allUniqueGodowns}
                        allLabel="All Godowns"
                        className="w-full"
                    />
                    <SearchableDropdown
                        value={orderNoFilter}
                        onChange={setOrderNoFilter}
                        options={allUniqueOrderNos}
                        allLabel="All Order No"
                        className="w-full"
                        focusColor="red-800"
                    />
                    <SearchableDropdown
                        value={itemFilter}
                        onChange={setItemFilter}
                        options={allUniqueItems}
                        allLabel="All Items"
                        className="w-full"
                        focusColor="red-800"
                    />
                    <SearchableDropdown
                        value={dateFilter}
                        onChange={setDateFilter}
                        options={allUniqueDates}
                        allLabel="All Dates"
                        className="w-full"
                        focusColor="red-800"
                    />
                    <SearchableDropdown
                        value={stockLocationFilter}
                        onChange={setStockLocationFilter}
                        options={allUniqueStockLocs}
                        allLabel="Stock Loc"
                        className="w-full"
                        focusColor="green-600"
                    />
                </div>
            </div>

            {isLoading && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-gray-100">
                        <div className="relative">
                            <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-red-800 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-8 w-8 rounded-full border-4 border-gray-100 border-b-red-800 animate-spin-slow"></div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center">
                            <p className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">Loading</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Fetching Planning Data</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {activeTab === 'pending' ? (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                            <table className="w-full text-left border-collapse min-w-[1400px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                        <th className="px-4 py-3">Action</th>
                                        {isAnySelected && (
                                            <>
                                                <th className="px-4 py-3 animate-column">Dispatch Qty</th>
                                                <th className="px-4 py-3 animate-column">Dispatch Date</th>
                                                <th className="px-4 py-3 animate-column">GST</th>
                                                <th className="px-4 py-3 animate-column">Dispatch Godown</th>
                                            </>
                                        )}
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('orderNo')}>
                                            <div className="flex items-center gap-1">Order No <SortIcon column="orderNo" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('orderDate')}>
                                            <div className="flex items-center gap-1">Order Date <SortIcon column="orderDate" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('clientName')}>
                                            <div className="flex items-center gap-1">Client Name <SortIcon column="clientName" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('godownName')}>
                                            <div className="flex items-center gap-1">Godown <SortIcon column="godownName" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('itemName')}>
                                            <div className="flex items-center gap-1">Item Name <SortIcon column="itemName" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('rate')}>
                                            <div className="flex items-center gap-1">Rate <SortIcon column="rate" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100 text-center" onClick={() => requestSort('qty')}>
                                            <div className="flex items-center gap-1 justify-center">Order Qty <SortIcon column="qty" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('currentStock')}>
                                            <div className="flex items-center gap-1">Current Stock <SortIcon column="currentStock" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('intransitQty')}>
                                            <div className="flex items-center gap-1">Intransit Qty <SortIcon column="intransitQty" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('planningQty')}>
                                            <div className="flex items-center gap-1">Planning Qty <SortIcon column="planningQty" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('planningPendingQty')}>
                                            <div className="flex items-center gap-1">Remaining Planing Qty <SortIcon column="planningPendingQty" sortConfig={sortConfig} /></div>
                                        </th>
                                        <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('qtyDelivered')}>
                                            <div className="flex items-center gap-1">Qty Delivered <SortIcon column="qtyDelivered" sortConfig={sortConfig} /></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-sm">
                                    {filteredAndSortedOrders.map((order) => {
                                        const realIdx = order.originalIndex;
                                        return (
                                            <tr key={`${order.orderNo}-${realIdx}`} className={`${selectedRows[realIdx] ? 'bg-red-50/50' : 'hover:bg-gray-50'} transition-colors`}>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedRows[realIdx]}
                                                        onChange={() => handleCheckboxToggle(realIdx, order)}
                                                        className="rounded text-red-800 focus:ring-red-800 w-4 h-4 cursor-pointer"
                                                    />
                                                </td>
                                                {isAnySelected && (
                                                    <>
                                                        <td className="px-4 py-3 animate-column">
                                                            {selectedRows[realIdx] ? (
                                                                <input
                                                                    type="number"
                                                                    value={editData[realIdx]?.dispatchQty || ''}
                                                                    onChange={(e) => handleEditChange(realIdx, 'dispatchQty', e.target.value)}
                                                                    className="w-20 px-2 py-1 border rounded text-xs outline-none focus:border-red-800"
                                                                />
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 animate-column">
                                                            {selectedRows[realIdx] ? (
                                                                <input
                                                                    type="date"
                                                                    value={editData[realIdx]?.dispatchDate || ''}
                                                                    onChange={(e) => handleEditChange(realIdx, 'dispatchDate', e.target.value)}
                                                                    className="px-2 py-1 border rounded text-xs outline-none focus:border-red-800"
                                                                />
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 animate-column">
                                                            {selectedRows[realIdx] ? (
                                                                <select
                                                                    value={editData[realIdx]?.gstIncluded || ''}
                                                                    onChange={(e) => handleEditChange(realIdx, 'gstIncluded', e.target.value)}
                                                                    className="px-2 py-1 border rounded text-xs outline-none focus:border-red-800"
                                                                >
                                                                    <option value="Yes">Yes</option>
                                                                    <option value="No">No</option>
                                                                </select>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 animate-column">
                                                            {selectedRows[realIdx] ? (
                                                                <select
                                                                    value={editData[realIdx]?.godownName || order.godownName}
                                                                    onChange={(e) => handleEditChange(realIdx, 'godownName', e.target.value)}
                                                                    className="px-2 py-1 border rounded text-xs outline-none focus:border-red-800 w-full"
                                                                >
                                                                    {[...new Set([...GODOWNS, order.godownName])].map(g => (
                                                                        <option key={g} value={g}>{g}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-4 py-3">{order.orderNo}</td>
                                                <td className="px-4 py-3">{formatDisplayDate(order.orderDate)}</td>
                                                <td className="px-4 py-3">{order.clientName}</td>
                                                <td className="px-4 py-3">{order.godownName}</td>
                                                <td className="px-4 py-3">{order.itemName}</td>
                                                <td className="px-4 py-3">{order.rate}</td>
                                                <td className="px-4 py-3 text-center font-bold text-red-800">{order.qty}</td>
                                                <td className="px-4 py-3 text-xs font-medium text-gray-700">{order.currentStock || '-'}</td>
                                                <td className="px-4 py-3 text-center font-medium text-gray-700">{order.intransitQty || '0'}</td>
                                                <td className="px-4 py-3 text-center font-medium text-gray-700">{order.planningQty || '0'}</td>
                                                <td className="px-4 py-3 text-center font-medium text-gray-700">{order.planningPendingQty || '0'}</td>
                                                <td className="px-4 py-3 text-center font-medium text-gray-700">{order.qtyDelivered || '0'}</td>
                                            </tr>
                                        );
                                    })}
                                    {filteredAndSortedOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={isAnySelected ? 17 : 13} className="px-4 py-8 text-center text-gray-500 italic">No items found matching your filters.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View (unchanged) */}
                        <div className="md:hidden divide-y divide-gray-200">
                            {filteredAndSortedOrders.map((order) => {
                                const realIdx = order.originalIndex;
                                return (
                                    <div key={`${order.orderNo}-${realIdx}`} className={`p-4 space-y-4 ${selectedRows[realIdx] ? 'bg-red-50/30' : 'bg-white'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedRows[realIdx]}
                                                    onChange={() => handleCheckboxToggle(realIdx, order)}
                                                    className="mt-1 rounded text-red-800 focus:ring-red-800 w-5 h-5"
                                                />
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900">{order.clientName}</h4>
                                                    <p className="text-[10px] mt-1 text-gray-500">Order: {order.orderNo} | {order.itemName}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {selectedRows[realIdx] && (
                                            <div className="grid grid-cols-2 gap-3 bg-red-50/50 p-3 rounded-lg border border-red-100">
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-bold text-red-800 mb-1 uppercase">Dispatch Date</label>
                                                    <input
                                                        type="date"
                                                        value={editData[realIdx]?.dispatchDate || ''}
                                                        onChange={(e) => handleEditChange(realIdx, 'dispatchDate', e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-red-200 rounded text-xs outline-none focus:border-red-800 bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-red-800 mb-1 uppercase">Disp Qty</label>
                                                    <input
                                                        type="number"
                                                        value={editData[realIdx]?.dispatchQty || ''}
                                                        onChange={(e) => handleEditChange(realIdx, 'dispatchQty', e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-red-200 rounded text-xs outline-none focus:border-red-800 bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-red-800 mb-1 uppercase">GST</label>
                                                    <select
                                                        value={editData[realIdx]?.gstIncluded || ''}
                                                        onChange={(e) => handleEditChange(realIdx, 'gstIncluded', e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-red-200 rounded text-xs outline-none focus:border-red-800 bg-white"
                                                    >
                                                        <option value="Yes">Yes</option>
                                                        <option value="No">No</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-bold text-red-800 mb-1 uppercase">Godown Name</label>
                                                    <select
                                                        value={editData[realIdx]?.godownName || order.godownName}
                                                        onChange={(e) => handleEditChange(realIdx, 'godownName', e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-red-200 rounded text-xs outline-none focus:border-red-800 bg-white"
                                                    >
                                                        {[...new Set([...GODOWNS, order.godownName])].map(g => (
                                                            <option key={g} value={g}>{g}</option>
                                                        ))}
                                                    </select>
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
                                                <p className="font-bold text-red-800">{order.qty}</p>
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
                            })}
                            {filteredAndSortedOrders.length === 0 && (
                                <div className="p-8 text-center text-gray-500 italic text-sm">No items found matching your filters.</div>
                            )}
                        </div>
                    </>
                ) : (
                    // History tab (unchanged)
                    <>
                        <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                            <table className="w-full text-left border-collapse min-w-[1200px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                        {[
                                            { label: 'Order No', key: 'orderNo' },
                                            { label: 'Dispatch No', key: 'dispatchNo' },
                                            { label: 'Disp Qty', key: 'dispatchQty' },
                                            { label: 'Disp Date', key: 'dispatchDate' },
                                            { label: 'GST', key: 'gstIncluded' },
                                            { label: 'Client', key: 'clientName' },
                                            { label: 'Godown', key: 'godownName' },
                                            { label: 'Order Date', key: 'orderDate' },
                                            { label: 'Item Name', key: 'itemName' },
                                            { label: 'Rate', key: 'rate' },
                                            { label: 'Qty', key: 'qty', align: 'center' }
                                        ].map((col) => (
                                            <th
                                                key={col.key}
                                                className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : ''}`}
                                                onClick={() => requestSort(col.key)}
                                            >
                                                <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : ''}`}>
                                                    {col.label}
                                                    <SortIcon column={col.key} sortConfig={sortConfig} />
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-sm italic">
                                    {filteredAndSortedHistory.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">{item.orderNo}</td>
                                            <td className="px-4 py-3 font-bold text-red-800">{item.dispatchNo}</td>
                                            <td className="px-4 py-3 font-semibold">{item.dispatchQty}</td>
                                            <td className="px-4 py-3">{formatDisplayDate(item.dispatchDate)}</td>
                                            <td className="px-4 py-3">{item.gstIncluded}</td>
                                            <td className="px-4 py-3">{item.clientName}</td>
                                            <td className="px-4 py-3">{item.godownName}</td>
                                            <td className="px-4 py-3">{formatDisplayDate(item.orderDate)}</td>
                                            <td className="px-4 py-3">{item.itemName}</td>
                                            <td className="px-4 py-3">{item.rate}</td>
                                            <td className="px-4 py-3 text-center font-bold">{item.qty}</td>
                                        </tr>
                                    ))}
                                    {filteredAndSortedHistory.length === 0 && (
                                        <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">No planning history found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="md:hidden divide-y divide-gray-200">
                            {filteredAndSortedHistory.map((item, idx) => (
                                <div key={idx} className="p-4 space-y-3 bg-white">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] font-bold text-red-800 uppercase leading-none mb-1">{item.dispatchNo}</p>
                                            <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.clientName}</h4>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-600">
                                        <div className="flex justify-between border-b border-gray-50 pb-1">
                                            <span className="text-gray-400">Order No</span>
                                            <span className="font-medium">{item.orderNo}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-50 pb-1">
                                            <span className="text-gray-400">Disp Qty</span>
                                            <span className="font-bold text-red-800">{item.dispatchQty}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-50 pb-1">
                                            <span className="text-gray-400">Disp Date</span>
                                            <span className="font-medium">{formatDisplayDate(item.dispatchDate)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-gray-50 pb-1">
                                            <span className="text-gray-400">GST</span>
                                            <span className="font-medium">{item.gstIncluded}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-gray-400 mb-0.5">Item Details</p>
                                            <p className="font-bold text-gray-800 uppercase">{item.itemName} @ {item.rate}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredAndSortedHistory.length === 0 && (
                                <div className="p-8 text-center text-gray-500 text-sm italic">History is empty.</div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <style dangerouslySetInnerHTML={{__html: `
              @keyframes spin-slow {
                from { transform: rotate(0deg); }
                to { transform: rotate(-360deg); }
              }
              .animate-spin-slow {
                animation: spin-slow 3s linear infinite;
              }
              @keyframes fadeIn {
                from { opacity: 0; transform: translateX(-10px); }
                to { opacity: 1; transform: translateX(0); }
              }
              .animate-column {
                animation: fadeIn 0.3s ease-out forwards;
              }
            `}} />
        </div>
    );
};

// Helper component for sort icons
const SortIcon = ({ column, sortConfig }) => (
    <div className="flex flex-col">
        <ChevronUp size={10} className={sortConfig.key === column && sortConfig.direction === 'asc' ? 'text-red-800' : 'text-gray-300'} />
        <ChevronDown size={10} className={sortConfig.key === column && sortConfig.direction === 'desc' ? 'text-red-800' : 'text-gray-300'} />
    </div>
);

export default DispatchPlanning;