import { SEO } from '../components/common/SEO';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Features } from '../components/landing/Features';
import { Pricing } from '../components/landing/Pricing';
import { FounderSection } from '../components/landing/FounderSection';
import { Footer } from '../components/landing/Footer';

export const LandingPage = () => {
    const { user, authReady } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (authReady && user) {
            navigate('/dashboard', { replace: true });
        }
    }, [authReady, user, navigate]);

    return (
        <div className="h-full overflow-y-auto min-h-[100dvh] bg-crystal text-foreground selection:bg-primary/30 w-full">
            <SEO 
                title="Real-Time Messaging & Social Communication"
                description="NoteStandard by Jossy Digital Technologies Ltd provides secure messaging, voice notes, media sharing, real-time conversations, and social communication."
                keywords="secure messaging, voice notes, media sharing, real-time conversations, social communication"
            />
            <Navbar />
            <Hero />
            <Features />
            <Pricing />
            <FounderSection />
            <Footer />
        </div>
    );
};

export default LandingPage;
