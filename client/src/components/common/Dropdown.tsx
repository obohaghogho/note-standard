import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { MoreVertical } from 'lucide-react';

interface DropdownItem {
    label: string;
    icon?: React.ElementType;
    onClick: () => void;
    variant?: 'default' | 'danger';
}

interface DropdownProps {
    items: DropdownItem[];
    trigger?: React.ReactNode;
}

export const Dropdown = ({ items, trigger }: DropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors focus:outline-none"
            >
                {trigger || <MoreVertical size={16} />}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="py-1">
                        {items.map((item, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    item.onClick();
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full px-4 py-2.5 text-sm flex items-center gap-2 transition-colors",
                                    item.variant === 'danger'
                                        ? "text-red-400 hover:bg-red-500/10"
                                        : "text-gray-200 hover:bg-white/5"
                                )}
                            >
                                {item.icon && <item.icon size={16} />}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
