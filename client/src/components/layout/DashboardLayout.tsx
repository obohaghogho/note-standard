import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { CreateNoteModal } from '../dashboard/CreateNoteModal';
import { BroadcastBanner } from '../chat/BroadcastBanner';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../dashboard/NotificationBell';
import { Menu, Plus } from 'lucide-react';
import { LanguageSelector } from '../common/LanguageSelector';
import { cn } from '../../utils/cn';

export const DashboardLayout = () => {
    const location = useLocation();
    const [isCreateNoteModalOpen, setIsCreateNoteModalOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, isPro, authReady } = useAuth();

    console.log("[DashboardLayout] Auth Status:", { authReady, user: !!user, path: window.location.pathname });
    
    if (!authReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    const isChatActiveOnMobile = location.pathname.startsWith('/dashboard/chat');
    console.log("Layout rendered");

    return (
        <div className="min-h-[100dvh] text-white flex relative overflow-hidden w-full max-w-full">
            {!isChatActiveOnMobile && <BroadcastBanner />}
            {/* Base Background */}
            <div className="absolute inset-0 bg-[#0a0a0a] -z-20" />

            {/* Pro Background */}
            {isPro && (
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black/50 to-blue-900/20 pointer-events-none -z-10" />
            )}

            <Sidebar 
                onCreateNote={() => setIsCreateNoteModalOpen(true)} 
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
            />
            
            <main className={cn(
                "flex-1 md:ml-64 transition-all duration-300 min-w-0 flex flex-col w-full min-h-[100dvh]",
                isChatActiveOnMobile ? "fixed inset-0 z-[60] bg-[#0a0a0a] md:relative md:inset-auto md:z-0 md:bg-transparent" : "relative"
            )}>
                {/* Header/Top bar */}
                <header className={cn(
                    "pt-safe min-h-[4rem] border-b border-white/10 px-4 bg-black/40 backdrop-blur-md sticky top-0 z-40 items-center",
                    isChatActiveOnMobile ? "hidden md:flex" : "flex"
                )}>
                    {/* Mobile Menu Toggle */}
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden"
                    >
                        <Menu size={24} />
                    </button>

                    {/* Create Note Button (Desktop & Tablet) */}
                    <button
                        onClick={() => setIsCreateNoteModalOpen(true)}
                         className="ml-4 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                        <Plus size={18} />
                        <span className="hidden sm:inline">Create Note</span>
                    </button>

                    <div className="flex-1" />

                    {/* Right-side Utilities */}
                    <div className="flex items-center gap-2 md:gap-4">
                        <NotificationBell />
                        <LanguageSelector />
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20">
                            {user?.email?.[0].toUpperCase()}
                        </div>
                    </div>
                </header>

                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] -z-10 opacity-20" />

                <div className={cn(
                    "flex-1 w-full flex flex-col min-w-0 overflow-y-auto",
                    isChatActiveOnMobile ? "p-0" : "p-4 md:p-8 max-w-7xl mx-auto"
                )}>
                    <Outlet context={{ openCreateNoteModal: () => setIsCreateNoteModalOpen(true) }} />
                </div>
            </main>

            <CreateNoteModal
                isOpen={isCreateNoteModalOpen}
                onClose={() => setIsCreateNoteModalOpen(false)}
                // We could pass a refresh trigger here if we had global state, 
                // but for now the pages might need to listen to DB changes or we rely on SWR/React Query later.
                // Or simply simple reload/callback.
                onSuccess={() => {
                    // Ideally we invalidate queries. 
                    // For now, let's just close. Pages might need to poll or reload.
                    // We'll leave it simple.
                    setIsCreateNoteModalOpen(false);
                }}
            />
        </div>
    );
};
