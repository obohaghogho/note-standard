import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  onSearch: (query: string) => void;
}

export const FeedSearch: React.FC<Props> = ({ onSearch }) => {
  const [value, setValue] = useState('');

  const handleChange = useCallback((v: string) => {
    setValue(v);
    // Debounced search
    if ((window as any).__feedSearchTimer) clearTimeout((window as any).__feedSearchTimer);
    (window as any).__feedSearchTimer = setTimeout(() => onSearch(v), 400);
  }, [onSearch]);

  const clear = () => {
    setValue('');
    onSearch('');
  };

  return (
    <div className="px-4 mb-2">
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input
          id="community-search"
          type="search"
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search posts…"
          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
        />
        {value && (
          <button onClick={clear} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
