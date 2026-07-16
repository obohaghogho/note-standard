import { Card } from '../../components/common/Card';

const PlaceholderPage = ({ title }: { title: string }) => (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <Card variant="glass" className="p-12 text-center">
            <div className="inline-block p-4 rounded-full bg-white/5 mb-4">
                <span className="text-4xl">🚧</span>
            </div>
             <h2 className="text-xl font-semibold mb-2">Section Active</h2>
             <p className="text-gray-400 max-w-md mx-auto">
                 This section is currently optimized for your account. Please check back for additional features soon.
             </p>
        </Card>
    </div>
);

export const Billing = () => <PlaceholderPage title="Billing & Plans" />;

