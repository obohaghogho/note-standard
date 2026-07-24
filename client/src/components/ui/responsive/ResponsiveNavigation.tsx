import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { Menu, X } from 'lucide-react';

export interface NavItem {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  badge?: number;
  end?: boolean;
}

export interface ResponsiveNavigationProps {
  navItems: NavItem[];
  brandName?: string;
  brandIcon?: React.ComponentType<{ size?: number; className?: string }>;
  userProfile?: { name: string; avatarUrl?: string };
  children?: React.ReactNode;
}

export const ResponsiveNavigation: React.FC<ResponsiveNavigationProps> = ({
  navItems,
  brandName = 'NoteStandard',
  brandIcon: BrandIcon,
  children,
}) => {
  const { isMobile, isTablet } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Main primary links for Mobile Bottom Nav (max 4 items)
  const primaryMobileNav = navItems.slice(0, 4);

  return (
    <div className="flex w-full h-full relative overflow-hidden">
      {/* Desktop / Tablet Sidebar */}
      {!isMobile && (
        <aside
          className={`flex flex-col flex-shrink-0 bg-gray-950 border-r border-white/10 transition-all duration-200 ${
            isTablet ? 'w-20 p-3' : 'w-64 p-5'
          }`}
          style={{ paddingTop: 'var(--safe-top, 16px)', paddingBottom: 'var(--safe-bottom, 16px)' }}
        >
          {/* Brand Header */}
          <div className="flex items-center gap-3 mb-8 px-2">
            {BrandIcon && (
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <BrandIcon size={20} />
              </div>
            )}
            {!isTablet && <span className="font-bold text-white text-base truncate">{brandName}</span>}
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  } ${isTablet ? 'justify-center px-0' : ''}`
                }
                title={isTablet ? item.label : undefined}
              >
                <item.icon size={18} />
                {!isTablet && <span className="truncate">{item.label}</span>}
                {!isTablet && item.badge && item.badge > 0 ? (
                  <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      {/* Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-gray-950">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-gray-950/90 backdrop-blur-2xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around"
          style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 6px)' }}
        >
          {primaryMobileNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${
                  isActive ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-white'
                }`
              }
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px]">
                {item.label}
              </span>
            </NavLink>
          ))}

          {/* More Drawer Trigger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-1 py-1.5 px-3 text-gray-400 hover:text-white rounded-xl transition-all"
          >
            <Menu size={20} />
            <span className="text-[10px] font-medium tracking-tight">More</span>
          </button>
        </div>
      )}

      {/* Mobile Slide-Over Drawer */}
      {isMobile && drawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="bg-gray-900 border-t border-white/10 rounded-t-3xl p-6 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)' }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="font-bold text-white text-base">Navigation</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-3 rounded-2xl border text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                        : 'bg-white/[0.02] text-gray-300 border-white/5 hover:bg-white/5'
                    }`
                  }
                >
                  <item.icon size={18} />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
