import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { CreateNoteModal } from '../dashboard/CreateNoteModal';
import { BroadcastBanner } from '../chat/BroadcastBanner';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../dashboard/NotificationBell';
import { Search, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../common/LanguageSelector';
import { useChat } from '../../context/ChatContext';
import { useLocation } from 'react-router-dom';

export const DashboardLayout = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isCreateNoteModalOpen, setIsCreateNoteModalOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, isPro } = useAuth();
    const { activeConversationId } = useChat();
    const location = useLocation();

    const searchParams = new URLSearchParams(location.search);
    const hasChatId = searchParams.get('id');
    const isChatActiveOnMobile = location.pathname.startsWith('/dashboard/chat') && (activeConversationId || hasChatId);

    return (
        <div className="min-h-screen text-white flex relative overflow-hidden">
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
            <main className={`flex-1 ml-0 md:ml-64 transition-all duration-300 min-w-0 flex flex-col max-w-full overflow-hidden ${isChatActiveOnMobile ? 'fixed inset-0 z-[60] bg-[#0a0a0a] w-screen h-[100dvh] overscroll-none' : 'relative min-h-screen'}`}>
                {/* Header/Top bar - hide on mobile if chat is active */}
                <header className={`pt-safe min-h-[4rem] md:min-h-[5rem] border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-black/20 backdrop-blur-md sticky top-0 z-40 ${isChatActiveOnMobile ? 'hidden md:flex' : 'flex'}`}>
                    <div className="flex items-center gap-4 w-full max-w-xl">
                        <button 
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden"
                        >
                            <Menu size={24} />
                        </button>

                        <div className="hidden md:flex items-center gap-4 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 w-96 max-w-full group focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                            <Search size={18} className="text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                id="sidebar-search"
                                name="search"
                                type="text"
                                autoComplete="off"
                                placeholder={t('common.search')}
                                className="bg-transparent border-none outline-none text-sm w-full text-white placeholder:text-gray-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const target = e.target as HTMLInputElement;
                                        if (target.value.trim()) {
                                            navigate(`/dashboard/search?q=${encodeURIComponent(target.value)}`);
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        <NotificationBell />
                        <div className="h-6 w-[1px] bg-white/10 mx-1 md:mx-2" />
                        <LanguageSelector />
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                                {user?.email?.[0].toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] -z-10 opacity-20" />

                <div className={`flex-1 ${isChatActiveOnMobile ? 'p-0 h-full' : 'p-3.5 sm:p-6 md:p-8 max-w-7xl mx-auto'} w-full flex flex-col min-w-0 overflow-hidden`}>
                    {/* Pass the openModal function to child routes via context */}
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
