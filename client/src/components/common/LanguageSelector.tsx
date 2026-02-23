import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LanguageModal } from './LanguageModal';

export const LanguageSelector = () => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const toggleModal = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsModalOpen(!isModalOpen);
    };

    return (
        <>
            <button
                onClick={toggleModal}
                className="group relative flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl hover:bg-white/10 transition-all duration-300 text-gray-400 hover:text-white border border-transparent hover:border-white/10 shadow-sm hover:shadow-primary/20 cursor-pointer"
                title={t('common.language')}
                aria-label={t('common.language')}
            >
                <div className="relative flex items-center justify-center font-medium">
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
