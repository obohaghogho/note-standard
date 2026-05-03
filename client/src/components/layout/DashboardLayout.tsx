import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { CreateNoteModal } from '../dashboard/CreateNoteModal';
import { BroadcastBanner } from '../chat/BroadcastBanner';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../dashboard/NotificationBell';
import { Menu, Plus } from 'lucide-react';
import { LanguageSelector } from '../common/LanguageSelector';
import { cn } from '../../utils/cn';
import { ErrorBoundary } from 'react-error-boundary';

export function DashboardLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isCreateNoteModalOpen, setIsCreateNoteModalOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, authReady } = useAuth();

    const isUserLoggedIn = !!user;

    useEffect(() => {
        // Essential render trace with version for debugging production navigation hangs
        console.log(`[DashboardLayout v1.1.0] Render: ${location.pathname} | Auth: ${authReady} | User: ${isUserLoggedIn}`);
        
        // Navigation completion check
        const t = setTimeout(() => {
            console.log(`[DashboardLayout v1.1.0] Navigation suspected complete: ${location.pathname}`);
        }, 500);
        return () => clearTimeout(t);
    }, [location.pathname, authReady, isUserLoggedIn]);
    
    if (!authReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    const isChatActiveOnMobile = location.pathname.startsWith('/dashboard/chat');
    
    // Standard Header/Top bar - HIDDEN on mobile when a chat conversation is active
    const renderHeader = () => {
        if (isChatActiveOnMobile) return null;
        
        return (
            <header className={cn(
                "pt-safe min-h-[4rem] border-b border-white/10 px-4 bg-black/40 backdrop-blur-md sticky top-0 z-40 flex items-center",
                "md:flex"
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
                    <button 
                        onClick={() => navigate('/dashboard/settings')}
                        className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20 hover:bg-primary/30 transition-colors"
                        title="View Settings"
                    >
                        {user?.email?.[0].toUpperCase()}
                    </button>
                </div>
            </header>
        );
    };

    return (
        <div className={cn(
            "h-screen-safe text-white flex relative overflow-hidden w-full max-w-full",
            isChatActiveOnMobile ? "bg-gray-950" : "bg-crystal pt-safe pb-safe"
        )}>
            {!isChatActiveOnMobile && <BroadcastBanner />}
            
            {/* Inner ambient glow for dashboard depth */}
            {!isChatActiveOnMobile && <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-purple-500/5 pointer-events-none -z-10" />}

            <Sidebar 
                onCreateNote={() => setIsCreateNoteModalOpen(true)} 
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
            />
            
            <main className={cn(
                "flex-1 transition-all duration-300 min-w-0 flex flex-col w-full h-full relative",
                !isChatActiveOnMobile && "pb-safe md:ml-64",
                isChatActiveOnMobile && "fixed inset-0 z-[60] bg-gray-950 h-[100dvh] w-screen m-0 p-0 md:relative md:inset-auto md:z-0 md:bg-transparent md:ml-64 overscroll-none"
            )}>
                {renderHeader()}

                <div className={cn(
                    "flex-1 w-full flex flex-col min-w-0 relative h-full",
                    isChatActiveOnMobile ? "p-0 overflow-hidden" : "p-4 md:p-8 max-w-7xl mx-auto overflow-y-auto"
                )}>
                    <ErrorBoundary fallback={
                        <div className="p-8 text-center bg-red-500/10 rounded-xl border border-red-500/20 m-4">
                            <h3 className="text-lg font-bold text-red-500">View blocked</h3>
                            <p className="text-gray-400 text-sm mt-1">Please try again or refresh.</p>
                            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm">Refresh Now</button>
                        </div>
                    }>
                        <div className="flex-1 flex flex-col min-w-0 h-full">
                            <Outlet context={{ openCreateNoteModal: () => setIsCreateNoteModalOpen(true), openMobileMenu: () => setIsMobileMenuOpen(true) }} />
                        </div>
                    </ErrorBoundary>
                </div>
            </main>

            <CreateNoteModal
                isOpen={isCreateNoteModalOpen}
                onClose={() => setIsCreateNoteModalOpen(false)}
                onSuccess={() => {
                    setIsCreateNoteModalOpen(false);
                }}
            />
        </div>
    );
}

