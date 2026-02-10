
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

export const EmptyState = ({
    title,
    description,
    icon: Icon = AlertCircle,
    action,
    className = ''
}: EmptyStateProps) => {
    return (
        <Card variant="glass" className={`p-8 text-center flex flex-col items-center justify-center ${className}`}>
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <Icon className="text-gray-400" size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">{title}</h3>
            {description && (
                <p className="text-gray-400 mb-6 max-w-sm mx-auto">
                    {description}
                </p>
            )}
            {action && (
                <Button onClick={action.onClick}>
                    {action.label}
                </Button>
            )}
        </Card>
    );
};
