import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface TruncatedIdProps {
    id: string;
    startChars?: number;
    endChars?: number;
    className?: string;
    showCopyIcon?: boolean;
}

export const TruncatedId: React.FC<TruncatedIdProps> = ({
    id,
    startChars = 4,
    endChars = 4,
    className = '',
    showCopyIcon = true
}) => {
    const [copied, setCopied] = useState(false);

    if (!id) return <span className="text-gray-500">-</span>;

    const truncated = id.length > startChars + endChars + 3
        ? `${id.slice(0, startChars)}...${id.slice(-endChars)}`
        : id;

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopied(true);
        toast.success('Copied full ID to clipboard', { id: `copy-${id}` });
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <span
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 cursor-pointer font-mono text-xs hover:text-indigo-400 transition-colors select-none group focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 ${className}`}
            title={`Click to copy: ${id}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCopy(e as any);
                }
            }}
        >
            <span>{truncated}</span>
            {showCopyIcon && (
                <span className="text-gray-400 group-hover:text-indigo-400 transition-colors">
                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </span>
            )}
        </span>
    );
};

export default TruncatedId;
