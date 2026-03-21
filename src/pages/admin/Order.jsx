import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Save, ChevronUp, ChevronDown, RefreshCw, Search } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import SearchableDropdown from '../../components/SearchableDropdown';

const CACHE_KEY = 'orderData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const Order = () => {
    const { showToast } = useToast();
    const { user } = useAuth();
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
                    orderDate: item[2] || '-',
                    clientName: item[3] || '-',
                    godownName: item[4] || '-',
                    itemName: item[5] || '-',
                    rate: item[6] || '0',
                    qty: item[7] || '0',
                    currentStock: item[8] || '-',
                    intransitQty: item[9] || '-',
                    createdBy: item[24] || '-'   // 👈 Map column Y
                }));
            } else {
                mappedOrders = dataToMap.map(item => ({
                    orderNumber: item.orderNumber || '-',
                    orderDate: item.orderDate || '-',
                    clientName: item.clientName || '-',
                    godownName: item.godownName || '-',
                    itemName: item.itemName || '-',
                    rate: item.rate || '0',
                    qty: item.qty || '0',
                    currentStock: item.currentStock || '-',
                    intransitQty: item.intransitQty || '-',
                    createdBy: item.createdBy || '-' // 👈 Map from object if using object mode
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
                    qty: item.qty,
                    createdBy: user?.name || user?.id || 'Unknown'   // 👈 Corrected username
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
        <div className="p-3 sm:p-6 space-y-6">
            {/* Header */}
            {/* Header Section */}
            <div className="max-w-[1200px] mx-auto bg-white p-4 sm:p-8 rounded shadow-sm border border-gray-100">
                <div className="flex flex-col gap-6">
                    {/* Top Row: Title, Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-primary/10 rounded-xl">
                                <Save className="text-primary w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Orders</h1>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Manage Dispatch Orders</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleRefresh}
                                disabled={isLoadingOrders}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-all border border-gray-200 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest"
                            >
                                <RefreshCw size={16} className={isLoadingOrders ? 'animate-spin' : ''} />
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                            
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center justify-center gap-2 px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/20 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                            >
                                <Plus size={16} className="stroke-[3]" />
                                New Order
                            </button>
                        </div>
                    </div>

                    {/* Bottom Row: Filters and Search */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border-t border-gray-50">
                        <div className="md:col-span-2 relative">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by Client, Godown or Order Number..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/10 focus:border-primary focus:bg-white outline-none transition-all text-sm font-medium"
                            />
                        </div>

                        <SearchableDropdown
                            value={clientFilter}
                            onChange={setClientFilter}
                            options={filterClients}
                            allLabel="All Clients"
                            className="w-full"
                        />
                        
                        <SearchableDropdown
                            value={godownFilter}
                            onChange={setGodownFilter}
                            options={filterGodowns}
                            allLabel="All Godowns"
                            className="w-full"
                        />
                    </div>
                </div>
            </div>

            {/* Loading overlay */}
            {isLoadingOrders && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/40 backdrop-blur-md transition-all duration-300">
                    <div className="bg-white/80 p-10 rounded-3xl shadow-[0_32px_64px_-15px_rgba(0,0,0,0.1)] flex flex-col items-center gap-6 border border-white/50 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-500"></div>
                        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-500"></div>
                        <div className="relative">
                            <svg className="w-16 h-16 animate-spin" viewBox="0 0 50 50">
                                <circle className="opacity-20" cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" style={{ color: 'var(--primary, #58cc02)' }} />
                                <circle className="opacity-100" cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="80" strokeDashoffset="60" strokeLinecap="round" style={{ color: 'var(--primary, #58cc02)' }} />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-2 w-2 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <h3 className="text-lg font-black text-gray-800 uppercase tracking-[0.3em] mb-1 drop-shadow-sm flex items-center">
                                Loading
                                <span className="inline-flex ml-1">
                                    <span className="animate-bounce" style={{ animationDelay: '0s' }}>.</span>
                                    <span className="animate-bounce [animation-delay:0.2s] ml-0.5">.</span>
                                    <span className="animate-bounce [animation-delay:0.4s] ml-0.5">.</span>
                                </span>
                            </h3>
                            <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider bg-gray-50 px-3 py-1 rounded-full border border-gray-100 shadow-inner">
                                Loading Orders...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Success overlay */}
            {showSuccessOverlay && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded shadow-2xl flex flex-col items-center gap-4 animate-fade-in-up">
                        <div className="h-20 w-20 bg-green-50 rounded flex items-center justify-center">
                            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-base font-black text-green-600">Order Saved Successfully</p>
                    </div>
                </div>
            )}

            {/* Data table / cards */}
            <div className="bg-white rounded shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden max-w-[1200px] mx-auto">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50/50 backdrop-blur-sm border-b border-gray-100 text-[10px] uppercase text-gray-400 font-black tracking-widest sticky top-0 z-10 shadow-sm">
                            <tr>
                                {[
                                    { label: 'Order Number', key: 'orderNumber' },
                                    { label: 'Order Date', key: 'orderDate', align: 'center' },
                                    { label: 'Client', key: 'clientName' },
                                    { label: 'Godown', key: 'godownName' },
                                    { label: 'Item', key: 'itemName' },
                                    { label: 'Rate', key: 'rate', align: 'right' },
                                    { label: 'Qty', key: 'qty', align: 'right' },
                                    { label: 'Current Stock', key: 'currentStock', align: 'right' },
                                    { label: 'Intransit', key: 'intransitQty', align: 'right' },
                                    { label: 'Submitted By', key: 'createdBy', align: 'center' }
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
                            {filteredAndSortedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="px-6 py-8 text-center text-gray-500 italic">
                                        No orders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedOrders.map((order, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-primary">{order.orderNumber}</td>
                                        <td className="px-6 py-4 text-gray-600 text-xs text-center">{formatDisplayDate(order.orderDate)}</td>
                                        <td className="px-6 py-4 font-semibold">{order.clientName}</td>
                                        <td className="px-6 py-4 text-gray-600">{order.godownName}</td>
                                        <td className="px-6 py-4 text-gray-600">{order.itemName}</td>
                                        <td className="px-6 py-4 font-medium text-right">₹{order.rate}</td>
                                        <td className="px-6 py-4 text-right font-black text-primary">{order.qty}</td>
                                        <td className="px-6 py-4 text-gray-600 text-xs text-right">{order.currentStock}</td>
                                        <td className="px-6 py-4 text-gray-600 text-xs text-right">{order.intransitQty}</td>
                                        <td className="px-6 py-4 text-xs text-center text-gray-500 font-medium italic bg-gray-50/30 whitespace-nowrap">{order.createdBy}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-gray-200">
                    {filteredAndSortedOrders.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 italic">No orders found.</div>
                    ) : (
                        filteredAndSortedOrders.map((order, idx) => (
                            <div key={idx} className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900">{order.clientName}</h4>
                                    <span className="px-2 py-0.5 bg-green-50 text-primary rounded text-[10px] font-bold">
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
                                        <p className="font-bold text-primary">{order.qty}</p>
                                    </div>
                                    <div className="col-span-2 mt-1">
                                        <p className="text-gray-400 text-[9px] uppercase">Created By</p>
                                        <p className="text-[10px] text-gray-600 italic">{order.createdBy}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add Order Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 lg:p-10 transition-all duration-500">
                    {/* New Backdrop with blur */}
                    <div 
                        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => !isSubmitting && setIsModalOpen(false)}
                    />
                    
                    {/* Modal Card */}
                    <div className="relative bg-white sm:rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.25)] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-4xl lg:max-w-5xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 ease-out border border-white/20">
                        {/* Decorative background element */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                        {/* Glassmorphic Header */}
                        <div className="relative px-6 py-5 sm:px-10 sm:py-8 border-b border-gray-50 flex justify-between items-center bg-white/80 backdrop-blur-md shrink-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary rounded-2xl shadow-lg shadow-primary/20">
                                    <Plus className="text-white w-5 h-5 stroke-[3]" />
                                </div>
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">New Order</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-0.5">Fill in the order details</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => !isSubmitting && setIsModalOpen(false)} 
                                className="group p-2 text-gray-400 hover:text-gray-900 transition-all bg-gray-50 hover:bg-gray-100 rounded-xl active:scale-90"
                            >
                                <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                            {/* Scrollable Content Area */}
                            <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-10 custom-scrollbar bg-slate-50">
                                {/* Order Metadata Section */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Order Date</label>
                                        <div className="relative">
                                            <input
                                                type="date"
                                                required
                                                value={formData.orderDate}
                                                onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                                                className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none text-sm font-semibold shadow-sm transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 lg:col-span-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Selection</label>
                                        <SearchableDropdown
                                            value={formData.clientName}
                                            onChange={(val) => setFormData({ ...formData, clientName: val })}
                                            options={clients}
                                            placeholder="Choose Client"
                                            showAll={false}
                                        />
                                    </div>
                                    <div className="space-y-2 lg:col-span-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Location / Godown</label>
                                        <SearchableDropdown
                                            value={formData.godownName}
                                            onChange={(val) => setFormData({ ...formData, godownName: val })}
                                            options={godowns}
                                            placeholder="Select Godown"
                                            showAll={false}
                                        />
                                    </div>
                                </div>

                                {/* Items Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-gray-100 to-transparent"></div>
                                        <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                                            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(88,204,2,0.5)]"></span>
                                            Line Items
                                            <span className="px-2 py-0.5 bg-primary/10 rounded-lg text-[9px]">{formData.items.length}</span>
                                        </h3>
                                        <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-gray-100 to-transparent"></div>
                                    </div>

                                    <div className="space-y-5">
                                        {formData.items.map((item, index) => (
                                            <div 
                                                key={index} 
                                                className="group relative animate-in slide-in-from-right-10 duration-300"
                                                style={{ animationDelay: `${index * 50}ms` }}
                                            >
                                                <div className="relative flex flex-col gap-6 p-6 sm:p-8 bg-white border border-slate-200/60 sm:rounded-[2rem] shadow-sm hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all duration-500">
                                                    {/* Index Marker */}
                                                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-6 h-6 bg-slate-50 text-[10px] font-black text-slate-400 rounded-full border border-slate-200 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all duration-500">
                                                        {index + 1}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-end">
                                                        <div className="sm:col-span-6">
                                                            <label className="text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest block ml-1">Product / Item Name</label>
                                                            <SearchableDropdown
                                                                value={item.itemName}
                                                                onChange={(val) => handleItemChange(index, 'itemName', val)}
                                                                options={itemNames}
                                                                placeholder="Select Product"
                                                                showAll={false}
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3">
                                                            <label className="text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest block ml-1">Unit Price (₹)</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                placeholder="0.00"
                                                                value={item.rate}
                                                                onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                                                                className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none text-sm font-semibold transition-all shadow-sm"
                                                            />
                                                        </div>
                                                        <div className="sm:col-span-3 flex gap-4 items-end">
                                                            <div className="flex-1">
                                                                <label className="text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest block ml-1">Quantity</label>
                                                                <input
                                                                    type="number"
                                                                    required
                                                                    placeholder="0"
                                                                    value={item.qty}
                                                                    onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                                                    className="w-full px-5 py-3.5 bg-white border border-primary/20 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none text-sm font-black text-primary transition-all text-center shadow-sm"
                                                                />
                                                            </div>
                                                            {formData.items.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveItem(index)}
                                                                    className="shrink-0 p-3.5 text-red-400 hover:text-white transition-all bg-red-50/50 hover:bg-red-500 rounded-2xl active:scale-90 border border-red-100 mb-[1px]"
                                                                    title="Remove Item"
                                                                >
                                                                    <X size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Buttons Inside Scroll Area */}
                                    <div className="flex justify-center pt-4">
                                        <button
                                            type="button"
                                            onClick={handleAddItem}
                                            className="group flex items-center gap-3 px-8 py-4 bg-white border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all rounded-3xl font-black text-[10px] uppercase tracking-widest"
                                        >
                                            <div className="p-1 bg-gray-50 group-hover:bg-primary/20 rounded-lg transition-colors">
                                                <Plus size={14} className="group-hover:rotate-90 transition-transform duration-500" />
                                            </div>
                                            Add Another Item
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Glassmorphic Footer */}
                            <div className="px-6 py-6 sm:px-10 sm:py-8 border-t border-gray-100 bg-white/80 backdrop-blur-md flex flex-col sm:flex-row justify-end items-center gap-4 shrink-0 z-10">
                                <button
                                    type="button"
                                    onClick={() => !isSubmitting && setIsModalOpen(false)}
                                    className="w-full sm:w-auto px-10 py-4 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 hover:text-gray-900 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
                                >
                                    Discard Changes
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-3 px-10 py-4 bg-primary text-white rounded-2xl hover:bg-primary-hover transition-all font-black text-[10px] uppercase tracking-widest shadow-[0_15px_30px_rgba(88,204,2,0.3)] hover:shadow-[0_20px_40px_rgba(88,204,2,0.4)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <RefreshCw size={18} className="animate-spin" />
                                    ) : (
                                        <Save size={18} className="stroke-[3]" />
                                    )}
                                    {isSubmitting ? 'Confirming Order...' : 'Submit Order'}
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
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e5e7eb;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #d1d5db;
                }
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
                
                /* Lucide stroke width fix */
                .stroke-\[3\] {
                    stroke-width: 3px;
                }
            `}</style>
        </div>
    );
};

export default Order;