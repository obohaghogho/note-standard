import React from 'react';
import { cn } from '../../utils/cn';
import { ChevronDown } from 'lucide-react';

interface Country {
    code: string;
    name: string;
    dialCode: string;
    flag: string;
}

const COUNTRIES: Country[] = [
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
    { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
    { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
    { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
    { code: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬' },
    { code: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿' },
    { code: 'RW', name: 'Rwanda', dialCode: '+250', flag: '🇷🇼' },
    { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
    { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
];

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    error?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, label, error, className, ...props }) => {
    const [selectedCountry, setSelectedCountry] = React.useState(COUNTRIES[2]); // Default to Nigeria for Africa focus
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Parse the incoming value to match country if possible
    React.useEffect(() => {
        if (value.startsWith('+')) {
            const country = COUNTRIES.find(c => value.startsWith(c.dialCode));
            if (country) setSelectedCountry(country);
        }
    }, []);

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        // If it starts with the dial code, remove it if it was entered twice
        const dialCodeDigits = selectedCountry.dialCode.replace(/\D/g, '');
        if (val.startsWith(dialCodeDigits) && val.length > dialCodeDigits.length) {
            // keep it
        }
        onChange(selectedCountry.dialCode + val);
    };

    const displayValue = value.replace(selectedCountry.dialCode, '');

    return (
        <div className="flex flex-col gap-1.5 w-full">
            {label && (
                <label className="text-sm font-medium text-gray-300 ml-1">
                    {label}
                </label>
            )}
            <div className="relative flex gap-2">
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className={cn(
                            "flex items-center gap-2 h-10 px-3 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all",
                            isOpen && "ring-2 ring-primary/50 border-transparent"
                        )}
                    >
                        <span className="text-lg">{selectedCountry.flag}</span>
                        <span className="text-sm font-medium">{selectedCountry.dialCode}</span>
                        <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && (
                        <div className="absolute top-full mt-2 left-0 w-64 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#0d0d0d] shadow-2xl z-[110] p-1 scrollbar-thin scrollbar-thumb-white/10">
                            {COUNTRIES.map((country) => (
                                <button
                                    key={country.code}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCountry(country);
                                        setIsOpen(false);
                                        onChange(country.dialCode + displayValue);
                                    }}
                                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors group"
                                >
                                    <span className="text-xl">{country.flag}</span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-white group-hover:text-primary transition-colors">{country.name}</span>
                                        <span className="text-xs text-gray-400">{country.dialCode}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="relative flex-1">
                    <input
                        type="tel"
                        value={displayValue}
                        onChange={handlePhoneChange}
                        className={cn(
                            'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
                            error && 'border-red-500/50 focus:ring-red-500/50',
                            className
                        )}
                        placeholder="801 234 5678"
                        {...props}
                    />
                </div>
            </div>
            {error && (
                <span className="text-xs text-red-400 ml-1">{error}</span>
            )}
        </div>
    );
};
