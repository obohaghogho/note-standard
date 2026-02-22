import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LanguageModal } from './LanguageModal';

export const LanguageSelector = () => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="group relative flex items-center justify-center p-2.5 rounded-xl hover:bg-white/10 transition-all duration-300 text-gray-400 hover:text-white border border-transparent hover:border-white/10 shadow-sm hover:shadow-primary/20"
                title={t('common.language')}
            >
                <div className="relative">
                    <Globe size={20} className="transition-transform duration-500 group-hover:rotate-[30deg]" />
                    <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </button>

            <LanguageModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
            />
        </>
    );
};
