import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import FloatingDockMenu from './FloatingDockMenu';
import Topbar from './Topbar';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Base application layout shell with top navigation, dynamic page content,
 * and a permanently accessible bottom floating dock.
 */
const Layout = () => {
  const { user } = useApp();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-dvh min-h-dvh bg-background text-foreground overflow-hidden w-full max-w-full">
      {/* Background Blobs - contained strictly within fixed backdrop */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[35%] h-[35%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[25%] h-[25%] rounded-full bg-secondary/10 blur-[100px]" />
      </div>
      
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        <Topbar />
        
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-8 pb-32 sm:pb-36 min-w-0 w-full">
          <div className="max-w-[1400px] mx-auto min-w-0 w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={window.location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="min-w-0 w-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>

            <footer className="mt-14 pt-6 border-t border-slate-200/60 text-center text-[11px] text-slate-400 font-medium">
              Prototype for BUILD 2036. Payments run in Cashfree sandbox; payouts are simulated. Supplier data from Alibaba listings.
            </footer>
          </div>
        </main>
      </div>

      <FloatingDockMenu />
    </div>
  );
};

export default Layout;
