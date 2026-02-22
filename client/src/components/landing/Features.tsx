import { motion } from 'framer-motion';
import { Lock, Cloud, Users, Zap, Search, Layout } from 'lucide-react';

const features = [
    {
        icon: Lock,
        title: 'Bank-Grade Security',
        description: 'Your notes are encrypted at rest and in transit. Private means private.'
    },
    {
        icon: Cloud,
        title: 'Real-time Sync',
        description: 'Switch devices instantly. Your content is always up to date.'
    },
    {
        icon: Users,
        title: 'Team Collaboration',
        description: 'Share notes with username handles. Granular permissions.'
    },
    {
        icon: Zap,
        title: 'Instant Fast',
        description: 'Zero lag. Optimized for speed and performance.'
    },
    {
        icon: Search,
        title: 'Smart Search',
        description: 'Find any note in milliseconds with our fuzzy search engine.'
    },
    {
        icon: Layout,
        title: 'Clean Dashboard',
        description: 'Distraction-free writing environment with markdown support.'
    }
];

export const Features = () => {
    return (
        <section id="features" className="py-20 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">Designed for <span className="text-primary">Power Users</span></h2>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Everything you need to capture ideas, collaborate with your team, and stay organized.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className="glass p-8 rounded-2xl hover:bg-white/10 transition-colors group cursor-pointer border border-white/5 hover:border-white/20"
                        >
                            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                                <feature.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                            <p className="text-gray-400 leading-relaxed">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
