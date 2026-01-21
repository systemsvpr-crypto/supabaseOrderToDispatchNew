import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  // Initialize user state from localStorage to persist across page refreshes
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const navigate = useNavigate();

  // Sync user state to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [user]);

  const login = async (id, pass) => {
    const allPages = ["Dashboard", "Order", "Disp Plan", "Notify Party", "Disp Done", "Post-Disp Notify", "Settings"];

    // Always check default admin credentials first
    if (id === "admin" && pass === "admin123") {
      const userData = { id: "admin", name: "Administrator", role: "admin", pageAccess: allPages };
      setUser(userData);
      return true;
    }

    // Always check default user credentials
    if (id === "user" && pass === "user123") {
      const userData = { id: "user", name: "User", role: "user", pageAccess: allPages };
      setUser(userData);
      return true;
    }

    // Then check localStorage users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const matched = users.find(u => u.id === id && u.password === pass);

    if (matched) {
      const userData = {
        id: matched.id,
        name: matched.name,
        role: matched.role,
        pageAccess: matched.pageAccess
      };
      setUser(userData);
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
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
