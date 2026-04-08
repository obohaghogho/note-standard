import { SEO } from '../components/common/SEO';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { Pricing } from '../components/landing/Pricing';
import { Footer } from '../components/landing/Footer';

export const LandingPage = () => {
    return (
        <div className="min-h-[100dvh] bg-crystal text-foreground selection:bg-primary/30 w-full">
            {/* Debug Badge */}
            <div className="fixed top-4 left-4 z-[9999] pointer-events-none">
                <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 backdrop-blur-md text-[10px] font-bold text-emerald-400 uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    UI v2.0 Active
                </div>
            </div>
            <SEO 
                title="Professional Digital Solutions & Asset Management"
                description="NoteStandard by Aghogho Plyboard Enterprise provides user-friendly digital solutions for businesses and consumers. Securely manage notes, financial assets, and team collaboration."
                keywords="digital solutions, asset management, secure notes, business collaboration"
            />
            <Navbar />
            <Hero />
            <Features />
            <Pricing />
            <Footer />
        </div>
    );
};

export default LandingPage;
