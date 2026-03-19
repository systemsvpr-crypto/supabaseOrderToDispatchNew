import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader, X, Filter, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';

const CACHE_KEY = 'godownData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const Godown = () => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [godownFilter, setGodownFilter] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const godownTabs = ['All', 'darba', 'DP', 'dusera', 'godown'];

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    // Helper to get value from object regardless of key casing/spaces
    const getVal = (obj, ...possibleKeys) => {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        for (const pKey of possibleKeys) {
            if (obj[pKey] !== undefined) return obj[pKey];
            const normalizedPKey = pKey.toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedPKey);
            if (foundKey) return obj[foundKey];
        }
        return undefined;
    };

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

    // --- Cache helpers ---
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) return data;
        } catch (e) { /* ignore */ }
        return null;
    }, []);

    const saveToCache = useCallback((data) => {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    }, []);

    // Fetch Planning data - Stable Fetcher
    const fetchPlanning = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}?sheet=Planning&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                const mapped = result.data.slice(3).map(item => ({
                    originalIndex: item.originalIndex,
                    dispatchNo: getVal(item, 'dispatchNo', 'Dispatch No') || '-',
                    dispatchDate: getVal(item, 'dispatchDate', 'Dispatch Date') || '-',
                    orderNo: getVal(item, 'orderNumber', 'Order No', 'Order Number') || '-',
                    customerName: getVal(item, 'clientName', 'Customer', 'Customer Name') || '-',
                    productName: getVal(item, 'itemName', 'Product', 'Product Name') || '-',
                    orderQty: getVal(item, 'qty', 'Order Qty') || '0',
                    dispatchQty: getVal(item, 'dispatchQty', 'Dispatch Qty') || '0',
                    godown: getVal(item, 'godownName', 'Godown') || '-',
                    gstIncluded: getVal(item, 'gstIncluded', 'GST Included') || '-'
                }));
                setItems(mapped);
            } else {
                setItems([]);
            }
        } catch (error) {
            console.error('Error fetching Planning:', error);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, SHEET_ID]);

    // On mount
    useEffect(() => {
        const cachedData = loadFromCache();
        if (cachedData) {
            setItems(cachedData);
        } else {
            fetchPlanning();
        }
    }, [loadFromCache, fetchPlanning]);

    // Cache Sync
    useEffect(() => {
        if (items.length > 0) saveToCache(items);
    }, [items, saveToCache]);

    // Manual Refresh
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchPlanning(true);
    }, [fetchPlanning]);

    // Sorting logic
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
            if (!isNaN(aNum) && !isNaN(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            if (sortConfig.key.toLowerCase().includes('date')) {
                const aD = new Date(aVal), bD = new Date(bVal);
                if (!isNaN(aD) && !isNaN(bD)) return sortConfig.direction === 'asc' ? aD - bD : bD - aD;
            }
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [sortConfig]);

    const filteredAndSortedItems = useMemo(() => {
        const filtered = items.filter(item => {
            const matchesSearch = !searchTerm || Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase().trim())
            );
            const itemGodown = (item.godown || '').trim().toLowerCase();
            const selectedGodown = godownFilter.trim().toLowerCase();
            const matchesGodown = godownFilter === 'All' || itemGodown === selectedGodown;
            return matchesSearch && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [items, searchTerm, godownFilter, getSortedItems]);

    const tabCounts = useMemo(() => godownTabs.reduce((acc, tab) => {
        if (tab === 'All') acc[tab] = items.length;
        else acc[tab] = items.filter(item => (item.godown || '').trim().toLowerCase() === tab.toLowerCase()).length;
        return acc;
    }, {}), [items]);

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-700"><Filter size={20} /></div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Godown Management</h1>
                        <p className="text-xs text-gray-500">Filter and view dispatch data by warehouse</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <div className="relative w-full sm:w-64">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
                {godownTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setGodownFilter(tab)}
                        className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                            godownFilter === tab ? 'bg-indigo-700 text-white border-indigo-700 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50'
                        }`}
                    >
                        {tab === 'All' ? 'All Warehouses' : <span className="capitalize">{tab}</span>}
                        <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] ${godownFilter === tab ? 'bg-white/20' : 'bg-gray-100'}`}>
                            {tabCounts[tab] || 0}
                        </span>
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin max-h-[500px]">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10">
                                {[
                                    { label: 'Dispatch No', key: 'dispatchNo' },
                                    { label: 'Dispatch Date', key: 'dispatchDate' },
                                    { label: 'Order No', key: 'orderNo' },
                                    { label: 'Customer', key: 'customerName' },
                                    { label: 'Product', key: 'productName' },
                                    { label: 'Order Qty', key: 'orderQty' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty' },
                                    { label: 'Godown', key: 'godown' },
                                    { label: 'GST', key: 'gstIncluded' }
                                ].map((col) => (
                                    <th key={col.key} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => requestSort(col.key)}>
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            <div className="flex flex-col">
                                                <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-indigo-800' : 'text-gray-300'} />
                                                <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-indigo-800' : 'text-gray-300'} />
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {filteredAndSortedItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-semibold text-gray-900">{item.dispatchNo}</td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(item.dispatchDate)}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.orderNo}</td>
                                    <td className="px-4 py-3 font-medium text-gray-800">{item.customerName}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.productName}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.orderQty}</td>
                                    <td className="px-4 py-3 text-gray-600 font-bold text-indigo-800">{item.dispatchQty}</td>
                                    <td className="px-4 py-3 text-gray-600 capitalize">{item.godown}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.gstIncluded}</td>
                                </tr>
                            ))}
                            {filteredAndSortedItems.length === 0 && (
                                <tr>
                                    <td colSpan="9" className="px-4 py-20 text-center text-gray-500 italic">No entries found for this selection.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {isLoading && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                        <Loader className="animate-spin text-indigo-700" size={32} />
                        <p className="text-sm font-bold text-gray-700">Syncing Warehouse Data...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Godown;