import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const plans = [
    {
        name: 'Free',
        price: '$0',
        description: 'Perfect for getting started',
        features: ['50 Notes', 'Basic Formatting', 'Mobile Access', 'Sync 2 Devices'],
        highlight: false
    },
    {
        name: 'Pro',
        price: '$9',
        period: '/month',
        description: 'For power users & creators',
        features: ['Unlimited Notes', 'Rich Media Support', 'Advanced Search', 'Priority Support', 'Version History'],
        highlight: true,
        tag: 'Most Popular'
    },
    {
        name: 'Team',
        price: '$19',
        period: '/user',
        description: 'Collaborate with your team',
        features: ['Everything in Pro', 'Team Sharing', 'Admin Dashboard', 'SSO Integration', 'API Access'],
        highlight: false
    }
];

export const Pricing = () => {
    const navigate = useNavigate();
    return (
        <section id="pricing" className="py-12 sm:py-20 relative overflow-hidden w-full">
            {/* Background blobs */}
            <div className="absolute top-1/2 left-0 w-full max-w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-full max-w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-10 sm:mb-16 relative z-10">
                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-6 tracking-tight">Simple, Transparent <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Pricing</span></h2>
                    <p className="text-sm sm:text-lg text-gray-300">Choose the plan that fits your needs.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch md:items-start">
                    {plans.map((plan, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className={`p-6 sm:p-8 rounded-2xl sm:rounded-3xl border transition-all duration-300 relative flex flex-col justify-between ${plan.highlight
                                    ? 'glass-card border-primary/50 shadow-2xl md:scale-105 z-10'
                                    : 'glass border-white/10 hover:border-white/20'
                                }`}
                        >
                            {plan.highlight && (
                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full text-[11px] font-bold uppercase tracking-wide shadow-md">
                                    {plan.tag}
                                </div>
                            )}

                            <div>
                                <h3 className="text-lg sm:text-xl font-bold mb-1.5">{plan.name}</h3>
                                <p className="text-gray-400 text-xs sm:text-sm mb-6">{plan.description}</p>

                                <div className="flex items-baseline gap-1 mb-6 sm:mb-8">
                                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">{plan.price}</span>
                                    {plan.period && <span className="text-gray-400 text-xs sm:text-sm">{plan.period}</span>}
                                </div>

                                <div className="space-y-3 sm:space-y-4 mb-8">
                                    {plan.features.map((feature, fIdx) => (
                                        <div key={fIdx} className="flex items-center gap-3">
                                            <div className={`p-1 rounded-full flex-shrink-0 ${plan.highlight ? 'bg-primary/20 text-primary' : 'bg-white/10 text-gray-400'}`}>
                                                <Check className="w-3 h-3" />
                                            </div>
                                            <span className="text-xs sm:text-sm text-gray-300">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={() => {
                                    console.log(`[Pricing] Plan chosen: ${plan.name}`);
                                    navigate('/signup');
                                }}
                                className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${plan.highlight
                                    ? 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25'
                                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'
                                }`}>
                                Choose {plan.name}
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
