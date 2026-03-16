import React, { useState, useEffect } from 'react';
import { Mail, History, Save } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';

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

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    // Fetch pending items from Planning, filter by columns T and U
    const fetchPendingItems = async () => {
        setIsLoading(true);
        try {
            if (!API_URL) return;

            // Fetch only Planning sheet (columns T and U are now included)
            const planningRes = await fetch(`${API_URL}?sheet=Planning&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`);
            const planningResult = await planningRes.json();

            if (planningResult.success && Array.isArray(planningResult.data)) {
                // Skip first 3 rows (metadata) – adjust if needed
                const planningData = planningResult.data.slice(3);

                // Map API data and include columnT/columnU
                const allItems = planningData.map(item => ({
                    originalIndex: item.originalIndex,
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
                }));

                // Pending: columnT not empty, columnU empty
                const pending = allItems.filter(item => 
                    item.columnT && item.columnT.toString().trim() !== '' && 
                    (!item.columnU || item.columnU.toString().trim() === '')
                );

                // History: both columnT and columnU not empty
                const history = allItems.filter(item => 
                    item.columnT && item.columnT.toString().trim() !== '' && 
                    item.columnU && item.columnU.toString().trim() !== ''
                );

                setPendingItems(pending);
                setHistoryItems(history);
            } else {
                console.error('Failed to fetch Planning data:', planningResult.error);
            }
        } catch (error) {
            console.error('Error fetching pending items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingItems();
    }, []);

    // Compute unique clients and godowns for filters
    const allUniqueClients = [...new Set([...pendingItems.map(o => o.customerName), ...historyItems.map(h => h.customerName)])].sort();
    const allUniqueGodowns = [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort();

    const filteredPending = pendingItems.filter(item => {
        const matchesSearch = Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = !clientFilter || item.customerName === clientFilter;
        const matchesGodown = !godownFilter || item.godown === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
    });

    const filteredHistory = historyItems.filter(item => {
        const matchesSearch = Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = !clientFilter || item.customerName === clientFilter;
        const matchesGodown = !godownFilter || item.godown === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
    });

    const handleCheckboxToggle = (realIdx) => {
        setSelectedRows(prev => ({ ...prev, [realIdx]: !prev[realIdx] }));
    };

    const handleSave = async () => {
        // Gather selected items
        const selectedItems = pendingItems.filter(item => selectedRows[item.originalIndex]);
        if (selectedItems.length === 0) return;

        setIsSaving(true);
        try {
            // Prepare rows for POST to "After Dispatch" sheet
            const rowsToSubmit = selectedItems.map(item => ({
                dispatchNo: item.dispatchNo,               // column B
                customer: item.customerName,               // column C
                godown: item.godown,                       // column D
                productName: item.productName,             // column E
                crmName: item.crmName,                     // column F
                orderQty: item.orderQty,                   // column G
                dispatchQty: item.dispatchQty,             // column H
                status: "yes"                               // column I – always "yes"
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
            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            // On success, move items from pending to history
            const newlyNotified = selectedItems.map(item => ({ ...item, notified: true }));
            const remainingPending = pendingItems.filter(item => !selectedRows[item.originalIndex]);
            setPendingItems(remainingPending);
            setHistoryItems([...historyItems, ...newlyNotified]);
            setSelectedRows({});

        } catch (error) {
            console.error('Error saving to After Dispatch:', error);
            alert(`Failed to save: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Common date formatter
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
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'pending' ? 'bg-white text-indigo-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Mail size={16} />
                        Pending
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'history' ? 'bg-white text-indigo-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <History size={16} />
                        History
                    </button>
                </div>

                <div className="flex-1" />

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

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                {activeTab === 'pending' && <th className="px-4 py-3">Action</th>}
                                <th className="px-4 py-3">Dispatch No</th>
                                <th className="px-4 py-3">Dispatch Date</th>
                                <th className="px-4 py-3">Order No</th>
                                <th className="px-4 py-3">Customer Name</th>
                                <th className="px-4 py-3">Product Name</th>
                                <th className="px-4 py-3">Godown</th>
                                <th className="px-4 py-3">CRM Name</th>
                                <th className="px-4 py-3">Order Qty</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Dispatch Qty</th>
                                {activeTab === 'history' && <th className="px-4 py-3">Notified</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(activeTab === 'pending' ? filteredPending : filteredHistory).map((item) => {
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
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700`}>
                                                    Pending
                                                </span>
                                            ) : (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700`}>
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
                            {(activeTab === 'pending' ? filteredPending : filteredHistory).length === 0 && (
                                <tr>
                                    <td colSpan={activeTab === 'pending' ? 12 : 13} className="px-4 py-8 text-center text-gray-500 italic">
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View (unchanged except status) */}
                <div className="md:hidden divide-y divide-gray-200">
                    {(activeTab === 'pending' ? filteredPending : filteredHistory).map((item) => {
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
                    {(activeTab === 'pending' ? filteredPending : filteredHistory).length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic text-sm">No items found.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AfterDispatchInformToParty;