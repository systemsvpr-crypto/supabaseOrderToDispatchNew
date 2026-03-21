import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BellRing, History, Save, X, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useToast } from '../../contexts/ToastContext';

const ORDER_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;

// Cache configuration
const CACHE_KEY = 'informToPartyBeforeData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const InformToPartyBeforeDispatch = () => {
    const [pendingItems, setPendingItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedRows, setSelectedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const { showToast } = useToast();

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
        } catch (e) {
            return dateStr;
        }
    };

    // Fetch data from Planning sheet – using columns K and L
    const fetchData = useCallback(async (forceRefresh = false) => {
        setIsLoading(true);
        try {
            const planningRes = await fetch(`${ORDER_URL}?sheet=Planning&mode=table`);
            const planningResult = await planningRes.json();

            if (planningResult.success && planningResult.data) {
                const allItems = planningResult.data.slice(4).map((item, index) => ({
                    id: `P${index}`,
                    orderNo: item.orderNumber || '-',
                    dispatchNo: item.dispatchNo || '-',
                    clientName: item.clientName || '-',
                    godownName: item.godownName || '-',
                    itemName: item.itemName || '-',
                    qty: item.qty || '-',
                    dispatchQty: item.dispatchQty || '-',
                    dispatchDate: item.dispatchDate || '-',
                    columnK: item.columnK || '',
                    columnL: item.columnL || ''
                }));

                // Pending: columnK not empty, columnL empty
                const pending = allItems.filter(item =>
                    item.columnK && item.columnK.toString().trim() !== '' &&
                    (!item.columnL || item.columnL.toString().trim() === '')
                );

                // History: both columnK and columnL not empty
                const history = allItems.filter(item =>
                    item.columnK && item.columnK.toString().trim() !== '' &&
                    item.columnL && item.columnL.toString().trim() !== ''
                );

                setPendingItems(pending);
                setHistoryItems(history);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, []); // Stable fetcher

    // Load cached data on mount, or fetch if stale/missing
    useEffect(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { pendingItems: cachedPending, historyItems: cachedHistory, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < CACHE_DURATION) {
                    setPendingItems(cachedPending);
                    setHistoryItems(cachedHistory);
                    return; // Use cache, skip fetch
                }
            } catch (e) {
                // Cache corrupted – ignore and fetch fresh
            }
        }
        fetchData();
    }, [fetchData]);

    // Auto‑cache on state changes
    useEffect(() => {
        if (pendingItems.length > 0 || historyItems.length > 0) {
            const cacheData = {
                pendingItems,
                historyItems,
                timestamp: Date.now()
            };
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        }
    }, [pendingItems, historyItems]);

    // Memoized Filter Options
    const allUniqueClients = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.clientName), ...historyItems.map(h => h.clientName)])].sort(),
        [pendingItems, historyItems]
    );

    const allUniqueGodowns = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.godownName), ...historyItems.map(h => h.godownName)])].sort(),
        [pendingItems, historyItems]
    );

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

    const filteredAndSortedPending = useMemo(() => {
        const filtered = pendingItems.filter(item => {
            const matchesSearch = Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase())
            );
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [pendingItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    const filteredAndSortedHistory = useMemo(() => {
        const filtered = historyItems.filter(item => {
            const matchesSearch = Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase())
            );
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    const handleCheckboxToggle = (dn) => {
        const newSelected = { ...selectedRows };
        if (newSelected[dn]) {
            delete newSelected[dn];
        } else {
            newSelected[dn] = 'yes';
        }
        setSelectedRows(newSelected);
    };

    const handleStatusChange = (dn, status) => {
        setSelectedRows(prev => ({
            ...prev,
            [dn]: status
        }));
    };

    const handleSave = async () => {
        const rowsToSubmit = [];
        const selectedDNs = Object.keys(selectedRows);

        if (selectedDNs.length === 0) return;

        setIsLoading(true);
        const now = new Date().toISOString();

        selectedDNs.forEach(dn => {
            const item = pendingItems.find(i => i.dispatchNo === dn);
            if (!item) return;

            rowsToSubmit.push({
                timestamp: now,
                columnB: item.dispatchNo,
                columnC: selectedRows[dn] === 'yes' ? 'YES' : 'NO',
                columnD: item.clientName,
                columnE: item.godownName,
                columnF: item.itemName,
                columnG: item.qty,
                columnH: item.dispatchQty,
                dispatchNo: item.dispatchNo
            });
        });

        try {
            const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

            await fetch(ORDER_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sheetId: SHEET_ID,
                    sheet: "Before Dispatch",
                    rows: rowsToSubmit
                })
            });

            showToast('Confirmation saved to "Before Dispatch" sheet successfully!', 'success');

            // Clear selected rows and refresh data
            setSelectedRows({});
            handleRefresh();
        } catch (error) {
            console.error('Submission failed:', error);
            showToast('Failed to submit confirmation. Please check console.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Manual refresh
    const handleRefresh = () => {
        sessionStorage.removeItem(CACHE_KEY);
        fetchData(true);
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-gray-100 max-w-[1200px] mx-auto">
                {/* Top row: title, tabs, actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight whitespace-nowrap">Inform to Party (Before Dispatch)</h1>

                        <div className="flex bg-gray-100 p-1 rounded">
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                                    }`}
                            >
                                <BellRing size={16} />
                                Pending
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                                    }`}
                            >
                                <History size={16} />
                                History
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>

                        {(searchTerm || clientFilter || godownFilter) && (
                            <button
                                onClick={() => { setSearchTerm(''); setClientFilter(''); setGodownFilter(''); }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-xs font-bold border border-green-100"
                            >
                                <X size={14} />
                                Clear Filters
                            </button>
                        )}

                        {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover shadow-md font-bold text-sm ml-auto sm:ml-0"
                            >
                                <Save size={16} />
                                Confirm Notification
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    <input
                        type="text"
                        placeholder="Search records..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
                    />
                    <SearchableDropdown
                        value={clientFilter}
                        onChange={setClientFilter}
                        options={allUniqueClients}
                        allLabel="All Clients"
                        className="w-full"
                        focusColor="primary"
                    />
                    <SearchableDropdown
                        value={godownFilter}
                        onChange={setGodownFilter}
                        options={allUniqueGodowns}
                        allLabel="All Godowns"
                        className="w-full"
                        focusColor="primary"
                    />
                </div>
            </div>

            {/* Loading overlay */}
            {isLoading && (
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
                                Retrieving Records
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden max-w-[1200px] mx-auto">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-6 py-4 text-center">Action</th>}
                                {[
                                    ...(activeTab === 'pending' ? [{ label: 'Order No', key: 'orderNo' }] : []),
                                    { label: 'Dispatch Number', key: 'dispatchNo', color: 'blue' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                                    { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown Name', key: 'godownName', align: 'center' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Qty', key: 'qty', align: 'right' },
                                    ...(activeTab === 'history' ? [{ label: 'Status', key: 'status', align: 'center' }] : [])
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.color === 'blue' ? 'text-primary' : ''} ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
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
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => (
                                <tr key={item.id} className={`${selectedRows[item.dispatchNo] ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                                    {activeTab === 'pending' && (
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center gap-2 justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedRows[item.dispatchNo]}
                                                    onChange={() => handleCheckboxToggle(item.dispatchNo)}
                                                    className="rounded text-primary focus:ring-primary cursor-pointer w-4 h-4"
                                                />
                                                {selectedRows[item.dispatchNo] && (
                                                    <select
                                                        value={selectedRows[item.dispatchNo]}
                                                        onChange={(e) => handleStatusChange(item.dispatchNo, e.target.value)}
                                                        className="text-[10px] font-bold border border-green-200 rounded px-1 py-0.5 bg-green-50 text-primary outline-none focus:ring-1 focus:ring-primary animate-in fade-in zoom-in duration-200"
                                                    >
                                                        <option value="yes">YES</option>
                                                        <option value="no">NO</option>
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {activeTab === 'pending' && <td className="px-6 py-4">{item.orderNo}</td>}
                                    <td className="px-6 py-4 font-bold text-primary">{item.dispatchNo}</td>
                                    <td className="px-6 py-4 font-medium text-gray-700 text-right">{item.dispatchQty}</td>
                                    <td className="px-6 py-4 font-bold text-primary text-center">{formatDisplayDate(item.dispatchDate)}</td>
                                    <td className="px-6 py-4">{item.clientName}</td>
                                    <td className="px-6 py-4 text-center">{item.godownName}</td>
                                    <td className="px-6 py-4">{item.itemName}</td>
                                    <td className="px-6 py-4 text-right">{item.qty}</td>
                                    {activeTab === 'history' && (
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-700">
                                                Informed
                                            </span>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 && (
                                <tr>
                                    <td colSpan="14" className="px-4 py-8 text-center text-gray-500 italic">
                                        No items found matching your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-gray-200">
                    {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => (
                        <div key={item.id} className={`p-4 space-y-3 ${selectedRows[item.dispatchNo] ? 'bg-green-50/30' : 'bg-white'}`}>
                            <div className="flex justify-between items-start">
                                <div className="flex gap-3 items-start">
                                    {activeTab === 'pending' && (
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!!selectedRows[item.dispatchNo]}
                                                onChange={() => handleCheckboxToggle(item.dispatchNo)}
                                                className="mt-1 rounded text-primary focus:ring-primary w-5 h-5 cursor-pointer"
                                            />
                                            {selectedRows[item.dispatchNo] && (
                                                <select
                                                    value={selectedRows[item.dispatchNo]}
                                                    onChange={(e) => handleStatusChange(item.dispatchNo, e.target.value)}
                                                    className="text-[10px] font-bold border border-green-200 rounded px-1.5 py-1 bg-green-50 text-primary outline-none animate-in fade-in slide-in-from-left-2 duration-200"
                                                >
                                                    <option value="yes">YES</option>
                                                    <option value="no">NO</option>
                                                </select>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[10px] font-bold text-primary uppercase leading-none mb-1">{item.dispatchNo}</p>
                                        <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.clientName}</h4>
                                        <p className="text-[10px] mt-1 text-gray-500">{item.itemName}</p>
                                    </div>
                                </div>
                                {activeTab === 'history' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700">
                                        Informed
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-600 pt-1">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[9px] uppercase font-bold">Disp Qty</span>
                                    <span className="font-bold text-primary">{item.dispatchQty}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[9px] uppercase font-bold">Disp Date</span>
                                    <span className="font-bold text-primary">{formatDisplayDate(item.dispatchDate)}</span>
                                </div>
                                {activeTab === 'pending' && (
                                    <div className="flex flex-col">
                                        <span className="text-gray-400 text-[9px] uppercase font-bold">Order No</span>
                                        <span className="font-medium">{item.orderNo}</span>
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[9px] uppercase font-bold">Godown</span>
                                    <span className="font-medium truncate">{item.godownName}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic text-sm">No items found matching your filters.</div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default InformToPartyBeforeDispatch;
