import React from 'react';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
    className?: string; // Allow custom classes
}

export const Toggle = ({ checked, onChange, label, description, disabled = false, className = '' }: ToggleProps) => {
    const id = React.useId();
    
    return (
        <div className={`flex items-start justify-between group ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex-1 mr-4">
                {label && (
                    <label 
                        htmlFor={id}
                        className={`block text-sm font-medium mb-1 transition-colors cursor-pointer ${checked ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}
                    >
                        {label}
                    </label>
                )}
                {description && <p className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">{description}</p>}
            </div>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label || 'Toggle setting'}
                disabled={disabled}
                onClick={() => !disabled && onChange(!checked)}
                className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#0f172a]
                    ${checked ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'}
                `}
            >
                <span
                    aria-hidden="true"
                    className={`
                        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                        transition duration-200 ease-in-out
                        ${checked ? 'translate-x-5' : 'translate-x-0'}
                    `}
                />
            </button>
        </div>
    );
};
