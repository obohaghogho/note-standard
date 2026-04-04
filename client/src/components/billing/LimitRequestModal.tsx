import React, { useState } from 'react';
import { X, Zap, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { toast } from 'react-hot-toast';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface LimitRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentLimit: number;
    onSuccess: () => void;
}

export const LimitRequestModal: React.FC<LimitRequestModalProps> = ({ isOpen, onClose, currentLimit, onSuccess }) => {
    const { session } = useAuth();
    const [requestedLimit, setRequestedLimit] = useState<string>('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session?.access_token) return;

        const limitNum = parseFloat(requestedLimit);
        if (isNaN(limitNum) || limitNum <= currentLimit) {
            toast.error(`Please enter a limit higher than your current $${currentLimit.toLocaleString()}`);
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_URL}/api/limit-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    requested_limit: limitNum,
                    reason
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit request');

            toast.success('Limit increase request submitted successfully!');
            onSuccess();
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-md">
                <button onClick={onClose} className="modal-close">
                    <X size={20} />
                </button>

                <h2 className="modal-header">
                    <Zap size={20} className="text-yellow-400" />
                    Request Limit Increase
                </h2>

                <form onSubmit={handleSubmit} className="modal-body space-y-5">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-sm text-blue-400">
                        <AlertCircle size={20} className="shrink-0" />
                        <p>
                            Requests are reviewed by our team manually. Status updates will be sent to your notifications.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <span className="text-xs text-gray-400">Current Daily Limit</span>
                            <p className="text-xl font-bold">${currentLimit.toLocaleString()}</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-400 ml-1">New Requested Limit ($)</label>
                            <input
                                type="number"
                                value={requestedLimit}
                                onChange={(e) => setRequestedLimit(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 text-white focus:border-primary outline-none"
                                placeholder="e.g. 5000"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-400 ml-1">Reason for Increase</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 text-white focus:border-primary outline-none min-h-[100px]"
                                placeholder="Tell us why you need a higher limit..."
                                required
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end mt-2">
                        <Button variant="ghost" type="button" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="animate-spin mr-2" size={18} /> : <Zap className="mr-2" size={18} />}
                            Submit Request
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
