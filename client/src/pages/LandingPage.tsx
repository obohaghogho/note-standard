import { SEO } from '../components/common/SEO';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Features } from '../components/landing/Features';
import { Pricing } from '../components/landing/Pricing';
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
        <div className="min-h-[100dvh] bg-crystal text-foreground selection:bg-primary/30 w-full">
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
