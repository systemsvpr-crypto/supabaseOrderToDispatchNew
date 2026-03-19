import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserPlus, Shield, Check, X, Trash2, Pencil, RefreshCw, Loader, Save } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

const CACHE_KEY = 'settingsUserData';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const Settings = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', id: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const { showToast } = useToast();

    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    const allPages = [
        "Dashboard",
        "Order",
        "Dispatch Planning",
        "Inform to Party Before Dispatch",
        "Dispatch Completed",
        "Inform to Party After Dispatch",
        "Godown",
        "PC Report",
        "Skip Delivered",
        "Settings"
    ];

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

    // Stable Fetcher
    const fetchUsers = useCallback(async (force = false) => {
        if (!force) {
            const cached = loadFromCache();
            if (cached) {
                setUsers(cached);
                return;
            }
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}?sheet=Login&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                // Map from B, C, D, E, F
                const mapped = result.data.map((item, idx) => {
                    const rawAccess = getVal(item, 'pageAccess', 'Access') || '';
                    const pageAccess = Array.isArray(rawAccess) 
                        ? rawAccess 
                        : String(rawAccess).split(',').map(s => s.trim()).filter(Boolean);

                    return {
                        originalIndex: item.originalIndex || idx,
                        name: item.name || getVal(item, 'userName', 'User Name') || '-',
                        id: item.id || getVal(item, 'userId', 'User ID') || '-',
                        password: item.password || '-',
                        role: item.role || 'user',
                        pageAccess
                    };
                });
                // Filter out header or empty rows if necessary (usually slice(0) is fine for mode=table)
                const validUsers = mapped.filter(u => u.id !== '-' && u.id !== 'User ID');
                setUsers(validUsers);
                saveToCache(validUsers);
            } else {
                setUsers([]);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            showToast("Failed to fetch users", "error");
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, SHEET_ID, loadFromCache, saveToCache, showToast]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        return users.filter(user =>
            Object.values(user).some(val =>
                String(val).toLowerCase().includes(userSearchTerm.toLowerCase().trim())
            )
        );
    }, [users, userSearchTerm]);

    const handleAddUser = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            // Prepare row for 'Login' sheet: User Name(B), User ID(C), Password(D), Role(E), Page Access(F)
            const rowData = {
                'User Name': newUser.name,
                'User ID': newUser.id,
                'Password': newUser.password,
                'Role': newUser.role,
                'Page Access': newUser.pageAccess.join(', ')
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'Login',
                    sheetId: SHEET_ID,
                    mode: editingUser !== null ? 'update' : 'append',
                    // Use originalIndex for update, or just append
                    ...(editingUser !== null ? { originalIndex: users.find(u => u.id === editingUser)?.originalIndex } : {}),
                    rows: [rowData]
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Failed to save user');

            showToast(editingUser ? "User updated successfully" : "User added successfully");
            sessionStorage.removeItem(CACHE_KEY);
            await fetchUsers(true);
            setIsModalOpen(false);
            setEditingUser(null);
            setNewUser({ id: '', name: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
        } catch (error) {
            console.error('Error saving user:', error);
            showToast("Failed to save user: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user.id);
        setNewUser({ ...user });
        setIsModalOpen(true);
    };

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Are you sure you want to delete user ${user.name}?`)) return;

        setIsSaving(true);
        try {
            // Usually delete is handled by mark as deleted or specific mode. 
            // Here we assume backend handles row deletion or we just update with empty/specific flag if needed.
            // For now, let's assume we update the status or role to 'deleted' if the backend doesn't support hard delete.
            // Re-fetching after any change is safest.
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    sheet: 'Login',
                    sheetId: SHEET_ID,
                    mode: 'delete', // Assuming backend support for 'delete' mode via originalIndex
                    originalIndex: user.originalIndex
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Failed to delete user');

            showToast("User removed", "error");
            sessionStorage.removeItem(CACHE_KEY);
            await fetchUsers(true);
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast("Failed to delete: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleAccess = (page) => {
        const current = [...newUser.pageAccess];
        if (current.includes(page)) {
            setNewUser({ ...newUser, pageAccess: current.filter(p => p !== page) });
        } else {
            setNewUser({ ...newUser, pageAccess: [...current, page] });
        }
    };

    const handleToggleAll = (select) => {
        setNewUser({ ...newUser, pageAccess: select ? [...allPages] : [] });
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 rounded-lg text-red-800"><Shield size={20} /></div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">User Settings</h1>
                        <p className="text-gray-500 text-xs">Manage authentication & permissions</p>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchUsers(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="w-40 lg:w-56 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-800 outline-none text-sm transition-all"
                    />
                    <button
                        onClick={() => {
                            setEditingUser(null);
                            setNewUser({ id: '', name: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-800 text-white rounded-xl hover:bg-red-900 transition-all font-bold text-sm shadow-md active:scale-95"
                    >
                        <UserPlus size={16} />
                        Add User
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin max-h-[500px]">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                <th className="px-6 py-4">User Info</th>
                                <th className="px-6 py-4">Credentials</th>
                                <th className="px-6 py-4">Page Access</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{u.name}</div>
                                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider bg-indigo-50 px-1.5 py-0.5 rounded inline-block mt-1">{u.role}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs font-mono text-gray-500">ID: <span className="text-gray-900 font-bold">{u.id}</span></div>
                                            <div className="text-xs font-mono text-gray-500">PW: <span className="text-gray-400">••••••••</span></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {u.pageAccess.map(p => (
                                                <span key={p} className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded text-[10px] font-medium">
                                                    {p}
                                                </span>
                                            ))}
                                            {u.pageAccess.length === 0 && <span className="text-gray-400 italic text-[10px]">No access</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleEditUser(u)}
                                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                title="Edit User"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Delete User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-gray-500 italic">No users found. Try searching or refresh data.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden mt-4 space-y-3">
                {filteredUsers.map(u => (
                    <div key={u.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-gray-900">{u.name}</h4>
                                <span className="text-[9px] font-bold text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">{u.role}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEditUser(u)} className="p-2 text-indigo-600 bg-indigo-50 rounded-lg"><Pencil size={16} /></button>
                                <button onClick={() => handleDeleteUser(u)} className="p-2 text-red-600 bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-lg text-xs font-mono space-y-1">
                            <div>ID: {u.id}</div>
                            <div>PW: ••••••••</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {u.pageAccess.map(p => (
                                <span key={p} className="px-1.5 py-0.5 bg-white border border-gray-100 rounded text-[9px] text-gray-600">{p}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {(isLoading || isSaving) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                        <Loader className="animate-spin text-red-800" size={32} />
                        <p className="text-sm font-bold text-gray-700">{isLoading ? 'Syncing User Data...' : 'Saving Changes...'}</p>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-6 bg-red-800 text-white flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingUser ? 'Update User' : 'Add System User'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleAddUser} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scrollbar-thin">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User Name</label>
                                    <input type="text" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 outline-none text-sm" placeholder="User Name" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID / Username</label>
                                    <input type="text" required value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 outline-none text-sm font-mono" placeholder="User ID" disabled={editingUser !== null} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Account Password</label>
                                    <input type="password" required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 outline-none text-sm font-mono" placeholder="••••••••" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">System Role</label>
                                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-800 outline-none text-sm">
                                        <option value="user">User</option>
                                        <option value="manager">Admin</option>
                                       
                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Module Permissions</label>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => handleToggleAll(true)}
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded transition-colors"
                                        >
                                            Select All
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => handleToggleAll(false)}
                                            className="text-[10px] font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-1 rounded transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    {allPages.map(page => (
                                        <label key={page} className={`flex items-center gap-2 text-[11px] p-2 border rounded-lg cursor-pointer transition-all ${newUser.pageAccess.includes(page) ? 'bg-red-50 border-red-200 text-red-900 font-bold' : 'bg-white border-gray-200 text-gray-600'}`}>
                                            <input type="checkbox" checked={newUser.pageAccess.includes(page)} onChange={() => handleToggleAccess(page)} className="rounded text-red-800 focus:ring-red-800 w-4 h-4 cursor-pointer" />
                                            {page}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-600 font-bold text-sm hover:underline">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-8 py-2.5 bg-red-800 text-white rounded-xl hover:bg-red-900 shadow-lg font-bold text-sm active:scale-95 transition-all">
                                    {isSaving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                                    {isSaving ? 'Processing...' : (editingUser ? 'Update Profile' : 'Create Account')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
