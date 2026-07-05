import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

const CATEGORIES = ['All', 'Technology', 'Business', 'Science', 'Education', 'Health', 'Finance', 'Design', 'Career', 'Other'];
const SORT_OPTIONS = [
  { id: 'latest', label: 'Latest' },
  { id: 'trending', label: 'Trending' },
  { id: 'most_liked', label: 'Most Liked' },
  { id: 'most_commented', label: 'Most Commented' },
];
const FILTER_STORAGE_KEY = 'community_filter_state';

interface FilterState {
  category: string;
  sort: string;
}

interface Props {
  onChange: (state: FilterState) => void;
}

export const FeedFilters: React.FC<Props> = ({ onChange }) => {
  const [category, setCategory] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}').category || 'All'; }
    catch { return 'All'; }
  });
  const [sort, setSort] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}').sort || 'latest'; }
    catch { return 'latest'; }
  });
  const [showModal, setShowModal] = useState(false);
  const [pendingSort, setPendingSort] = useState(sort);

  // Persist and propagate on change
  useEffect(() => {
    const state = { category, sort };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
    onChange(state);
  }, [category, sort, onChange]);

  const applySort = () => {
    setSort(pendingSort);
    setShowModal(false);
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800/60 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center space-x-2 overflow-x-auto hide-scrollbar">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              id={`category-filter-${cat.toLowerCase()}`}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          id="open-filter-modal"
          onClick={() => { setPendingSort(sort); setShowModal(true); }}
          aria-label="Open filter options"
          className="ml-2 shrink-0 p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {/* Filter modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Filter &amp; Sort</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Sort by</p>
            <div className="space-y-2 mb-6">
              {SORT_OPTIONS.map(opt => (
                <label
                  key={opt.id}
                  className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <input
                    type="radio"
                    name="sort"
                    value={opt.id}
                    checked={pendingSort === opt.id}
                    onChange={() => setPendingSort(opt.id)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{opt.label}</span>
                </label>
              ))}
            </div>

            <button
              onClick={applySort}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </>
  );
};
