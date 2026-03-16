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

                <div className="pt-8 mb-4 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
                    <p>© 2024 Note Standard. All rights reserved.</p>
                    <div className="flex gap-4">
                        <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                    </div>
                </div>

                {/* --- LEGAL DISCLAIMER --- */}
                <div className="pt-4 border-t border-white/10 text-[10px] md:text-xs text-gray-500/80 text-center max-w-4xl mx-auto space-y-2 leading-relaxed">
                    <p>
                        <strong>Note Standard is a financial technology software platform, not a bank.</strong> We provide a dashboard interface and facilitate access to payment and digital asset services.
                    </p>
                    <p>
                        All fiat currency processing, transmission, and custody are handled exclusively by licensed third-party financial institutions and payment gateways (e.g., Flutterwave). Note Standard does not hold, manage, or directly transmit fiat funds on behalf of users.
                    </p>
                    <p>
                        All digital asset (cryptocurrency) conversion, processing, and custody are provided by licensed third-party virtual asset service providers (e.g., NOWPayments). Note Standard does not generate wallets, hold private keys, or operate an internal cryptocurrency exchange.
                    </p>
                </div>
            </div>
        </footer>
    );
};
