import { SEO } from '../components/common/SEO';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { Pricing } from '../components/landing/Pricing';
import { Footer } from '../components/landing/Footer';

export const LandingPage = () => {
    return (
        <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30 w-full overflow-x-clip">
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
