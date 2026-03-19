import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, Loader, X, Clock, History, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';

const CACHE_KEY = 'skipDeliveredData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const SkipDelivered = () => {
    const [pendingItems, setPendingItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedRows, setSelectedRows] = useState({});
    const [editData, setEditData] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const MASTER_URL = import.meta.env.VITE_MASTER_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    const [godowns, setGodowns] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

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

    // --- Cache helpers ---
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { pending, history, godowns, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) {
                return { pending, history, godowns };
            }
        } catch (e) { /* ignore */ }
        return null;
    }, []);

    const saveToCache = useCallback((pending, history, godownsData) => {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            pending,
            history,
            godowns: godownsData,
            timestamp: Date.now()
        }));
    }, []);

    // Fetch data from ORDER sheet and split into pending/history based on columns Q & R - Stable Fetcher
    const fetchItems = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            const [orderRes, skipRes] = await Promise.all([
                fetch(`${API_URL}?sheet=ORDER&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`),
                fetch(`${API_URL}?sheet=Skip&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`)
            ]);

            const [orderResult, skipResult] = await Promise.all([orderRes.json(), skipRes.json()]);

            if (orderResult.success && Array.isArray(orderResult.data)) {
                const pending = orderResult.data.slice(5).filter(item => {
                    const qVal = String(item.columnQ || '').trim();
                    const rVal = String(item.columnR || '').trim();
                    const pendingQty = parseFloat(String(getVal(item, 'planningPendingQty', 11) || '0').replace(/[^0-9.-]+/g, ''));
                    // Only show planned, un-finished items with positive pending quantity
                    return qVal !== '' && rVal === '' && !isNaN(pendingQty) && pendingQty > 0;
                }).map((item, idx) => ({
                    originalIndex: idx,
                    orderNumber: item.orderNumber || '-',
                    orderDate: item.orderDate || '-',
                    clientName: item.clientName || '-',
                    godown: item.godownName || '-',
                    itemName: item.itemName || '-',
                    rate: item.rate || '0',
                    orderQty: item.qty || '0',
                    currentStock: item.currentStock || '-',
                    planningQty: item.planningQty || '0',
                    planningPendingQty: item.planningPendingQty || '0',
                    qtyDelivered: item.qtyDelivered || '0',
                    columnQ: item.columnQ || '',
                    columnR: item.columnR || ''
                }));
                setPendingItems(pending);
            }

            if (skipResult.success && Array.isArray(skipResult.data)) {
                const history = skipResult.data.slice(1) // Strictly skip header row
                    .filter(row => row && (getVal(row, 'orderNumber', 0))) 
                    .map((item, idx) => ({
                        originalIndex: idx,
                        orderNumber: getVal(item, 'orderNumber', 0) || '-',
                        orderDate: getVal(item, 'orderDate', 1) || '-',
                        clientName: getVal(item, 'clientName', 2) || '-',
                        godown: getVal(item, 'godown', 3) || '-',
                        itemName: getVal(item, 'itemName', 4) || '-',
                        rate: getVal(item, 'rate', 5) || '0',
                        orderQty: getVal(item, 'orderQty', 6) || '0',
                        dispatchQty: getVal(item, 'dispatchQty', 7) || '',
                        dispatchDate: getVal(item, 'dispatchDate', 8) || '',
                        godownName: getVal(item, 'godownName', 9) || '-',
                        skipped: true
                    }));
                setHistoryItems(history);
            }
        } catch (error) {
            console.error('Error fetching items:', error);
            setPendingItems([]);
            setHistoryItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, SHEET_ID]);

    const fetchGodowns = useCallback(async () => {
        if (!MASTER_URL) return;
        try {
            const res = await fetch(`${MASTER_URL}?sheet=Products&col=4`);
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                const sortedGodowns = json.data.sort();
                setGodowns(sortedGodowns);
            }
        } catch (error) {
            console.error('fetchGodowns error:', error);
        }
    }, [MASTER_URL]); // Stable: No state dependencies

    // On mount: load from cache or fetch
    useEffect(() => {
        const cached = loadFromCache();
        if (cached) {
            setPendingItems(cached.pending);
            setHistoryItems(cached.history);
            setGodowns(cached.godowns);
        } else {
            fetchItems();
            fetchGodowns();
        }
    }, [loadFromCache, fetchItems, fetchGodowns]);

    // Dedicated Cache Sync Effect
    useEffect(() => {
        if (pendingItems.length > 0 || historyItems.length > 0 || godowns.length > 0) {
            saveToCache(pendingItems, historyItems, godowns);
        }
    }, [pendingItems, historyItems, godowns, saveToCache]);

    // Independent UI State Management - Clear selection/edit data on tab switch
    useEffect(() => {
        setSelectedRows({});
        setEditData({});
    }, [activeTab]);

    // --- Manual refresh ---
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchItems(true);
        fetchGodowns();
    }, [fetchItems, fetchGodowns]);

    // Unique filter options (combine both pending and history)
    const allUniqueClients = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.clientName), ...historyItems.map(h => h.clientName)])].sort(),
        [pendingItems, historyItems]
    );
    const allUniqueGodowns = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort(),
        [pendingItems, historyItems]
    );

    // Sorting logic
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

    const currentItems = activeTab === 'pending' ? pendingItems : historyItems;
    const filteredAndSortedItems = useMemo(() =>
        getSortedItems(
            currentItems.filter(item => {
                const matchesSearch = Object.values(item).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesClient = !clientFilter || item.clientName === clientFilter;
                const matchesGodown = !godownFilter || item.godown === godownFilter;
                return matchesSearch && matchesClient && matchesGodown;
            })
        ),
        [currentItems, searchTerm, clientFilter, godownFilter, getSortedItems]
    );

    const filteredItems = filteredAndSortedItems;

    // Check if any row is selected (for conditional column visibility)
    const anySelected = Object.values(selectedRows).some(Boolean);

    // Checkbox toggle
    const handleCheckboxToggle = (originalIdx) => {
        const isSelected = !selectedRows[originalIdx];
        setSelectedRows(prev => ({ ...prev, [originalIdx]: isSelected }));

        if (isSelected) {
            setEditData(prev => ({
                ...prev,
                [originalIdx]: {
                    dispatchQty: '',
                    dispatchDate: new Date().toISOString().split('T')[0],
                    gstIncluded: 'No',
                    godown: pendingItems.find(item => item.originalIndex === originalIdx)?.godown || ''
                }
            }));
        } else {
            const newEditData = { ...editData };
            delete newEditData[originalIdx];
            setEditData(newEditData);
        }
    };

    // Handle edit changes
    const handleEditChange = (originalIdx, field, value) => {
        setEditData(prev => ({
            ...prev,
            [originalIdx]: { ...prev[originalIdx], [field]: value }
        }));
    };

    // Save action – submit selected items to Skip sheet
    const handleSave = async () => {
        const selectedItems = pendingItems.filter(item => selectedRows[item.originalIndex]);
        if (selectedItems.length === 0) return;

        setIsSaving(true);
        try {
            const formatDateForSubmit = (dateStr) => {
                if (!dateStr || dateStr === '-') return '';
                try {
                    const date = new Date(dateStr);
                    if (isNaN(date.getTime())) return '';
                    const dd = String(date.getDate()).padStart(2, '0');
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const yyyy = date.getFullYear();
                    return `${dd}/${mm}/${yyyy}`;
                } catch {
                    return '';
                }
            };

            const rowsToSubmit = selectedItems.map(item => {
                const edit = editData[item.originalIndex] || {};
                return {
                    orderNumber: item.orderNumber,
                    orderDate: formatDateForSubmit(item.orderDate),
                    clientName: item.clientName,
                    godown: item.godown,
                    itemName: item.itemName,
                    rate: item.rate,
                    orderQty: item.orderQty,
                    dispatchQty: edit.dispatchQty || '',
                    dispatchDate: formatDateForSubmit(edit.dispatchDate),
                    godownName: edit.godown || item.godown
                };
            });

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'Skip',
                    sheetId: SHEET_ID,
                    rows: rowsToSubmit
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            // On success, invalidate cache and refetch
            sessionStorage.removeItem(CACHE_KEY);
            await fetchItems(true);
            setSelectedRows({});
            setEditData({});

            alert('Items successfully submitted to Skip sheet.');
        } catch (error) {
            console.error('Save error:', error);
            alert('Save failed: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header with title, tabs, filters, and action button */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800">Skip Delivered</h1>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Clock size={16} />
                        Pending
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-indigo-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
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
                    className="w-32 lg:w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-800 outline-none text-sm"
                />
                <SearchableDropdown
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={allUniqueClients}
                    allLabel="All Clients"
                    className="w-32 lg:w-40"
                    focusColor="indigo-800"
                />
                <SearchableDropdown
                    value={godownFilter}
                    onChange={setGodownFilter}
                    options={allUniqueGodowns}
                    allLabel="All Godowns"
                    className="w-32 lg:w-40"
                    focusColor="indigo-800"
                />

                {activeTab === 'pending' && anySelected && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-800 text-white rounded-lg hover:bg-indigo-900 shadow-md font-bold text-sm disabled:opacity-50"
                    >
                        {isSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                        {isSaving ? 'Saving...' : 'Mark Skipped'}
                    </button>
                )}
            </div>

            {/* Loading overlay */}
            {(isLoading || isSaving) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                        <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-indigo-800 animate-spin" />
                        <p className="text-sm font-bold text-gray-800">
                            {isLoading ? 'Loading...' : 'Saving...'}
                        </p>
                    </div>
                </div>
            )}

            {/* Data table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Desktop table view */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1600px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-4 py-3">Action</th>}
                                {activeTab === 'pending' && anySelected && (
                                    <>
                                        <th className="px-4 py-3 text-indigo-700">Dispatch Qty</th>
                                        <th className="px-4 py-3 text-indigo-700">Dispatch Date</th>
                                        <th className="px-4 py-3 text-indigo-700">GST Included</th>
                                    </>
                                )}
                                {[
                                    { label: 'Order Number', key: 'orderNumber' },
                                    { label: 'Order Date', key: 'orderDate' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown', key: 'godown' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Rate', key: 'rate' },
                                    { label: 'Order Qty', key: 'orderQty' },
                                    ...(activeTab === 'pending' ? [
                                        { label: 'Current Stock', key: 'currentStock' },
                                        { label: 'Planning Qty', key: 'planningQty' },
                                        { label: 'Planning Pending Qty', key: 'planningPendingQty' },
                                        { label: 'Qty Delivered', key: 'qtyDelivered' }
                                    ] : []),
                                    ...(activeTab === 'history' ? [
                                        { label: 'Dispatch Qty', key: 'dispatchQty' },
                                        { label: 'Dispatch Date', key: 'dispatchDate' },
                                        { label: 'Godown Name', key: 'godownName' }
                                    ] : [])
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => requestSort(col.key)}
                                    >
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
                            {filteredItems.map((item, idx) => {
                                const originalIdx = item.originalIndex || idx;
                                const isSelected = activeTab === 'pending' && !!selectedRows[originalIdx];
                                const edit = editData[originalIdx] || {};
                                return (
                                    <tr key={`${activeTab}-${originalIdx}`} className={isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}>
                                        {activeTab === 'pending' && (
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleCheckboxToggle(originalIdx)}
                                                    className="rounded text-indigo-800 focus:ring-indigo-800 w-4 h-4 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        {/* Extra columns: rendered only if anySelected */}
                                        {activeTab === 'pending' && anySelected && (
                                            <>
                                                <td className="px-4 py-3">
                                                    {isSelected ? (
                                                        <input
                                                            type="number"
                                                            value={edit.dispatchQty || ''}
                                                            onChange={(e) => handleEditChange(originalIdx, 'dispatchQty', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-800 focus:border-indigo-800 outline-none"
                                                            placeholder="Qty"
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isSelected ? (
                                                        <input
                                                            type="date"
                                                            value={formatDateForInput(edit.dispatchDate) || ''}
                                                            onChange={(e) => handleEditChange(originalIdx, 'dispatchDate', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-800 focus:border-indigo-800 outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isSelected ? (
                                                        <div className="relative">
                                                            <select
                                                                value={edit.gstIncluded || 'No'}
                                                                onChange={(e) => handleEditChange(originalIdx, 'gstIncluded', e.target.value)}
                                                                className="w-full pl-3 pr-8 py-1 border border-gray-300 rounded text-sm appearance-none bg-white focus:ring-indigo-800 focus:border-indigo-800 outline-none"
                                                            >
                                                                <option value="Yes">Yes</option>
                                                                <option value="No">No</option>
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-4 py-3 font-semibold text-gray-900">{item.orderNumber}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(item.orderDate)}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{item.clientName}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {isSelected ? (
                                                <SearchableDropdown
                                                    value={edit.godown || ''}
                                                    onChange={(val) => handleEditChange(originalIdx, 'godown', val)}
                                                    options={godowns}
                                                    placeholder="Select Godown"
                                                    showAll={false}
                                                    className="w-full"
                                                />
                                            ) : (
                                                item.godown
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{item.itemName}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.rate}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.orderQty}</td>
                                        {activeTab === 'pending' && (
                                            <>
                                                <td className="px-4 py-3 text-gray-600">{item.currentStock}</td>
                                                <td className="px-4 py-3 font-bold text-indigo-800">{item.planningQty}</td>
                                                <td className="px-4 py-3 text-gray-600">{item.planningPendingQty}</td>
                                                <td className="px-4 py-3 text-gray-600">{item.qtyDelivered}</td>
                                            </>
                                        )}
                                        {activeTab === 'history' && (
                                            <>
                                                <td className="px-4 py-3 text-gray-600 border-l border-gray-100">{item.dispatchQty}</td>
                                                <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(item.dispatchDate)}</td>
                                                <td className="px-4 py-3 text-gray-600">{item.godownName}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={
                                            activeTab === 'pending'
                                                ? (anySelected ? 15 : 12)
                                                : 10
                                        }
                                        className="px-4 py-8 text-center text-gray-500 italic"
                                    >
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile card view */}
                <div className="md:hidden divide-y divide-gray-200">
                    {filteredItems.map((item, idx) => {
                        const originalIdx = item.originalIndex || idx;
                        const isSelected = activeTab === 'pending' && !!selectedRows[originalIdx];
                        const edit = editData[originalIdx] || {};
                        return (
                            <div key={`${activeTab}-${originalIdx}`} className={`p-4 space-y-3 ${isSelected ? 'bg-indigo-50/30' : 'bg-white'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3 items-start">
                                        {activeTab === 'pending' && (
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleCheckboxToggle(originalIdx)}
                                                className="mt-1 rounded text-indigo-800 focus:ring-indigo-800 w-5 h-5 cursor-pointer"
                                            />
                                        )}
                                        <div>
                                            <p className="text-[10px] font-bold text-indigo-700 uppercase leading-none mb-1">{item.orderNumber}</p>
                                            <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.clientName}</h4>
                                            <p className="text-[10px] mt-1 text-gray-500">{item.itemName}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-600 pt-1">
                                    {activeTab === 'pending' && isSelected && (
                                        <>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Qty</span>
                                                <input
                                                    type="number"
                                                    value={edit.dispatchQty || ''}
                                                    onChange={(e) => handleEditChange(originalIdx, 'dispatchQty', e.target.value)}
                                                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Date</span>
                                                <input
                                                    type="date"
                                                    value={formatDateForInput(edit.dispatchDate) || ''}
                                                    onChange={(e) => handleEditChange(originalIdx, 'dispatchDate', e.target.value)}
                                                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">GST Included</span>
                                                <select
                                                    value={edit.gstIncluded || 'No'}
                                                    onChange={(e) => handleEditChange(originalIdx, 'gstIncluded', e.target.value)}
                                                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                                                >
                                                    <option value="Yes">Yes</option>
                                                    <option value="No">No</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Order Date</span>
                                        <p className="font-medium">{formatDisplayDate(item.orderDate)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Godown</span>
                                        {activeTab === 'pending' && isSelected ? (
                                            <SearchableDropdown
                                                value={edit.godown || ''}
                                                onChange={(val) => handleEditChange(originalIdx, 'godown', val)}
                                                options={godowns}
                                                placeholder="Select Godown"
                                                showAll={false}
                                                className="w-full"
                                            />
                                        ) : (
                                            <p className="font-medium truncate">{item.godown}</p>
                                        )}
                                        {activeTab === 'history' && (
                                            <>
                                                <div>
                                                    <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Qty</span>
                                                    <p className="font-medium">{item.dispatchQty}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Date</span>
                                                    <p className="font-medium">{formatDisplayDate(item.dispatchDate)}</p>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Godown Name</span>
                                                    <p className="font-medium">{item.godownName}</p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Rate</span>
                                        <p className="font-medium">₹{item.rate}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Order Qty</span>
                                        <p className="font-medium">{item.orderQty}</p>
                                    </div>
                                    {activeTab === 'pending' && (
                                        <>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Current Stock</span>
                                                <p className="font-medium">{item.currentStock}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Planning Qty</span>
                                                <p className="font-bold text-indigo-800">{item.planningQty}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Planning Pending</span>
                                                <p className="font-medium">{item.planningPendingQty}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Qty Delivered</span>
                                                <p className="font-medium">{item.qtyDelivered}</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredItems.length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic text-sm">No items found.</div>
                    )}
                </div>
            </div>

            {/* Clear filters button */}
            {(searchTerm || clientFilter || godownFilter) && (
                <div className="flex justify-end mt-4">
                    <button
                        onClick={() => { setSearchTerm(''); setClientFilter(''); setGodownFilter(''); }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold"
                    >
                        <X size={14} />
                        Clear Filters
                    </button>
                </div>
            )}
        </div>
    );
};

export default SkipDelivered;