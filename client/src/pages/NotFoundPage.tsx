import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft, Search, ShieldAlert } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  useEffect(() => {
    document.title = '404 - Page Not Found | NoteStandard';
    // Set noindex tag dynamically for non-existent pages
    let metaRobots = document.querySelector("meta[name='robots']");
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    metaRobots.setAttribute('content', 'noindex, follow');

    return () => {
      if (metaRobots) {
        metaRobots.setAttribute('content', 'index, follow');
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-md w-full bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl">
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8 text-emerald-400" />
        </div>

        <h1 className="text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent mb-2">
          404
        </h1>

        <h2 className="text-xl font-semibold text-neutral-200 mb-3">
          Page Not Found
        </h2>

        <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Return to Homepage
          </Link>

          <button
            onClick={() => window.history.back()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium rounded-xl transition-all border border-neutral-700/50 active:scale-[0.98]"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>

      <p className="mt-8 text-xs text-neutral-600">
        &copy; {new Date().getFullYear()} NoteStandard. All rights reserved.
      </p>
    </div>
  );
};

export default NotFoundPage;
