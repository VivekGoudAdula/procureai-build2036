import React, { useState, useEffect } from "react";
import { FloatingDock } from "./ui/floating-dock";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "../lib/utils";

interface FloatingDockMenuProps {
  visible?: boolean;
}

export default function FloatingDockMenu({ visible = true }: FloatingDockMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useApp();
  const [hoveredNearBottom, setHoveredNearBottom] = useState(false);
  const [isShortScreen, setIsShortScreen] = useState(() => 
    typeof window !== 'undefined' ? window.innerHeight < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsShortScreen(window.innerHeight < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.role === 'admin';

  const links = [
    {
      title: "Dashboard",
      icon: <LayoutDashboard />,
      isActive: location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/admin"),
      onClick: () => navigate(isAdmin ? "/admin" : "/dashboard"),
    },
    ...(isAdmin ? [] : [
      {
        title: "Procurement",
        icon: <ShoppingCart />,
        isActive: location.pathname.startsWith("/procurement"),
        onClick: () => navigate("/procurement"),
      },
    ]),
    ...(isAdmin ? [] : [
      {
        title: "Transactions",
        icon: <History />,
        isActive: location.pathname.startsWith("/transactions"),
        onClick: () => navigate("/transactions"),
      },
    ]),
    ...(isAdmin ? [] : [
      {
        title: "Analytics",
        icon: <BarChart3 />,
        isActive: location.pathname.startsWith("/analytics"),
        onClick: () => navigate("/analytics"),
      },
    ]),
    ...(isAdmin ? [] : [
      {
        title: "Settings",
        icon: <Settings />,
        isActive: location.pathname.startsWith("/settings"),
        onClick: () => navigate("/settings"),
      },
    ]),
    {
      title: "Logout",
      icon: <LogOut />,
      isActive: false,
      onClick: handleLogout,
    },
  ];

  // In short screens (<768px height), auto-hide by default unless hovered. Otherwise follow scroll visibility
  const shouldShow = hoveredNearBottom || (visible && !isShortScreen);

  return (
    <>
      {/* Invisible bottom hover detection sensor */}
      <div 
        onMouseEnter={() => setHoveredNearBottom(true)}
        className="fixed bottom-0 left-0 right-0 h-10 z-40 pointer-events-auto"
      />

      <div 
        onMouseEnter={() => setHoveredNearBottom(true)}
        onMouseLeave={() => setHoveredNearBottom(false)}
        className={cn(
          "fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-in-out",
          shouldShow 
            ? "translate-y-0 opacity-100 pointer-events-auto" 
            : "translate-y-24 opacity-0 pointer-events-none"
        )}
      >
        <FloatingDock
          mobileClassName="translate-y-0"
          items={links}
        />
      </div>
    </>
  );
}
