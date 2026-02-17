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
        <section id="pricing" className="py-24 relative overflow-hidden">
            {/* Background blobs */}
            <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] -z-10" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -z-10" />

            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">Simple, Transparent <span className="text-primary">Pricing</span></h2>
                    <p className="text-xl text-gray-400">Choose the plan that fits your needs.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 items-start">
                    {plans.map((plan, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className={`p-8 rounded-2xl border transition-all duration-300 relative ${plan.highlight
                                    ? 'glass-card border-primary/50 shadow-2xl scale-105 z-10'
                                    : 'glass border-white/10 hover:border-white/20'
                                }`}
                        >
                            {plan.highlight && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full text-xs font-bold uppercase tracking-wide">
                                    {plan.tag}
                                </div>
                            )}

                            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                            <p className="text-gray-400 text-sm mb-6">{plan.description}</p>

                            <div className="flex items-baseline gap-1 mb-8">
                                <span className="text-4xl font-bold">{plan.price}</span>
                                {plan.period && <span className="text-gray-400">{plan.period}</span>}
                            </div>

                            <div className="space-y-4 mb-8">
                                {plan.features.map((feature, fIdx) => (
                                    <div key={fIdx} className="flex items-center gap-3">
                                        <div className={`p-1 rounded-full ${plan.highlight ? 'bg-primary/20 text-primary' : 'bg-white/10 text-gray-400'}`}>
                                            <Check className="w-3 h-3" />
                                        </div>
                                        <span className="text-sm text-gray-300">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <button 
                                onClick={() => {
                                    console.log(`[Pricing] Plan chosen: ${plan.name}`);
                                    navigate('/signup');
                                }}
                                className={`w-full py-3 rounded-xl font-medium transition-all ${plan.highlight
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
