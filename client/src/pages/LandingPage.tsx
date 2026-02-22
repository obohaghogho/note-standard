import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { Pricing } from '../components/landing/Pricing';
import { Footer } from '../components/landing/Footer';

export const LandingPage = () => {
    return (
        <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30 w-full overflow-x-clip">
            <Navbar />
            <Hero />
            <Features />
            <Pricing />
            <Footer />
        </div>
    );
};
