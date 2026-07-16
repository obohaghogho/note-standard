import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';
import './ExportButton.css';

interface ExportButtonProps {
    conversationId: string;
}

export const ExportButton = ({ conversationId }: ExportButtonProps) => {
    const { session } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const handleExport = async (format: 'csv' | 'pdf') => {
        if (!session?.access_token) return;
        setExporting(true);
        setIsOpen(false);

        try {
            const res = await fetch(`${API_URL}/api/admin/support-chats/${conversationId}/export?format=${format}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcript-${conversationId.slice(0, 8)}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Failed to export transcript');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="export-dropdown">
            <button
                className={`export-main-btn ${exporting ? 'exporting' : ''}`}
                onClick={() => !exporting && setIsOpen(!isOpen)}
                disabled={exporting}
            >
                <Download size={16} />
                {exporting ? 'Exporting...' : 'Export Chat'}
                <ChevronDown size={14} className={isOpen ? 'rotate' : ''} />
            </button>

            {isOpen && (
                <div className="dropdown-menu">
                    <button onClick={() => handleExport('pdf')}>
                        <FileText size={16} /> Export as PDF
                    </button>
                    <button onClick={() => handleExport('csv')}>
                        <FileSpreadsheet size={16} /> Export as CSV
                    </button>
                </div>
            )}
        </div>
    );
};
