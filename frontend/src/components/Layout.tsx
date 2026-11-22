import React, { useState, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import FloatingDockMenu from './FloatingDockMenu';
import Topbar from './Topbar';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';

const Layout = () => {
  const { user } = useApp();
  const [dockVisible, setDockVisible] = useState(true);
  const lastScrollTop = useRef(0);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    if (currentScrollTop > lastScrollTop.current + 15 && currentScrollTop > 60) {
      setDockVisible(false);
    } else if (currentScrollTop < lastScrollTop.current - 10 || currentScrollTop <= 60) {
      setDockVisible(true);
    }
    lastScrollTop.current = currentScrollTop;
  };

  return (
    <div className="flex h-dvh min-h-dvh bg-background text-foreground overflow-hidden w-full max-w-full">
      {/* Background Blobs - contained strictly within fixed backdrop */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[35%] h-[35%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[25%] h-[25%] rounded-full bg-secondary/10 blur-[100px]" />
      </div>
      
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        <Topbar />
        
        <main 
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-8 pb-32 sm:pb-36 min-w-0 w-full"
        >
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
          </div>
        </main>
      </div>

      <FloatingDockMenu visible={dockVisible} />
    </div>
  );
};

export default Layout;
