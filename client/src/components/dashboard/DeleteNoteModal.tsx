import { Button } from '../../components/common/Button';
import { AlertTriangle } from 'lucide-react';

interface DeleteNoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    loading?: boolean;
}

export const DeleteNoteModal = ({ isOpen, onClose, onConfirm, loading }: DeleteNoteModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-sm">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                        <AlertTriangle size={24} />
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">Delete Note?</h3>
                        <p className="text-gray-400">
                            Are you sure you want to delete this note? This action cannot be undone.
                        </p>
                    </div>

                    <div className="flex gap-3 w-full pt-4">
                        <Button
                            variant="ghost"
                            fullWidth
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            fullWidth
                            onClick={onConfirm}
                            loading={loading}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
