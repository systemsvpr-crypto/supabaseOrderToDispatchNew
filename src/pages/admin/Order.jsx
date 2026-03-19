import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Save, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import SearchableDropdown from '../../components/SearchableDropdown';

const CACHE_KEY = 'orderData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const Order = () => {
    const { showToast } = useToast();
    const [orders, setOrders] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        orderDate: new Date().toISOString().split('T')[0],
        clientName: '',
        godownName: '',
        items: [{ itemName: '', rate: '', qty: '' }]
    });

    const [itemNames, setItemNames] = useState([]);
    const [clients, setClients] = useState([]);
    const [godowns, setGodowns] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const MASTER_URL = import.meta.env.VITE_MASTER_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    // --- Cache helpers ---
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { orders, itemNames, clients, godowns, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) {
                return { orders, itemNames, clients, godowns };
            }
        } catch (e) { /* ignore */ }
        return null;
    }, []);

    const saveToCache = useCallback((ordersData, itemNamesData, clientsData, godownsData) => {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            orders: ordersData,
            itemNames: itemNamesData,
            clients: clientsData,
            godowns: godownsData,
            timestamp: Date.now()
        }));
    }, []);

    // --- Date formatter ---
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

    // ----- Fetch orders from the ORDER sheet - Stable Fetcher -----
    const fetchOrders = useCallback(async (force = false) => {
        setIsLoadingOrders(true);
        try {
            if (!API_URL) {
                showToast('Error', 'API URL not configured');
                return;
            }

            const url = new URL(API_URL);
            url.searchParams.set('sheet', 'ORDER');
            url.searchParams.set('mode', 'table');
            if (SHEET_ID) url.searchParams.set('sheetId', SHEET_ID);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Unknown error');

            let dataArray = result.data;
            if (!Array.isArray(dataArray)) dataArray = [];

            if (dataArray.length === 0) {
                setOrders([]);
                return;
            }

            const isArrayData = Array.isArray(dataArray[0]);
            const dataToMap = dataArray.slice(5);

            let mappedOrders;
            if (isArrayData) {
                mappedOrders = dataToMap.map(item => ({
                    orderNumber: item[1] || '-',
                    orderDate:   item[2] || '-',
                    clientName:  item[3] || '-',
                    godownName:  item[4] || '-',
                    itemName:    item[5] || '-',
                    rate:        item[6] || '0',
                    qty:         item[7] || '0',
                    currentStock: item[8] || '-',
                    intransitQty: item[9] || '-'
                }));
            } else {
                mappedOrders = dataToMap.map(item => ({
                    orderNumber: item.orderNumber || '-',
                    orderDate:   item.orderDate   || '-',
                    clientName:  item.clientName  || '-',
                    godownName:  item.godownName  || '-',
                    itemName:    item.itemName    || '-',
                    rate:        item.rate        || '0',
                    qty:         item.qty         || '0',
                    currentStock: item.currentStock || '-',
                    intransitQty: item.intransitQty || '-'
                }));
            }

            setOrders(mappedOrders);
        } catch (error) {
            console.error('fetchOrders error:', error);
            showToast('Error', error.message);
        } finally {
            setIsLoadingOrders(false);
        }
    }, [API_URL, SHEET_ID, showToast]); // Stable: No data dependencies

    // ----- Fetch master data (products, clients, godowns) - Stable -----
    const fetchMasterData = useCallback(async () => {
        const url = MASTER_URL?.trim();
        if (!url) {
            console.error('MASTER_URL is not defined or empty');
            return;
        }

        try {
            const [productsRes, clientsRes, godownsRes] = await Promise.all([
                fetch(`${url}?sheet=Products`),
                fetch(`${url}?sheet=Sales Vendor`),
                fetch(`${url}?sheet=Products&col=4`)
            ]);

            const [productsJson, clientsJson, godownsJson] = await Promise.all([
                productsRes.json(),
                clientsRes.json(),
                godownsRes.json()
            ]);

            const processData = (json) => {
                if (json.success && Array.isArray(json.data)) {
                    // If it's a 2D array (array of arrays), flatten it by taking the first element of each row
                    if (Array.isArray(json.data[0])) {
                        return json.data.map(row => row[0]).filter(val => val !== null && val !== undefined && val !== '');
                    }
                    return json.data.filter(val => val !== null && val !== undefined && val !== '');
                }
                return [];
            };

            const newItems = processData(productsJson);
            const newClients = processData(clientsJson);
            const newGodowns = processData(godownsJson);

            setItemNames(newItems);
            setClients(newClients);
            setGodowns(newGodowns);

            console.log('Master data loaded:', {
                items: newItems.length,
                clients: newClients.length,
                godowns: newGodowns.length
            });
        } catch (error) {
            console.error('fetchMasterData error:', error);
            showToast('Error', 'Failed to load master data: ' + error.message);
        }
    }, [MASTER_URL, showToast]); // Stable: No state dependencies

    // On mount: load from cache or fetch
    useEffect(() => {
        const cached = loadFromCache();
        if (cached) {
            setOrders(cached.orders);
            setItemNames(cached.itemNames);
            setClients(cached.clients);
            setGodowns(cached.godowns);
        } else {
            fetchOrders();
            fetchMasterData();
        }
    }, [loadFromCache, fetchOrders, fetchMasterData]);

    // Dedicated Cache Sync Effect: Watches for changes and updates sessionStorage
    useEffect(() => {
        if (orders.length > 0 || itemNames.length > 0 || clients.length > 0 || godowns.length > 0) {
            saveToCache(orders, itemNames, clients, godowns);
        }
    }, [orders, itemNames, clients, godowns, saveToCache]);

    // --- Manual refresh ---
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchOrders(true);
        fetchMasterData();
    }, [fetchOrders, fetchMasterData]);

    // --- Filtering and sorting ---
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

    const filterClients = useMemo(() => [...new Set(orders.map(o => o.clientName))].filter(Boolean).sort(), [orders]);
    const filterGodowns = useMemo(() => [...new Set(orders.map(o => o.godownName))].filter(Boolean).sort(), [orders]);

    const filteredAndSortedOrders = useMemo(() => 
        getSortedItems(
            orders.filter(order => {
                const matchesSearch = Object.values(order).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesClient = !clientFilter || order.clientName === clientFilter;
                const matchesGodown = !godownFilter || order.godownName === godownFilter;
                return matchesSearch && matchesClient && matchesGodown;
            })
        ),
        [orders, searchTerm, clientFilter, godownFilter, getSortedItems]
    );

    // --- Form handlers ---
    const handleAddItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { itemName: '', rate: '', qty: '' }]
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
            return { ...prev, items: newItems };
        });
    };

   const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
        if (!API_URL || !SHEET_ID) {
            showToast('Error', 'Missing API URL or Sheet ID');
            return;
        }

        const payload = {
            sheet: 'ORDER',
            sheetId: SHEET_ID,
            rows: formData.items.map(item => ({
                orderDate: formData.orderDate,
                clientName: formData.clientName,
                godownName: formData.godownName,
                itemName: item.itemName,
                rate: item.rate,
                qty: item.qty
            }))
        };

        // ✅ Fix: use no-cors mode and text/plain content type
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',               // prevents preflight
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });

        // Success overlay and reset
        setShowSuccessOverlay(true);
        setFormData({
            orderDate: new Date().toISOString().split('T')[0],
            clientName: '',
            godownName: '',
            items: [{ itemName: '', rate: '', qty: '' }]
        });
        setIsModalOpen(false);

        // Invalidate cache and refetch orders
        sessionStorage.removeItem(CACHE_KEY);
        await fetchOrders(true);
        setTimeout(() => setShowSuccessOverlay(false), 2500);
    } catch (error) {
        console.error('Submit error:', error);
        showToast('Error', 'Submission failed');
    } finally {
        setIsSubmitting(false);
    }
};

    // ----- Render -----
    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800 mr-auto">Orders</h1>

                {/* Refresh button */}
                <button
                    onClick={handleRefresh}
                    disabled={isLoadingOrders}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
                >
                    <RefreshCw size={14} className={isLoadingOrders ? 'animate-spin' : ''} />
                    Refresh
                </button>

                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-40 lg:w-48 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 outline-none text-sm"
                />
                <SearchableDropdown
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={filterClients}
                    allLabel="All Clients"
                    className="w-36 lg:w-44"
                />
                <SearchableDropdown
                    value={godownFilter}
                    onChange={setGodownFilter}
                    options={filterGodowns}
                    allLabel="All Godowns"
                    className="w-36 lg:w-44"
                />

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 shadow-md font-bold text-sm"
                >
                    <Plus size={18} />
                    Add Order
                </button>
            </div>

            {/* Loading overlay */}
            {isLoadingOrders && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                        <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-red-800 animate-spin" />
                        <p className="text-sm font-bold text-gray-800">Loading Orders...</p>
                    </div>
                </div>
            )}

            {/* Success overlay */}
            {showSuccessOverlay && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-fade-in-up">
                        <div className="h-20 w-20 bg-green-50 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-base font-black text-green-600">Order Saved Successfully</p>
                    </div>
                </div>
            )}

            {/* Data table / cards (unchanged) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10">
                            <tr>
                                {[
                                    { label: 'Order Number', key: 'orderNumber' },
                                    { label: 'Order Date', key: 'orderDate' },
                                    { label: 'Client', key: 'clientName' },
                                    { label: 'Godown', key: 'godownName' },
                                    { label: 'Item', key: 'itemName' },
                                    { label: 'Rate', key: 'rate' },
                                    { label: 'Qty', key: 'qty', align: 'right' },
                                    { label: 'Current Stock', key: 'currentStock' },
                                    { label: 'Intransit', key: 'intransitQty' }
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'right' ? 'text-right' : ''}`}
                                        onClick={() => requestSort(col.key)}
                                    >
                                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                            {col.label}
                                            <div className="flex flex-col">
                                                <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-red-800' : 'text-gray-300'} />
                                                <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-red-800' : 'text-gray-300'} />
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredAndSortedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="px-4 py-8 text-center text-gray-500 italic">
                                        No orders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedOrders.map((order, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-red-800">{order.orderNumber}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(order.orderDate)}</td>
                                        <td className="px-4 py-3 font-semibold">{order.clientName}</td>
                                        <td className="px-4 py-3 text-gray-600">{order.godownName}</td>
                                        <td className="px-4 py-3 text-gray-600">{order.itemName}</td>
                                        <td className="px-4 py-3 font-medium">₹{order.rate}</td>
                                        <td className="px-4 py-3 text-right font-black text-red-800">{order.qty}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{order.currentStock}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{order.intransitQty}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile cards (unchanged) */}
                <div className="md:hidden divide-y divide-gray-200">
                    {filteredAndSortedOrders.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 italic">No orders found.</div>
                    ) : (
                        filteredAndSortedOrders.map((order, idx) => (
                            <div key={idx} className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900">{order.clientName}</h4>
                                    <span className="px-2 py-0.5 bg-red-50 text-red-800 rounded text-[10px] font-bold">
                                        {order.orderNumber}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-gray-400 text-[9px] uppercase">Godown</p>
                                        <p className="font-medium">{order.godownName}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[9px] uppercase">Date</p>
                                        <p className="font-medium">{formatDisplayDate(order.orderDate)}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-gray-400 text-[9px] uppercase">Item</p>
                                        <p className="font-bold">{order.itemName}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[9px] uppercase">Rate</p>
                                        <p className="font-bold">₹{order.rate}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-[9px] uppercase">Qty</p>
                                        <p className="font-bold text-red-800">{order.qty}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add Order Modal (unchanged) */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-[90vh] sm:max-w-4xl flex flex-col overflow-hidden">
                        {/* Fixed Header */}
                        <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 z-30">
                            <h2 className="text-xl font-bold text-gray-900">Add New Order</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 transition-colors hover:bg-gray-100 rounded-full">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                            {/* Scrollable Content Area */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 bg-gray-50/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.1em]">Order Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.orderDate}
                                            onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-800 outline-none text-sm font-medium shadow-sm transition-all focus:border-red-800"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.1em]">Client Name</label>
                                        <SearchableDropdown
                                            value={formData.clientName}
                                            onChange={(val) => setFormData({ ...formData, clientName: val })}
                                            options={clients}
                                            placeholder="Select Client"
                                            showAll={false}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.1em]">Godown Name</label>
                                        <SearchableDropdown
                                            value={formData.godownName}
                                            onChange={(val) => setFormData({ ...formData, godownName: val })}
                                            options={godowns}
                                            placeholder="Select Godown"
                                            showAll={false}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex justify-between items-center pb-2 border-b-2 border-red-800/10">
                                        <h3 className="text-xs font-black text-red-800 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-800 animate-pulse" />
                                            Items Detail
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={handleAddItem}
                                            className="flex items-center gap-1.5 text-[10px] font-black text-red-800 hover:text-white hover:bg-red-800 transition-all px-4 py-1.5 rounded-full border-2 border-red-800 uppercase tracking-widest"
                                        >
                                            <Plus size={14} /> Add Item
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {formData.items.map((item, index) => (
                                            <div key={index} className="group relative flex flex-col gap-5 p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-red-900/5 transition-all duration-300 focus-within:z-40">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-red-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-end">
                                                    <div className="sm:col-span-6">
                                                        <label className="text-[9px] font-black text-gray-400 mb-1.5 uppercase tracking-widest block">Item Name</label>
                                                        <SearchableDropdown
                                                            value={item.itemName}
                                                            onChange={(val) => handleItemChange(index, 'itemName', val)}
                                                            options={itemNames}
                                                            placeholder="Select Item"
                                                            showAll={false}
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-3">
                                                        <label className="text-[9px] font-black text-gray-400 mb-1.5 uppercase tracking-widest block">Rate</label>
                                                        <input
                                                            type="number"
                                                            required
                                                            placeholder="0.00"
                                                            value={item.rate}
                                                            onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-800 focus:bg-white outline-none text-sm font-medium transition-all"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-3 flex gap-3 items-center">
                                                        <div className="flex-1">
                                                            <label className="text-[9px] font-black text-gray-400 mb-1.5 uppercase tracking-widest block">Qty</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                placeholder="0"
                                                                value={item.qty}
                                                                onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-800 focus:bg-white outline-none text-sm font-bold text-red-800 transition-all"
                                                            />
                                                        </div>
                                                        {formData.items.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveItem(index)}
                                                                className="mt-5 p-2.5 text-red-500 hover:text-white transition-all bg-red-50 hover:bg-red-500 rounded-2xl shadow-inner group-hover:rotate-90 transition-transform duration-300"
                                                            >
                                                                <X size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Fixed Footer */}
                            <div className="p-4 sm:p-6 border-t border-gray-100 bg-white flex flex-col-reverse sm:flex-row justify-end gap-4 shrink-0 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-10 py-3 bg-white border-2 border-gray-100 text-gray-400 rounded-2xl hover:bg-gray-50 hover:text-gray-600 hover:border-gray-200 transition-all font-black text-[11px] uppercase tracking-[0.2em]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`flex items-center justify-center gap-3 px-10 py-3 bg-red-800 text-white rounded-2xl hover:bg-red-900 transition-all font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-red-800/30 active:scale-95 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isSubmitting ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    {isSubmitting ? 'Saving...' : 'Save Order'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(-360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 3s linear infinite;
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(15px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default Order;