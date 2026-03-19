import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CheckCircle, History, Save, Loader, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';

// Constants outside component — never recreated
const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
const MASTER_URL = import.meta.env.VITE_MASTER_URL;

// Cache configuration
const CACHE_KEY = 'dispatchCompleteData';
const CACHE_DURATION = 10 * 60 * 1000; // 5 minutes

// Helper to get value from object regardless of key casing/spaces
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

// Professional Date Formatter (e.g., 25-Feb-2026)
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
    } catch (e) {
        return dateStr;
    }
};

const formatDateToYYYYMMDD = (dateVal) => {
    if (!dateVal) return '';
    try {
        const date = new Date(dateVal);
        if (isNaN(date.getTime())) return dateVal;
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
        return dateVal;
    }
};

const DispatchComplete = () => {
    const [orders, setOrders] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedRows, setSelectedRows] = useState({});
    const [editData, setEditData] = useState({});
    const [itemNames, setItemNames] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');

    // Refs to prevent redundant fetches within same component instance
    const hasFetchedOrders = useRef(false);
    const hasFetchedHistory = useRef(false);
    const hasFetchedMaster = useRef(false);

    // Helper to load cached data
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { orders: cachedOrders, history: cachedHistory, itemNames: cachedItems, godowns: cachedGodowns, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) {
                return { orders: cachedOrders, history: cachedHistory, itemNames: cachedItems, godowns: cachedGodowns };
            }
        } catch (e) {
            // Cache corrupted – ignore
        }
        return null;
    }, []);

    // Save data to cache - now a simple helper used by the sync effect
    const syncCache = useCallback((ordersData, historyData, itemsData, godownsData) => {
        const cacheData = {
            orders: ordersData,
            history: historyData,
            itemNames: itemsData,
            godowns: godownsData,
            timestamp: Date.now()
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    }, []);

    // Fetch pending orders (Planning sheet, excluding completed)
    const fetchOrders = useCallback(async (force = false) => {
        if (hasFetchedOrders.current && !force) return;
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}?sheet=Planning&mode=table`, { redirect: 'follow' });
            const text = await response.text();

            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.error('[DispatchComplete] JSON Parse Error:', text);
                return;
            }

            let dataArray = [];
            if (Array.isArray(result)) dataArray = result;
            else if (result.success && Array.isArray(result.data)) dataArray = result.data;
            else if (result.data && Array.isArray(result.data)) dataArray = result.data;
            else if (result.rows && Array.isArray(result.rows)) dataArray = result.rows;

            let newOrders = [];
            if (dataArray && dataArray.length > 0) {
                const hasHeaders = Array.isArray(dataArray[0]) &&
                    (String(dataArray[0][0]).toLowerCase().includes('dispatch') ||
                        String(dataArray[0][1]).toLowerCase().includes('no'));

                const processArray = hasHeaders ? dataArray.slice(1) : dataArray;

                newOrders = processArray.slice(3)
                    .map((item, idx) => {
                        if (Array.isArray(item)) {
                            return {
                                dispatchNo: item[0] || '-',
                                dispatchDate: item[1] || '-',
                                orderNumber: item[2] || '-',
                                clientName: item[3] || '-',
                                itemName: item[4] || '-',
                                godownName: item[5] || '-',
                                qty: item[6] || '0',
                                dispatchQty: item[7] || '0',
                                crmName: item[8] || '-',
                                columnO: item[14] || '',
                                columnP: item[15] || '',
                                sheetRow: item[9] || (idx + (hasHeaders ? 2 : 1)),
                                originalIndex: idx
                            };
                        } else {
                            const columnO = getVal(item, 'columnO', 'O');
                            const columnP = getVal(item, 'columnP', 'P');
                            const status = String(getVal(item, 'status', 'Status') || '').toLowerCase();
                            return {
                                ...item,
                                dispatchNo: getVal(item, 'dispatchNo', 'Dispatch No'),
                                dispatchDate: getVal(item, 'dispatchDate', 'Dispatch Date'),
                                orderNumber: getVal(item, 'orderNumber', 'orderNo', 'Order No'),
                                clientName: getVal(item, 'clientName', 'customer', 'Customer Name', 'Client Name'),
                                itemName: getVal(item, 'itemName', 'product', 'Product Name', 'Item Name'),
                                godownName: getVal(item, 'godownName', 'godown', 'Godown Name'),
                                qty: getVal(item, 'qty', 'orderQty', 'Order Qty'),
                                dispatchQty: getVal(item, 'dispatchQty', 'Dispatch Qty'),
                                crmName: getVal(item, 'crmName', 'CRM Name'),
                                columnO: columnO,
                                columnP: columnP,
                                status: status,
                                originalIndex: idx
                            };
                        }
                    })
                    .filter(item => {
                        const pendingQty = parseFloat(String(getVal(item, 'planningPendingQty', 11) || '0').replace(/[^0-9.-]+/g, ''));
                        // Only show planned items with positive pending quantity
                        return !isNaN(pendingQty) && pendingQty > 0;
                    });
            }
            setOrders(newOrders);
            hasFetchedOrders.current = true;
        } catch (error) {
            console.error('Fetch Exception:', error);
        } finally {
            setIsLoading(false);
        }
    }, []); // Empty dependencies = Stable Fetcher

    // Fetch history from Dispatch Completed sheet
    const fetchHistory = useCallback(async (force = false) => {
        if (hasFetchedHistory.current && !force) return;
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}?sheet=Dispatch%20Completed&mode=table`, { redirect: 'follow' });
            const text = await response.text();

            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.error('[DispatchComplete] History JSON Parse Error:', text);
                return;
            }

            let dataArray = [];
            if (Array.isArray(result)) dataArray = result;
            else if (result.success && Array.isArray(result.data)) dataArray = result.data;
            else if (result.data && Array.isArray(result.data)) dataArray = result.data;
            else if (result.rows && Array.isArray(result.rows)) dataArray = result.rows;

            let newHistory = [];
            if (dataArray && dataArray.length > 0) {
                const hasHeaders = Array.isArray(dataArray[0]) &&
                    (String(dataArray[0][0]).toLowerCase().includes('planning') ||
                        String(dataArray[0][1]).toLowerCase().includes('dispatch'));

                const processArray = hasHeaders ? dataArray.slice(1) : dataArray;

                newHistory = processArray.map((item, idx) => {
                    if (Array.isArray(item)) {
                        return {
                            dispatchNo: item[1] || '-',
                            dispatchDate: item[2] || '-',
                            completeDate: item[3] || '-',
                            customer: item[4] || '-',
                            product: item[5] || '-',
                            godown: item[6] || '-',
                            orderQty: item[7] || '0',
                            dispatchQty: item[8] || '0',
                            status: item[9] || 'approved',
                            crmName: item[10] || '-',
                            originalIndex: idx
                        };
                    } else {
                        return {
                            ...item,
                            dispatchNo: getVal(item, 'dispatchNo', 'Dispatch No'),
                            dispatchDate: getVal(item, 'dispatchDate', 'Dispatch Date'),
                            completeDate: getVal(item, 'completeDate', 'Complete Date', 'Date'),
                            customer: getVal(item, 'customer', 'Customer', 'Customer Name'),
                            product: getVal(item, 'product', 'Product', 'Product Name'),
                            godown: getVal(item, 'godown', 'Godown Name', 'Godown'),
                            orderQty: getVal(item, 'orderQty', 'Order Qty'),
                            dispatchQty: getVal(item, 'dispatchQty', 'Dispatch Qty'),
                            status: getVal(item, 'status', 'Status'),
                            crmName: getVal(item, 'crmName', 'CRM Name'),
                            originalIndex: idx
                        };
                    }
                });
            }
            setHistoryItems(newHistory);
            hasFetchedHistory.current = true;
        } catch (error) {
            console.error('History Fetch Exception:', error);
        } finally {
            setIsLoading(false);
        }
    }, []); // Empty dependencies = Stable Fetcher

    const fetchMasterData = useCallback(async () => {
        if (hasFetchedMaster.current || !MASTER_URL) return;
        try {
            const [productsRes, godownsRes] = await Promise.all([
                fetch(`${MASTER_URL}?sheet=Products`, { redirect: 'follow' }),
                fetch(`${MASTER_URL}?sheet=Products&col=4`, { redirect: 'follow' })
            ]);

            const productsResult = await productsRes.json();
            let newItems = [];
            if (productsResult.success && productsResult.data) {
                newItems = productsResult.data
                    .slice(1)
                    .map(row => Array.isArray(row) ? row[0] : row)
                    .filter(val => val && String(val).trim() !== "");
                newItems = [...new Set(newItems)].sort();
            }

            const godownsResult = await godownsRes.json();
            let newGodowns = [];
            if (godownsResult.success && godownsResult.data) {
                newGodowns = godownsResult.data
                    .flat()
                    .map(val => String(val).trim())
                    .filter(val => val && val.toLowerCase() !== "godown");
                newGodowns = [...new Set(newGodowns)].sort();
            }

            setItemNames(newItems);
            setGodowns(newGodowns);
            hasFetchedMaster.current = true;
        } catch (error) {
            console.error('Error fetching master data:', error);
        }
    }, []); // Stable fetcher

    // On mount: try to load from cache, otherwise fetch
    useEffect(() => {
        const cached = loadFromCache();
        if (cached) {
            setOrders(cached.orders);
            setHistoryItems(cached.history);
            setItemNames(cached.itemNames);
            setGodowns(cached.godowns);
            // Mark refs as fetched to avoid immediate re-fetches
            hasFetchedOrders.current = true;
            hasFetchedHistory.current = true;
            hasFetchedMaster.current = true;
        } else {
            fetchOrders();
            fetchMasterData();
        }
    }, [loadFromCache, fetchOrders, fetchMasterData]);

    // Dedicated Cache Sync Effect: Watches data changes and updates sessionStorage
    // This breaks the circular dependency between fetchers and cache
    useEffect(() => {
        if (orders.length > 0 || historyItems.length > 0 || itemNames.length > 0 || godowns.length > 0) {
            syncCache(orders, historyItems, itemNames, godowns);
        }
    }, [orders, historyItems, itemNames, godowns, syncCache]);

    // When switching tabs, clear local selections and fetch history if needed (cache already used)
    useEffect(() => {
        setSelectedRows({});
        setEditData({});
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab, fetchHistory]);

    // Memoized unique values for filters
    const allUniqueClients = useMemo(() =>
        [...new Set([...orders.map(o => o.clientName), ...historyItems.map(h => h.customer)])].sort(),
        [orders, historyItems]
    );
    const allUniqueGodowns = useMemo(() =>
        [...new Set([...orders.map(o => o.godownName), ...historyItems.map(h => h.godown)])].sort(),
        [orders, historyItems]
    );

    // Memoized sorting logic
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
            orders.filter(item => {
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

    const filteredAndSortedHistory = useMemo(() =>
        getSortedItems(
            historyItems.filter(item => {
                const matchesSearch = Object.values(item).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesClient = clientFilter === '' || item.customer === clientFilter;
                const matchesGodown = godownFilter === '' || item.godown === godownFilter;
                return matchesSearch && matchesClient && matchesGodown;
            })
        ),
        [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]
    );

    const handleCheckboxToggle = useCallback((realIdx, item) => {
        setSelectedRows(prev => {
            const isSelected = !prev[realIdx];
            const next = { ...prev, [realIdx]: isSelected };

            if (isSelected) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                setEditData(prevEdit => ({
                    ...prevEdit,
                    [realIdx]: {
                        product: item.itemName,
                        godown: item.godownName,
                        dispatchQty: item.dispatchQty,
                        completeDate: yesterdayStr,
                        status: 'Completed'
                    }
                }));
            } else {
                setEditData(prevEdit => {
                    const newEditData = { ...prevEdit };
                    delete newEditData[realIdx];
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
        const indicesToRemove = [];

        Object.keys(selectedRows).forEach(idxStr => {
            const idx = parseInt(idxStr);
            if (selectedRows[idx]) {
                const originalItem = orders.find(o => o.originalIndex === idx);
                if (!originalItem) return;
                const edit = editData[idx] || {};
                rowsToSubmit.push({
                    planningRowNumber: originalItem.sheetRow,
                    dispatchNo: originalItem.dispatchNo,
                    dispatchDate: formatDateToYYYYMMDD(originalItem.dispatchDate),
                    completeDate: formatDateToYYYYMMDD(edit.completeDate || (() => {
                        const d = new Date();
                        d.setDate(d.getDate() - 1);
                        return d;
                    })()),
                    customer: originalItem.clientName,
                    product: edit.product || originalItem.itemName,
                    godown: edit.godown || originalItem.godownName,
                    orderQty: originalItem.qty,
                    dispatchQty: edit.dispatchQty || originalItem.dispatchQty,
                    status: edit.status || 'Completed',
                    crmName: originalItem.crmName
                });
                indicesToRemove.push(idx);
            }
        });

        if (rowsToSubmit.length === 0) return;

        setIsSaving(true);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'Dispatch Completed',
                    rows: rowsToSubmit,
                    sheetId: import.meta.env.VITE_orderToDispatch_SHEET_ID
                }),
                redirect: 'follow'
            });
            const result = await response.json();
            if (result.success) {
                // Force refresh after save
                sessionStorage.removeItem(CACHE_KEY);
                hasFetchedOrders.current = false;
                hasFetchedHistory.current = false;
                await fetchOrders(true);
                await fetchHistory(true);
                setSelectedRows({});
                setEditData({});
            } else {
                alert('Error saving: ' + result.error);
            }
        } catch (error) {
            alert('Network error: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    }, [selectedRows, orders, editData, fetchOrders, fetchHistory]);

    // Manual refresh: clear cache and refetch
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        hasFetchedOrders.current = false;
        hasFetchedHistory.current = false;
        hasFetchedMaster.current = false;
        fetchOrders(true);
        fetchMasterData();
        if (activeTab === 'history') fetchHistory(true);
    }, [fetchOrders, fetchMasterData, fetchHistory, activeTab]);

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header Row with Title, Tabs, Filters, and Actions */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800">Dispatch Completed</h1>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'pending' ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <CheckCircle size={16} />
                        Pending
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <History size={16} />
                        History
                    </button>
                </div>

                <div className="flex-1" />

                {/* Refresh button */}
                <button
                    onClick={handleRefresh}
                    disabled={isLoading || isSaving}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
                >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    Refresh
                </button>

                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-32 lg:w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent outline-none text-sm"
                />
                <SearchableDropdown
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={allUniqueClients}
                    allLabel="All Clients"
                    className="w-32 lg:w-40"
                    focusColor="green-800"
                />
                <SearchableDropdown
                    value={godownFilter}
                    onChange={setGodownFilter}
                    options={allUniqueGodowns}
                    allLabel="All Godowns"
                    className="w-32 lg:w-40"
                    focusColor="green-800"
                />

                {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-800 text-white rounded-lg hover:bg-green-900 shadow-md font-bold text-sm disabled:opacity-50"
                    >
                        {isSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                        {isSaving ? 'Saving...' : 'Save Completion'}
                    </button>
                )}
            </div>

            {(isLoading || isSaving) && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-gray-100">
                        <div className="relative">
                            <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-green-800 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-8 w-8 rounded-full border-4 border-gray-100 border-b-green-800 animate-spin-slow"></div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center">
                            <p className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">
                                {isSaving ? 'Saving' : 'Syncing'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                                {isSaving ? 'Completing Dispatch' : 'Updating Data'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-4 py-3">Action</th>}
                                {[
                                    { label: 'Dispatch No', key: 'dispatchNo' },
                                    { label: 'Dispatch Date', key: 'dispatchDate' },
                                    ...(activeTab === 'pending' ? [{ label: 'Order No', key: 'orderNumber' }] : []),
                                    { label: 'Customer', key: activeTab === 'pending' ? 'clientName' : 'customer' },
                                    { label: 'Product', key: activeTab === 'pending' ? 'itemName' : 'product' },
                                    { label: 'Godown', key: activeTab === 'pending' ? 'godownName' : 'godown', align: 'center' },
                                    { label: 'Order Qty', key: activeTab === 'pending' ? 'qty' : 'orderQty' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty' },
                                    { label: 'Complete Date', key: 'completeDate', color: activeTab === 'pending' ? 'green' : '' },
                                    { label: 'Status', key: 'status', color: activeTab === 'pending' ? 'green' : '', minWidth: activeTab === 'pending' ? '140px' : '120px' },
                                    ...(activeTab === 'pending' ? [{ label: 'CRM Name', key: 'crmName' }] : [])
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : ''} ${col.color === 'green' ? 'text-green-700' : ''}`}
                                        style={col.minWidth ? { minWidth: col.minWidth } : {}}
                                        onClick={() => requestSort(col.key)}
                                    >
                                        <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : ''}`}>
                                            {col.label}
                                            <div className="flex flex-col">
                                                <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-green-800' : 'text-gray-300'} />
                                                <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-green-800' : 'text-gray-300'} />
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                                const realIdx = item.originalIndex;
                                const isSelected = activeTab === 'pending' && !!selectedRows[realIdx];
                                return (
                                    <tr
                                        key={activeTab === 'pending' ? `p-${item.dispatchNo}-${realIdx}` : `h-${item.dispatchNo}-${realIdx}`}
                                        className={`${isSelected ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
                                    >
                                        {activeTab === 'pending' && (
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleCheckboxToggle(realIdx, item)}
                                                    className="rounded text-green-800 focus:ring-green-800 w-4 h-4 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        <td className="px-4 py-3 font-semibold text-gray-900">{item.dispatchNo}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(item.dispatchDate)}</td>
                                        {activeTab === 'pending' && <td className="px-4 py-3 text-gray-600 text-xs">{item.orderNumber}</td>}
                                        <td className="px-4 py-3 font-medium text-gray-800">{item.clientName || item.customer}</td>

                                        <td className={`px-4 py-3 text-gray-600 font-medium whitespace-nowrap relative ${isSelected ? 'z-[70]' : ''}`}>
                                            {activeTab === 'pending' && isSelected ? (
                                                <div className="w-64">
                                                    <SearchableDropdown
                                                        value={editData[realIdx]?.product || item.itemName}
                                                        onChange={(val) => handleEditChange(realIdx, 'product', val)}
                                                        options={itemNames}
                                                        placeholder="Select Product"
                                                        showAll={false}
                                                        focusColor="green-800"
                                                        className="w-full"
                                                    />
                                                </div>
                                            ) : (
                                                item.itemName || item.product
                                            )}
                                        </td>

                                        <td className={`px-4 py-3 text-center font-bold text-gray-800 relative ${isSelected ? 'z-[60]' : ''}`}>
                                            {activeTab === 'pending' && isSelected ? (
                                                <div className="w-40 mx-auto">
                                                    <SearchableDropdown
                                                        value={editData[realIdx]?.godown || item.godownName}
                                                        onChange={(val) => handleEditChange(realIdx, 'godown', val)}
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

                                        <td className="px-4 py-3 border-l border-gray-50 text-xs">{item.qty || item.orderQty}</td>

                                        <td className="px-4 py-3 border-l border-gray-50 text-xs font-bold text-red-800">
                                            {activeTab === 'pending' && isSelected ? (
                                                <input
                                                    type="text"
                                                    value={editData[realIdx]?.dispatchQty || item.dispatchQty}
                                                    onChange={(e) => handleEditChange(realIdx, 'dispatchQty', e.target.value)}
                                                    className="w-full px-1 py-0.5 border rounded text-xs outline-none focus:border-green-800"
                                                />
                                            ) : (
                                                item.dispatchQty
                                            )}
                                        </td>

                                        {activeTab === 'pending' && (
                                            <>
                                                <td className={`px-4 py-3 relative ${isSelected ? 'z-[50]' : ''}`}>
                                                    <input
                                                        type="date"
                                                        disabled={!isSelected}
                                                        value={editData[realIdx]?.completeDate || ''}
                                                        onChange={(e) => handleEditChange(realIdx, 'completeDate', e.target.value)}
                                                        className="px-1 py-0.5 border rounded text-xs outline-none focus:border-green-800"
                                                    />
                                                </td>
                                                <td className={`px-4 py-3 relative ${isSelected ? 'z-[50]' : ''}`}>
                                                    <div className="relative group">
                                                        <select
                                                            disabled={!isSelected}
                                                            value={editData[realIdx]?.status || 'Completed'}
                                                            onChange={(e) => handleEditChange(realIdx, 'status', e.target.value)}
                                                            className={`w-full pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-xs font-semibold appearance-none bg-white transition-all shadow-sm ${isSelected
                                                                    ? 'cursor-pointer hover:border-green-300 focus:ring-2 focus:ring-green-800 focus:border-transparent outline-none'
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
                                                <td className="px-4 py-3 text-gray-600 text-xs">
                                                    {formatDisplayDate(item.completeDate)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-[10px] font-bold uppercase">
                                                        {item.status}
                                                    </span>
                                                </td>
                                            </>
                                        )}
                                        {activeTab === 'pending' && <td className="px-4 py-3 border-l border-gray-50 text-xs">{item.crmName}</td>}
                                    </tr>
                                );
                            })}
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 && (
                                <tr>
                                    <td colSpan={activeTab === 'pending' ? 12 : 9} className="px-4 py-8 text-center text-gray-500 italic">No items found matching your filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View – omitted for brevity, but should be updated similarly */}
            </div>
        </div>
    );
};

export default DispatchComplete;

// Custom Animations (keep as before)
const style = document.createElement('style');
style.textContent = `
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  .animate-spin-slow {
    animation: spin-slow 3s linear infinite;
  }
`;
document.head.appendChild(style);