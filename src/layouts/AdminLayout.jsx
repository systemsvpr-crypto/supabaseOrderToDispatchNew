import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ClipboardList,
  Truck,
  BellRing,
  CheckCircle,
  Mail,
  PackageX,
  Warehouse,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import Footer from "../components/Footer";

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    if (sidebarOpen) setSidebarOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  // Navigation configuration mapping Settings names to routes/icons
  const navigationItems = [
    { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Order", path: "/admin/order", icon: ClipboardList },
    { label: "Dispatch Planning", path: "/admin/dispatch-planning", icon: Truck },
    { label: "Inform to Party Before Dispatch", path: "/admin/notify-party", icon: BellRing },
    { label: "Dispatch Completed", path: "/admin/dispatch-done", icon: CheckCircle },
    { label: "Inform to Party After Dispatch", path: "/admin/post-dispatch-notify", icon: Mail },
    { label: "Skip Delivered", path: "/admin/skip-delivered", icon: PackageX },
    { label: "Godown", path: "/admin/godown", icon: Warehouse },
    { label: "PC Report", path: "/admin/pc-report", icon: FileText },
    { label: "Settings", path: "/admin/settings", icon: SettingsIcon },
  ];

  // Filter items based on user's pageAccess
  const filteredNavItems = navigationItems.filter(item => {
    // Case-insensitive check for strict adherence to pageAccess array
    return user?.pageAccess?.some(p => p.toLowerCase().trim() === item.label.toLowerCase().trim());
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30 h-14 shadow-sm">
        <div className="px-3 sm:px-4 lg:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleSidebar}
              className="lg:hidden hover:text-gray-700 focus:outline-none focus:ring-2 rounded-md p-1.5 transition-colors"
              style={{ color: "#991b1b", focusRingColor: "#991b1b" }}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link
              to={filteredNavItems.length > 0 ? filteredNavItems[0].path : "/admin/dashboard"}
              className="flex items-center gap-2"
            >
              <span
                className="text-lg sm:text-xl font-bold"
                style={{ color: "#991b1b" }}
              >
                Order to Delivery
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-xs font-bold text-gray-900">{user?.name}</span>
              <span className="text-[10px] text-gray-500 capitalize">{user?.role}</span>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 hover:text-gray-700 focus:outline-none focus:ring-2 rounded-md px-2 py-1.5 transition-colors"
              style={{ color: "#991b1b", focusRingColor: "#991b1b" }}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline-block text-sm">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 pt-14">
        {/* Sidebar */}
        <aside
          className={`w-52 sm:w-56 bg-white border-r border-gray-200 fixed top-14 bottom-0 left-0 z-20 transform transition-transform duration-300 ease-in-out lg:translate-x-0 shadow-lg lg:shadow-none ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          <div className="h-full overflow-y-auto pb-16">
            <nav className="p-3 space-y-1">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${isActive(item.path)
                    ? "text-white border-r-4"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  style={
                    isActive(item.path)
                      ? {
                        backgroundColor: "#991b1b",
                        borderRightColor: "#991b1b",
                      }
                      : {}
                  }
                  onClick={closeSidebar}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}

              {filteredNavItems.length === 0 && (
                <div className="p-4 text-center text-xs text-gray-500 italic">
                  No pages assigned. Contact administrator.
                </div>
              )}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-0 lg:ml-56 w-full lg:w-[calc(100%-14rem)] bg-gray-50 min-h-[calc(100vh-3.5rem)] pb-14 sm:pb-20">
          <div className="p-0 sm:p-2">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Fixed Footer */}
      <Footer />

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden backdrop-blur-sm"
          onClick={closeSidebar}
        ></div>
      )}
    </div>
  );
};

export default AdminLayout;
