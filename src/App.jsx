import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";

import Dashboard from "./pages/admin/Dashboard";
import Order from "./pages/admin/Order";
import DispatchPlanning from "./pages/admin/DispatchPlanning";
import InformToParty from "./pages/admin/InformToParty";
import DispatchComplete from "./pages/admin/DispatchComplete";
import AfterDispatchInformToParty from "./pages/admin/AfterDispatchInformToParty";
import SkipDelivered from "./pages/admin/SkipDelivered";
import Godown from "./pages/admin/Godown";
import PcReport from "./pages/admin/PcReport";
import Settings from "./pages/admin/Settings";

import AdminLayout from "./layouts/AdminLayout";

function App() {
  const { user } = useAuth();

  // Helper to check if user has access to a specific page name
  const hasAccess = (pageName) => {
    // Case-insensitive check for strict adherence to pageAccess array
    return user?.pageAccess?.some(p => p.toLowerCase().trim() === pageName.toLowerCase().trim());
  };

  // Helper to find the first allowed admin route
  const getFirstAllowedAdminRoute = () => {
    const adminRoutes = [
      { name: "Dashboard", path: "/admin/dashboard" },
      { name: "Order", path: "/admin/order" },
      { name: "Dispatch Planning", path: "/admin/dispatch-planning" },
      { name: "Inform to Party Before Dispatch", path: "/admin/notify-party" },
      { name: "Dispatch Completed", path: "/admin/dispatch-done" },
      { name: "Inform to Party After Dispatch", path: "/admin/post-dispatch-notify" },
      { name: "Skip Delivered", path: "/admin/skip-delivered" },
      { name: "Godown", path: "/admin/godown" },
      { name: "PC Report", path: "/admin/pc-report" },
      { name: "Settings", path: "/admin/settings" },
    ];

    const allowed = adminRoutes.find(r => hasAccess(r.name));
    return allowed ? allowed.path : "/login"; // Fallback to login if somehow no access
  };

  // Protected Route component for specific pages
  const ProtectedRoute = ({ children, pageName }) => {
    if (!user) return <Navigate to="/login" replace />;
    if (!hasAccess(pageName)) {
      return <Navigate to={getFirstAllowedAdminRoute()} replace />;
    }
    return children;
  };

  return (
    <Routes>
      {/* LOGIN */}
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={
                user.role === "admin" || user.role === "manager" ? getFirstAllowedAdminRoute() : "/user/dashboard"
              }
            />
          ) : (
            <Login />
          )
        }
      />

      {/* ADMIN ROUTES */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to={getFirstAllowedAdminRoute()} replace />} />

        <Route path="dashboard" element={
          <ProtectedRoute pageName="Dashboard">
            <Dashboard />
          </ProtectedRoute>
        } />

        <Route path="order" element={
          <ProtectedRoute pageName="Order">
            <Order />
          </ProtectedRoute>
        } />

        <Route path="dispatch-planning" element={
          <ProtectedRoute pageName="Dispatch Planning">
            <DispatchPlanning />
          </ProtectedRoute>
        } />

        <Route path="notify-party" element={
          <ProtectedRoute pageName="Inform to Party Before Dispatch">
            <InformToParty />
          </ProtectedRoute>
        } />

        <Route path="dispatch-done" element={
          <ProtectedRoute pageName="Dispatch Completed">
            <DispatchComplete />
          </ProtectedRoute>
        } />

        <Route path="post-dispatch-notify" element={
          <ProtectedRoute pageName="Inform to Party After Dispatch">
            <AfterDispatchInformToParty />
          </ProtectedRoute>
        } />

        <Route path="skip-delivered" element={
          <ProtectedRoute pageName="Skip Delivered">
            <SkipDelivered />
          </ProtectedRoute>
        } />

        <Route path="godown" element={
          <ProtectedRoute pageName="Godown">
            <Godown />
          </ProtectedRoute>
        } />

        <Route path="pc-report" element={
          <ProtectedRoute pageName="PC Report">
            <PcReport />
          </ProtectedRoute>
        } />

        <Route path="settings" element={
          <ProtectedRoute pageName="Settings">
            <Settings />
          </ProtectedRoute>
        } />
      </Route>

      {/* USER ROUTES */}
      <Route path="/user" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
      </Route>

      {/* ROOT */}
      <Route
        path="/"
        element={
          user ? (
            <Navigate
              to={
                user.role === "admin" || user.role === "manager" ? getFirstAllowedAdminRoute() : "/user/dashboard"
              }
            />
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      {/* CATCH ALL */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;