import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('otd_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const navigate = useNavigate();

  const login = async (id, pass) => {
    const API_URL = import.meta.env.VITE_SHEET_orderToDispatch_URL;
    const SHEET_ID = import.meta.env.VITE_orderToDispatch_SHEET_ID;

    try {
      const response = await fetch(`${API_URL}?sheet=Login&mode=table${SHEET_ID ? `&sheetId=${SHEET_ID}` : ''}`);
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        // Find user by ID (case-insensitive)
        const foundUser = result.data.find(u => 
          String(u.id || '').toLowerCase() === String(id).toLowerCase() && 
          String(u.password || '') === String(pass)
        );

        if (foundUser) {
          // Normalize pageAccess (Apps Script might return array or string)
          const rawAccess = foundUser.pageAccess || foundUser.Access || '';
          const pageAccess = Array.isArray(rawAccess) 
            ? rawAccess 
            : String(rawAccess).split(',').map(s => s.trim()).filter(Boolean);

          const userData = {
            id: foundUser.id,
            name: foundUser.name || foundUser.userName || foundUser.id,
            role: (foundUser.role || 'user').toLowerCase(),
            pageAccess: pageAccess
          };

          setUser(userData);
          localStorage.setItem('otd_user', JSON.stringify(userData));
          return true;
        }
      }
    } catch (error) {
      console.error('Login fetch error:', error);
    }

    // Fallback for hardcoded admin during development if sheet fetch fails or user not found
    if (id === "admin" && pass === "admin123") {
      const allPages = ["Dashboard", "Order", "Dispatch Planning", "Inform to Party Before Dispatch", "Dispatch Completed", "Inform to Party After Dispatch", "Skip Delivered", "Godown", "Pc Report", "Settings"];
      const userData = { id: "admin", name: "Administrator", role: "admin", pageAccess: allPages };
      setUser(userData);
      localStorage.setItem('otd_user', JSON.stringify(userData));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('otd_user');
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
