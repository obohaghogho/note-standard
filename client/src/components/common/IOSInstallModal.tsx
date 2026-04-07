import React from 'react';
import { X, Share, PlusSquare } from 'lucide-react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md rounded-t-[2rem] bg-gray-900 border-t border-gray-800 p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-white">Install NoteStandard</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-6 font-medium">
          Add this app to your iPhone home screen for the full native experience.
        </p>

        {/* Steps */}
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Share size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-300">
                Tap the <strong className="text-white">Share</strong> button at the bottom of standard Safari.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <PlusSquare size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-300">
                Scroll down and select <strong className="text-white">Add to Home Screen</strong>.
              </p>
            </div>
          </div>
          
          {/* Step 3 */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center font-bold text-lg">
              Add
            </div>
            <div>
              <p className="text-sm text-gray-300">
                Tap <strong className="text-white">Add</strong> in the top right corner.
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-xs text-yellow-300/90 font-medium leading-relaxed">
            <strong className="text-yellow-400">⚠️ Note:</strong> This only works in Safari. If you're using another browser like Chrome for iOS, please open this page in Safari first.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white py-3.5 text-sm font-bold shadow-lg shadow-primary/25 transition-all"
          >
            Got it
          </button>
        </div>

      </div>
    </div>
  );
};
