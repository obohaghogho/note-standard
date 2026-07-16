import React, { ReactNode } from 'react';

interface FeedLayoutProps {
  sidebar?: ReactNode;
  content: ReactNode;
  rightSidebar?: ReactNode;
  fab?: ReactNode;
}

export const FeedLayout: React.FC<FeedLayoutProps> = ({
  sidebar,
  content,
  rightSidebar,
  fab
}) => {
  return (
    <div className="relative flex min-h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Desktop Left Sidebar */}
      {sidebar && (
        <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
          {sidebar}
        </aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl mx-auto w-full flex flex-col relative z-0">
        {content}
      </main>

      {/* Desktop Right Sidebar (Tablet as Drawer later) */}
      {rightSidebar && (
        <aside className="hidden xl:block w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
          {rightSidebar}
        </aside>
      )}

      {/* Floating Action Button */}
      {fab && (
        <div className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 z-50">
          {fab}
        </div>
      )}
    </div>
  );
};
