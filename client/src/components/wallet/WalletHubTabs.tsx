import React from 'react';
import { motion } from 'framer-motion';
import { Landmark, Bitcoin, ArrowRightLeft } from 'lucide-react';

type TabId = 'fiat' | 'crypto' | 'exchange';

interface WalletHubTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'fiat', label: 'Fiat Wallets', icon: Landmark, description: 'NGN, USD, EUR, GBP' },
  { id: 'crypto', label: 'Crypto Wallets', icon: Bitcoin, description: 'BTC, ETH, USDT, USDC' },
  { id: 'exchange', label: 'Exchange Hub', icon: ArrowRightLeft, description: 'Convert, Buy, Sell, Swap' },
];

export function WalletHubTabs({ activeTab, onTabChange }: WalletHubTabsProps) {
  return (
    <div className="relative">
      {/* Mobile: scrollable pill tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sm:hidden">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: full-width segmented control */}
      <div className="hidden sm:block relative bg-white/5 rounded-2xl p-1 border border-white/5">
        {/* Sliding pill indicator */}
        <motion.div
          layoutId="hub-tab-indicator"
          className="absolute top-1 bottom-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20"
          style={{
            width: `calc(${100 / TABS.length}% - 4px)`,
            left: `calc(${(TABS.findIndex(t => t.id === activeTab) / TABS.length) * 100}% + 2px)`,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />

        <div className="relative z-10 grid grid-cols-3 gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} />
                  <span className="font-semibold text-sm">{tab.label}</span>
                </div>
                <span className={`text-xs transition-opacity duration-200 ${isActive ? 'text-indigo-200 opacity-100' : 'opacity-0'}`}>
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
