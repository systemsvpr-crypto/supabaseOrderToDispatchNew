import React, { useState, useEffect } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import SearchableDropdown from '../../components/SearchableDropdown';

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

    const clients = ['Client A', 'Client B', 'Client C', 'Dummy Client'];
    const godowns = ['Godown 1', 'Godown 2', 'Main Store', 'North Warehouse'];
    const itemNames = ['Item 1', 'Item 2', 'Raw Material', 'Finished Good'];

    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');

    useEffect(() => {
        // Data seeding is now handled by Dashboard.jsx for instant calculations
        const savedOrders = JSON.parse(localStorage.getItem('orders') || '[]');
        setOrders(savedOrders);
    }, []);

    // Derive unique clients and godowns from actual data
    const uniqueClients = [...new Set(orders.map(o => o.clientName).filter(Boolean))].sort();
    const uniqueGodowns = [...new Set(orders.map(o => o.godownName).filter(Boolean))].sort();

    const filteredOrders = orders.filter(order => {
        const matchesSearch = Object.values(order).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesClient = clientFilter === '' || order.clientName === clientFilter;
        const matchesGodown = godownFilter === '' || order.godownName === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
    });

    const saveToLocalStorage = (newOrders) => {
        localStorage.setItem('orders', JSON.stringify(newOrders));
        setOrders(newOrders);
    };

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { itemName: '', rate: '', qty: '' }]
        });
    };

    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const lastOrder = orders.length > 0 ? orders[orders.length - 1] : null;
        let nextON = 1;
        let nextSN = 1;

        if (lastOrder) {
            nextON = parseInt(lastOrder.orderNo.split('-')[1]) + 1;
            nextSN = parseInt(lastOrder.serialNo.split('-')[1]) + 1;
        }

        const orderNo = `ON-${String(nextON).padStart(3, '0')}`;

        const newEntries = formData.items.map((item, index) => ({
            serialNo: `SN-${String(nextSN + index).padStart(3, '0')}`,
            orderNo: orderNo,
            clientName: formData.clientName,
            godownName: formData.godownName,
            orderDate: formData.orderDate,
            itemName: item.itemName,
            rate: item.rate,
            qty: item.qty,
            planned: false
        }));

        const updatedOrders = [...orders, ...newEntries];
        saveToLocalStorage(updatedOrders);

        // Reset form
        setFormData({
            orderDate: new Date().toISOString().split('T')[0],
            clientName: '',
            godownName: '',
            items: [{ itemName: '', rate: '', qty: '' }]
        });
        setIsModalOpen(false);
        showToast("Success", "Order saved successfully");
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            {/* Header Row with Title, Filters, and Actions */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h1 className="text-xl font-bold text-gray-800 mr-auto">Orders</h1>

                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-40 lg:w-48 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 focus:border-transparent outline-none text-sm"
                />
                <SearchableDropdown
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={uniqueClients}
                    allLabel="All Clients"
                    className="w-36 lg:w-44"
                />
                <SearchableDropdown
                    value={godownFilter}
                    onChange={setGodownFilter}
                    options={uniqueGodowns}
                    allLabel="All Godowns"
                    className="w-36 lg:w-44"
                />

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 transition-colors font-bold text-sm shadow-md"
                >
                    <Plus size={18} />
                    Add Order
                </button>
            </div>

            {/* Responsive Data List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Table View (Desktop) */}
                <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                <th className="px-4 py-3">Serial No</th>
                                <th className="px-4 py-3">Order No</th>
                                <th className="px-4 py-3">Client Name</th>
                                <th className="px-4 py-3">Godown Name</th>
                                <th className="px-4 py-3">Order Date</th>
                                <th className="px-4 py-3">Item Name</th>
                                <th className="px-4 py-3">Rate</th>
                                <th className="px-4 py-3">Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {[...filteredOrders].reverse().map((order, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-gray-900">{order.serialNo}</td>
                                    <td className="px-4 py-3 text-gray-600">{order.orderNo}</td>
                                    <td className="px-4 py-3 text-gray-600 font-semibold">{order.clientName}</td>
                                    <td className="px-4 py-3 text-gray-600">{order.godownName}</td>
                                    <td className="px-4 py-3 text-gray-600">{order.orderDate}</td>
                                    <td className="px-4 py-3 text-gray-600">{order.itemName}</td>
                                    <td className="px-4 py-3 text-gray-600 font-medium">{order.rate}</td>
                                    <td className="px-4 py-3 text-red-800 font-bold">{order.qty}</td>
                                </tr>
                            ))}
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan="9" className="px-4 py-8 text-center text-gray-500 italic">No orders found matching your filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Card View (Mobile) */}
                <div className="md:hidden divide-y divide-gray-200">
                    {[...filteredOrders].reverse().map((order, idx) => (
                        <div key={idx} className="p-4 space-y-3 bg-white">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase leading-none">SN: {order.serialNo}</span>
                                    <h4 className="text-sm font-bold text-gray-900 mt-0.5">{order.clientName}</h4>
                                </div>
                                <span className="px-2 py-0.5 bg-red-50 text-red-800 rounded text-[10px] font-bold uppercase ring-1 ring-red-100">
                                    {order.orderNo}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-[11px]">
                                <div>
                                    <p className="text-gray-400 mb-0.5 uppercase text-[9px] font-bold tracking-wider">Godown</p>
                                    <p className="font-medium text-gray-700">{order.godownName}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 mb-0.5 uppercase text-[9px] font-bold tracking-wider">Order Date</p>
                                    <p className="font-medium text-gray-700">{order.orderDate}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 mb-0.5 uppercase text-[9px] font-bold tracking-wider">Item Details</p>
                                    <p className="font-bold text-gray-900">{order.itemName}</p>
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <p className="text-gray-400 mb-0.5 uppercase text-[9px] font-bold tracking-wider">Rate</p>
                                        <p className="font-bold text-gray-900">{order.rate}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 mb-0.5 uppercase text-[9px] font-bold tracking-wider">Qty</p>
                                        <p className="font-bold text-red-800">{order.qty}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredOrders.length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic text-sm">No orders found matching your filters.</div>
                    )}
                </div>
            </div>

            {/* Modal */}
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
                                        <select
                                            required
                                            value={formData.clientName}
                                            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-800 outline-none text-sm font-medium shadow-sm transition-all focus:border-red-800"
                                        >
                                            <option value="">Select Client</option>
                                            {clients.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.1em]">Godown Name</label>
                                        <select
                                            required
                                            value={formData.godownName}
                                            onChange={(e) => setFormData({ ...formData, godownName: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-800 outline-none text-sm font-medium shadow-sm transition-all focus:border-red-800"
                                        >
                                            <option value="">Select Godown</option>
                                            {godowns.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
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
                                            <div key={index} className="group relative flex flex-col gap-5 p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-red-900/5 transition-all duration-300 overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-red-800 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-end">
                                                    <div className="sm:col-span-6">
                                                        <label className="text-[9px] font-black text-gray-400 mb-1.5 uppercase tracking-widest block">Item Name</label>
                                                        <select
                                                            required
                                                            value={item.itemName}
                                                            onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-800 focus:bg-white outline-none text-sm font-medium transition-all"
                                                        >
                                                            <option value="">Select Item</option>
                                                            {itemNames.map(i => <option key={i} value={i}>{i}</option>)}
                                                        </select>
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
                                    className="flex items-center justify-center gap-3 px-10 py-3 bg-red-800 text-white rounded-2xl hover:bg-red-900 transition-all font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-red-800/30 active:scale-95"
                                >
                                    <Save size={18} />
                                    Save Order
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Order;
