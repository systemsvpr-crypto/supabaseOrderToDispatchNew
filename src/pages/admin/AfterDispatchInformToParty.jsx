import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, History, Save, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';

const CACHE_KEY = 'afterDispatchInformData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const AfterDispatchInformToParty = () => {
    const [pendingItems, setPendingItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedRows, setSelectedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    // --- Cache helpers ---
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { pending, history, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) return { pending, history };
        } catch (e) { /* ignore */ }
        return null;
    }, []);

    const saveToCache = useCallback((pending, history) => {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            pending,
            history,
            timestamp: Date.now()
        }));
    }, []);

    // --- Fetch data ---
    const fetchPendingItems = useCallback(async (force = false) => {
        setIsLoading(true);
        try {
            if (!API_URL) return;

            const [planningRes, historyRes] = await Promise.all([
                fetch(`${API_URL}?sheet=Planning&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`),
                fetch(`${API_URL}?sheet=After%20Dispatch&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`)
            ]);

            const [planningResult, historyResult] = await Promise.all([
                planningRes.json(),
                historyRes.json()
            ]);

            // Handling Pending from Planning Sheet
            if (planningResult.success && Array.isArray(planningResult.data)) {
                const planningData = planningResult.data.slice(3);
                const pending = planningData.map((item, idx) => ({
                    originalIndex: idx,
                    sheetRow: item.sheetRow,
                    dispatchNo: item.dispatchNo || '-',
                    dispatchDate: item.dispatchDate || '-',
                    orderNo: item.orderNumber || '-',
                    customerName: item.clientName || '-',
                    productName: item.itemName || '-',
                    godown: item.godownName || '-',
                    crmName: item.crmName || '-',
                    orderQty: item.qty || '0',
                    dispatchQty: item.dispatchQty || '0',
                    columnT: item.columnT || '',
                    columnU: item.columnU || ''
                })).filter(item => {
                    const colT = String(item.columnT || '').trim();
                    const colU = String(item.columnU || '').trim();
                    // Show in pending if: T is empty OR U is empty (only skip if BOTH have values)
                    return colT === '' || colU === '';
                });
                setPendingItems(pending);
            }

            // Handling History from After Dispatch Sheet
            if (historyResult.success && Array.isArray(historyResult.data)) {
                // If it's mode=table, it might contain headers if they aren't handled by backend
                const data = historyResult.data;
                const hasHeaders = data.length > 0 && 
                    (String(data[0].dispatchNo || '').toLowerCase().includes('dispatch') || 
                     String(data[0][0] || '').toLowerCase().includes('dispatch'));
                
                const processData = hasHeaders ? data.slice(1) : data;

                const history = processData.map((item, idx) => ({
                    originalIndex: idx,
                    dispatchNo: item.dispatchNo || (Array.isArray(item) ? item[0] : '-'),
                    dispatchDate: item.dispatchDate || (Array.isArray(item) ? item[1] : '-'),
                    orderNo: item.orderNo || (Array.isArray(item) ? item[2] : '-'),
                    customerName: item.customer || item.customerName || (Array.isArray(item) ? item[3] : '-'),
                    productName: item.productName || (Array.isArray(item) ? item[4] : '-'),
                    godown: item.godown || (Array.isArray(item) ? item[5] : '-'),
                    crmName: item.crmName || (Array.isArray(item) ? item[6] : '-'),
                    orderQty: item.orderQty || (Array.isArray(item) ? item[7] : '0'),
                    dispatchQty: item.dispatchQty || (Array.isArray(item) ? item[8] : '0'),
                    notified: true
                }));
                setHistoryItems(history);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, SHEET_ID]); // Stable fetcher

    // On mount: load from cache or fetch
    useEffect(() => {
        const cached = loadFromCache();
        if (cached) {
            setPendingItems(cached.pending);
            setHistoryItems(cached.history);
        } else {
            fetchPendingItems();
        }
    }, [loadFromCache, fetchPendingItems]);

    // Cache sync effect: automatically save whenever state changes
    useEffect(() => {
        if (pendingItems.length > 0 || historyItems.length > 0) {
            saveToCache(pendingItems, historyItems);
        }
    }, [pendingItems, historyItems, saveToCache]);

    // --- Manual refresh ---
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchPendingItems(true);
    }, [fetchPendingItems]);

    // --- Unique filter values ---
    const allUniqueClients = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.customerName), ...historyItems.map(h => h.customerName)])].sort(),
        [pendingItems, historyItems]
    );
    const allUniqueGodowns = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort(),
        [pendingItems, historyItems]
    );

    // --- Sorting ---
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
            pendingItems.filter(item => {
                const matchesSearch = Object.values(item).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesClient = !clientFilter || item.customerName === clientFilter;
                const matchesGodown = !godownFilter || item.godown === godownFilter;
                return matchesSearch && matchesClient && matchesGodown;
            })
        ),
        [pendingItems, searchTerm, clientFilter, godownFilter, getSortedItems]
    );

    const filteredAndSortedHistory = useMemo(() =>
        getSortedItems(
            historyItems.filter(item => {
                const matchesSearch = Object.values(item).some(val =>
                    String(val).toLowerCase().includes(searchTerm.toLowerCase())
                );
                const matchesClient = !clientFilter || item.customerName === clientFilter;
                const matchesGodown = !godownFilter || item.godown === godownFilter;
                return matchesSearch && matchesClient && matchesGodown;
            })
        ),
        [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]
    );

    // --- Actions ---
    const handleCheckboxToggle = (realIdx) => {
        setSelectedRows(prev => ({ ...prev, [realIdx]: !prev[realIdx] }));
    };

    const handleSave = async () => {
        const selectedItems = pendingItems.filter(item => selectedRows[item.originalIndex]);
        if (selectedItems.length === 0) return;

        setIsSaving(true);
        try {
            const rowsToSubmit = selectedItems.map(item => ({
                dispatchNo: item.dispatchNo,
                customer: item.customerName,
                godown: item.godown,
                productName: item.productName,
                crmName: item.crmName,
                orderQty: item.orderQty,
                dispatchQty: item.dispatchQty,
                status: "yes"
            }));

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'After Dispatch',
                    sheetId: SHEET_ID,
                    rows: rowsToSubmit
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Unknown error');

            // Optimistic update
            const newlyNotified = selectedItems.map(item => ({ ...item, notified: true }));
            const remainingPending = pendingItems.filter(item => !selectedRows[item.originalIndex]);
            const newHistory = [...historyItems, ...newlyNotified];
            setPendingItems(remainingPending);
            setHistoryItems(newHistory);
            setSelectedRows({});

            // Update cache
            saveToCache(remainingPending, newHistory);
        } catch (error) {
            console.error('Error saving to After Dispatch:', error);
            alert(`Failed to save: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const formatDisplayDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).replace(/ /g, '-');
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header Row */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800">Inform to Party After Dispatch</h1>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Mail size={16} />
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

                {/* Refresh Button */}
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

                {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-800 text-white rounded-lg hover:bg-indigo-900 shadow-md font-bold text-sm disabled:opacity-50"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        {isSaving ? 'Saving...' : 'Confirm Post-Notify'}
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

            {/* Data Table (unchanged) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-4 py-3">Action</th>}
                                {[
                                    { label: 'Dispatch No', key: 'dispatchNo', color: 'indigo' },
                                    { label: 'Dispatch Date', key: 'dispatchDate' },
                                    { label: 'Order No', key: 'orderNo' },
                                    { label: 'Customer Name', key: 'customerName' },
                                    { label: 'Product Name', key: 'productName' },
                                    { label: 'Godown', key: 'godown' },
                                    { label: 'CRM Name', key: 'crmName' },
                                    { label: 'Order Qty', key: 'orderQty' },
                                    { label: 'Status', key: 'status' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty', color: 'indigo' },
                                    ...(activeTab === 'history' ? [{ label: 'Notified', key: 'notified' }] : [])
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors ${col.color === 'indigo' ? 'text-indigo-700' : ''}`}
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
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                                const realIdx = item.originalIndex;
                                const isSelected = activeTab === 'pending' && !!selectedRows[realIdx];
                                return (
                                    <tr key={realIdx} className={`${isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}>
                                        {activeTab === 'pending' && (
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleCheckboxToggle(realIdx)}
                                                    className="rounded text-indigo-800 focus:ring-indigo-800 w-4 h-4 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        <td className="px-4 py-3 font-bold text-indigo-700 uppercase">{item.dispatchNo}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{formatDisplayDate(item.dispatchDate)}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.orderNo}</td>
                                        <td className="px-4 py-3 font-semibold text-gray-800">{item.customerName}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.productName}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.godown}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{item.crmName}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.orderQty}</td>
                                        <td className="px-4 py-3">
                                            {activeTab === 'pending' ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                                                    Pending
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700">
                                                    Informed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-indigo-800">{item.dispatchQty}</td>
                                        {activeTab === 'history' && (
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">YES</span>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 && (
                                <tr>
                                    <td colSpan={activeTab === 'pending' ? 12 : 13} className="px-4 py-8 text-center text-gray-500 italic">
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View (unchanged) */}
                <div className="md:hidden divide-y divide-gray-200">
                    {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                        const realIdx = item.originalIndex;
                        const isSelected = activeTab === 'pending' && !!selectedRows[realIdx];
                        return (
                            <div key={realIdx} className={`p-4 space-y-3 ${isSelected ? 'bg-indigo-50/30' : 'bg-white'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3 items-start">
                                        {activeTab === 'pending' && (
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleCheckboxToggle(realIdx)}
                                                className="mt-1 rounded text-indigo-800 focus:ring-indigo-800 w-5 h-5"
                                            />
                                        )}
                                        <div>
                                            <p className="text-[10px] font-bold text-indigo-700 uppercase leading-none mb-1">{item.dispatchNo}</p>
                                            <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.customerName}</h4>
                                            <p className="text-[10px] mt-1 text-gray-500">Order: {item.orderNo} | {item.productName}</p>
                                        </div>
                                    </div>
                                    {activeTab === 'history' && (
                                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Notified</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-600 pt-1">
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Date</span>
                                        <p className="font-medium">{formatDisplayDate(item.dispatchDate)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Godown</span>
                                        <p className="font-medium truncate">{item.godown}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">CRM</span>
                                        <p className="font-medium truncate">{item.crmName}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Order Qty</span>
                                        <p className="font-medium">{item.orderQty}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Status</span>
                                        <p className="font-medium truncate">
                                            {activeTab === 'pending' ? (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600">
                                                    Pending
                                                </span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-600">
                                                    Informed
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-tight">Dispatch Qty</span>
                                        <p className="font-bold text-indigo-800">{item.dispatchQty}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic text-sm">No items found.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AfterDispatchInformToParty;