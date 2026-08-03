import React from 'react';
import { Inbox, LucideIcon } from 'lucide-react';

interface EmptyStateCardProps {
    icon?: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
    icon: Icon = Inbox,
    title,
    description,
    actionLabel,
    onAction,
    secondaryActionLabel,
    onSecondaryAction
}) => {
    return (
        <div className="w-full py-10 px-4 text-center rounded-xl bg-gray-900/40 border border-gray-800/80 flex flex-col items-center justify-center my-4">
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-400 mb-3 border border-indigo-500/20">
                <Icon size={32} />
            </div>
            <h4 className="text-base font-semibold text-gray-200 mb-1">{title}</h4>
            <p className="text-xs sm:text-sm text-gray-400 max-w-sm mb-4 leading-relaxed">{description}</p>
            {(actionLabel || secondaryActionLabel) && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {actionLabel && onAction && (
                        <button
                            onClick={onAction}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm transition-colors shadow-lg shadow-indigo-600/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[40px]"
                        >
                            {actionLabel}
                        </button>
                    )}
                    {secondaryActionLabel && onSecondaryAction && (
                        <button
                            onClick={onSecondaryAction}
                            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs sm:text-sm transition-colors border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[40px]"
                        >
                            {secondaryActionLabel}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default EmptyStateCard;
