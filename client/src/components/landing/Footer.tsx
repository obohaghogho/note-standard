import { Link } from 'react-router-dom';

export const Footer = () => {
    return (
        <footer className="border-t border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid md:grid-cols-4 gap-8 mb-8">
                    <div className="col-span-1 md:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center font-bold text-xs text-white">N</div>
                            <span className="font-bold text-lg">Note Standard</span>
                        </div>
                        <p className="text-gray-400 text-sm max-w-xs">
                            Note Standard is a technology platform that develops and operates digital applications designed to support online interactions and digital utility tools.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold mb-4">Product</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                            <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                            <li><Link to="/signup" className="hover:text-white transition-colors">Roadmap</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold mb-4">Company</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                            <li><Link to="/" className="hover:text-white transition-colors">Blog</Link></li>
                            <li><Link to="/" className="hover:text-white transition-colors">Careers</Link></li>
                            <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                        </ul>
                    </div>
                </div>

                {/* --- FOOTER BOTTOM --- */}
                <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
                    <div className="text-center md:text-left space-y-1">
                        <p>© 2026 Note Standard</p>
                        <p>NoteStandard is a technology platform operated by Jude Oboh.</p>
                        <div className="flex flex-col gap-1">
                            <p>Email: <a href="mailto:admin@notestandard.com" className="hover:text-white transition-colors">admin@notestandard.com</a></p>
                            <p>Alt Email: <a href="mailto:obohaghogho107@gmail.com" className="hover:text-white transition-colors">obohaghogho107@gmail.com</a></p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};
