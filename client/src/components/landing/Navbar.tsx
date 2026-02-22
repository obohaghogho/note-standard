import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { LanguageSelector } from '../common/LanguageSelector';

export const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/5 backdrop-blur-lg border-b border-white/10' : 'bg-transparent'}`}>
            <div className="max-w-7xl mx-auto px-3 sm:px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white">N</div>
                    <span className="font-bold text-xl tracking-tight">Note Standard</span>
                </div>

                <div className="hidden md:flex items-center gap-8">
                    <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
                    <a href="#pricing" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Pricing</a>
                    <a href="#security" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Security</a>
                    <div className="h-6 w-[1px] bg-white/10 mx-2" />
                    <LanguageSelector />
                    <Link to="/login" className="text-sm font-medium px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">Login</Link>
                    <Link to="/signup" className="text-sm font-medium px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">Get Started</Link>
                </div>

                <button onClick={() => setIsOpen(!isOpen)} className="md:hidden p-2 text-gray-400 hover:text-white">
                    {isOpen ? <X /> : <Menu />}
                </button>
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
                    <div className="h-px bg-white/10 my-2" />
                    <Link to="/login" className="w-full py-3 text-center font-medium bg-white/5 rounded-lg block">Login</Link>
                    <Link to="/signup" className="w-full py-3 text-center font-medium bg-primary text-white rounded-lg block">Get Started</Link>
                </motion.div>
            )}
        </nav>
    );
};
