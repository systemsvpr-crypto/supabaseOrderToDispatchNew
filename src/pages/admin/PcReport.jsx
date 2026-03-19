import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Loader, Save, RefreshCcw, ChevronUp, ChevronDown } from 'lucide-react';

const CACHE_KEY = 'pcReportData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const PcReport = () => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({
        stage: '',
        status: 'Running',
        remarks: ''
    });
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

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
        } catch { return dateStr; }
    };

    // --- Cache helpers ---
    const loadFromCache = useCallback(() => {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        try {
            const { items, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) return items;
        } catch (e) { /* ignore */ }
        return null;
    }, []);

    const saveToCache = useCallback((itemsData) => {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items: itemsData, timestamp: Date.now() }));
    }, []);

    // Stable Fetcher
    const fetchData = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}?sheet=PC Report&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                return result.data.map((item, idx) => ({
                    originalIndex: idx,
                    orderNumber: getVal(item, 'orderNumber', 'Unique Number', 'Order No') || '-',
                    plannedDate: getVal(item, 'plannedDate', 'Planned Date') || '-',
                    stepName: getVal(item, 'stepName', 'Step Name', 'Stage') || '-',
                    who: getVal(item, 'who', 'Who') || '-',
                    clientName: getVal(item, 'clientName', 'Client Name', 'Client') || '-',
                    godown: getVal(item, 'godown', 'Godown') || '-',
                    itemName: getVal(item, 'itemName', 'Item Name', 'Product') || '-',
                    orderQty: getVal(item, 'orderQty', 'Order Qty', 'Qty') || '0',
                    status: getVal(item, 'status', 'Status') || '-',
                    remarks: getVal(item, 'remarks', 'Remarks') || '-'
                }));
            }
            return [];
        } catch (error) {
            console.error('Error fetching data:', error);
            return [];
        }
    }, [API_URL, SHEET_ID]);

    const loadData = useCallback(async (force = false) => {
        setIsLoading(true);
        if (!force) {
            const cached = loadFromCache();
            if (cached) {
                setItems(cached);
                setIsLoading(false);
                return;
            }
        }
        const freshData = await fetchData();
        setItems(freshData);
        setIsLoading(false);
    }, [fetchData, loadFromCache]);

    // Initial load
    useEffect(() => { loadData(); }, [loadData]);

    // Automated Cache Sync
    useEffect(() => {
        if (items.length > 0) saveToCache(items);
    }, [items, saveToCache]);

    // Refresh Handler
    const handleRefresh = useCallback(() => {
        sessionStorage.removeItem(CACHE_KEY);
        loadData(true);
    }, [loadData]);

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
            const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            if (sortConfig.key === 'plannedDate') {
                const aDate = new Date(aVal), bDate = new Date(bVal);
                if (!isNaN(aDate) && !isNaN(bDate)) return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
            }
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [sortConfig]);

    // Filter and Sort - Memoized
    const filteredAndSortedItems = useMemo(() => {
        const filtered = items.filter(item =>
            Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase().trim())
            )
        );
        return getSortedItems(filtered);
    }, [items, searchTerm, getSortedItems]);

    const openReportModal = useCallback((item) => {
        setCurrentItem(item);
        setFormData({
            stage: item.stepName !== '-' ? item.stepName : '',
            status: 'Running',
            remarks: ''
        });
        setModalOpen(true);
    }, []);

    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!currentItem) return;

        setIsSaving(true);
        try {
            const rowsToSubmit = [{
                orderNumber: currentItem.orderNumber,
                plannedDate: currentItem.plannedDate,
                stepName: formData.stage,
                who: currentItem.who,
                clientName: currentItem.clientName,
                godown: currentItem.godown,
                itemName: currentItem.itemName,
                orderQty: currentItem.orderQty,
                status: formData.status,
                remarks: formData.remarks
            }];

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'Flw-Up',
                    sheetId: SHEET_ID,
                    rows: rowsToSubmit
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Unknown error');

            sessionStorage.removeItem(CACHE_KEY);
            await loadData(true);
            setModalOpen(false);
        } catch (error) {
            console.error('Submit error:', error);
            alert('Submission failed: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    }, [currentItem, formData, API_URL, SHEET_ID, loadData]);

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800">PC Report</h1>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-bold border border-indigo-100"
                >
                    <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
                    Refresh
                </button>
                <div className="flex-1" />
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-40 lg:w-64 px-10 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-sm transition-all"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin max-h-[500px]">
                    <table className="w-full text-left border-collapse min-w-[1400px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                <th className="px-4 py-3 sticky left-0 bg-gray-50 z-20">Action</th>
                                {[
                                    { label: 'Unique Number', key: 'orderNumber' },
                                    { label: 'Planned Date', key: 'plannedDate' },
                                    { label: 'Step Name', key: 'stepName' },
                                    { label: 'Who', key: 'who' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown', key: 'godown' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Order Qty', key: 'orderQty' },
                                    { label: 'Status', key: 'status' },
                                    { label: 'Remarks', key: 'remarks' }
                                ].map((col) => (
                                    <th key={col.key} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => requestSort(col.key)}>
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            <div className="flex flex-col">
                                                <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-gray-300'} />
                                                <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-gray-300'} />
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {filteredAndSortedItems.map((item) => (
                                <tr key={item.originalIndex} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50 z-10 border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                        <button onClick={() => openReportModal(item)} className="px-3 py-1 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors">Update</button>
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-gray-900">{item.orderNumber}</td>
                                    <td className="px-4 py-3 text-gray-600">{formatDisplayDate(item.plannedDate)}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.stepName}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.who}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.clientName}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.godown}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.itemName}</td>
                                    <td className="px-4 py-3 text-gray-600">{item.orderQty}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${item.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{item.remarks}</td>
                                </tr>
                            ))}
                            {filteredAndSortedItems.length === 0 && (
                                <tr><td colSpan="11" className="px-4 py-20 text-center text-gray-500 italic">No items found matching your criteria.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden mt-4 space-y-3">
                {filteredAndSortedItems.map((item) => (
                    <div key={item.originalIndex} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
                        <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                            <div>
                                <p className="text-[10px] font-bold text-indigo-700 uppercase">{item.orderNumber}</p>
                                <h4 className="text-sm font-bold text-gray-900">{item.itemName}</h4>
                            </div>
                            <button onClick={() => openReportModal(item)} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-700">Update</button>
                        </div>
                        <div className="grid grid-cols-2 gap-y-2 text-[11px]">
                            <div className="text-gray-500">Planned: <span className="text-gray-800 font-medium">{formatDisplayDate(item.plannedDate)}</span></div>
                            <div className="text-gray-500">Step: <span className="text-gray-800 font-medium">{item.stepName}</span></div>
                            <div className="text-gray-500">Who: <span className="text-gray-800 font-medium">{item.who}</span></div>
                            <div className="text-gray-500">Qty: <span className="text-gray-800 font-bold">{item.orderQty}</span></div>
                            <div className="col-span-2 text-gray-500">Status: <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${item.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span></div>
                        </div>
                    </div>
                ))}
            </div>

            {(isLoading || isSaving) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-200">
                        <Loader className="animate-spin text-indigo-700" size={32} />
                        <p className="text-sm font-bold text-gray-700">{isLoading ? 'Syncing Report Data...' : 'Saving Changes...'}</p>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                        <div className="px-6 py-4 bg-indigo-600 text-white flex justify-between items-center">
                            <h2 className="text-lg font-bold">Update PC Status</h2>
                            <button onClick={() => setModalOpen(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unique Number</label>
                                <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-700 font-semibold">{currentItem?.orderNumber}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Stage / Step Name</label>
                                <input type="text" name="stage" value={formData.stage} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm" placeholder="Enter current stage" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Compliance Status</label>
                                <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm">
                                    <option value="Running">Running</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Order Cancel">Order Cancel</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Remarks</label>
                                <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows="3" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm resize-none" placeholder="Enter details..." />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm font-bold shadow-md hover:shadow-lg transition-all">
                                    {isSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isSaving ? 'Processing...' : 'Submit Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PcReport;