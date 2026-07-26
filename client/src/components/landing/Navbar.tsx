import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Globe, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { LanguageSelector } from '../common/LanguageSelector';
import { usePWAInstall } from '../../context/PWAInstallContext';

export const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { installApp } = usePWAInstall();

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                        <div className="w-full h-full bg-background rounded-[11px] flex items-center justify-center">
                            <span className="font-black text-xl bg-clip-text text-transparent bg-gradient-to-tr from-emerald-400 to-teal-300">N</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-lg leading-tight tracking-tight flex items-center gap-1.5">
                            NoteStandard
                            <span className="text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Pro</span>
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">Real-Time Messaging & Wallet</span>
                    </div>
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
                    <a href="#pricing" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Pricing</a>
                    <a href="#security" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Security</a>
                    <button onClick={installApp} className="text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer">Install App</button>
                    <div className="h-6 w-[1px] bg-white/10 mx-2" />
                    <LanguageSelector />
                    <Link to="/login" className="text-sm font-medium px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">Login</Link>
                    <Link to="/signup" className="text-sm font-medium px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">Get Started</Link>
                </div>

                <div className="flex md:hidden items-center gap-2">
                    <LanguageSelector />
                    <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-400 hover:text-white">
                        {isOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-20 left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-white/10 p-6 md:hidden flex flex-col gap-4"
                >
                    <a href="#features" className="text-base font-medium text-gray-400 hover:text-white">Features</a>
                    <a href="#pricing" className="text-base font-medium text-gray-400 hover:text-white">Pricing</a>
                    <a href="#security" className="text-base font-medium text-gray-400 hover:text-white">Security</a>
                    <button onClick={() => { setIsOpen(false); installApp(); }} className="text-base font-medium text-primary hover:text-primary/80 text-left cursor-pointer">Install App</button>
                    <div className="h-px bg-white/10 my-2" />
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium">Language</span>
                        <LanguageSelector />
                    </div>
                    <div className="h-px bg-white/10 my-2" />
                    <Link to="/login" className="w-full py-3 text-center font-medium bg-white/5 rounded-lg block">Login</Link>
                    <Link to="/signup" className="w-full py-3 text-center font-medium bg-primary text-white rounded-lg block">Get Started</Link>
                </motion.div>
            )}
        </nav>
    );
};
