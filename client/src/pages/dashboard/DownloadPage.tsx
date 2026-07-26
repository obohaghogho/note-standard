import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Apple,
  ArrowRight,
  Globe,
  QrCode,
  ChevronLeft,
  CheckCircle2,
  Share2,
  PlusSquare,
  Chrome,
  MoreVertical,
  Bell,
  Zap,
  Shield,
  Wifi,
  Download,
  Info,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { IOSInstallModal } from '../../components/common/IOSInstallModal';
import toast from 'react-hot-toast';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// ─── Platform detection ───────────────────────────────────────────────────────
function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ─── Feature pills ────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: Zap,    label: 'Instant load',       color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { icon: Bell,   label: 'Push notifications', color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  { icon: Wifi,   label: 'Works offline',       color: 'text-green-400',  bg: 'bg-green-400/10'  },
  { icon: Shield, label: 'Secure & private',    color: 'text-purple-400', bg: 'bg-purple-400/10' },
];

export const DownloadPage: React.FC = () => {
  const navigate = useNavigate();
  const platform  = detectPlatform();
  const alreadyInstalled = isInStandaloneMode();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall]         = useState(false);
  const [installed, setInstalled]           = useState(alreadyInstalled);
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);
  const [activeGuide, setActiveGuide]       = useState<'android' | 'ios' | 'desktop'>(platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop');

  useEffect(() => {
    if (platform === 'ios') { setCanInstall(true); return; }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success('🎉 NoteStandard installed successfully!');
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [platform]);

  const handleInstall = async () => {
    if (platform === 'ios') {
      setIsIOSModalOpen(true);
      return;
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        toast.success('Installing NoteStandard Web App…');
      }
      setDeferredPrompt(null);
      setCanInstall(false);
    } else {
      document.getElementById('install-guide')?.scrollIntoView({ behavior: 'smooth' });
      toast('To install: Tap your browser menu (⋮) → "Add to Home Screen" or "Install App"', {
        icon: '📱',
        duration: 6000,
      });
    }
  };

  // ─── Guide steps ─────────────────────────────────────────────────────────
  const GUIDES = {
    android: [
      { icon: Chrome,      color: 'bg-blue-500/10 text-blue-400',   title: 'Open in Chrome',             desc: 'Make sure you are visiting notestandard.com using the Chrome browser on your Android phone.' },
      { icon: MoreVertical,color: 'bg-gray-500/10 text-gray-300',   title: 'Tap the ⋮ menu',              desc: 'Tap the three-dot menu in the top-right corner of Chrome.' },
      { icon: PlusSquare,  color: 'bg-green-500/10 text-green-400', title: 'Add to Home Screen',         desc: 'Select "Add to Home Screen" or "Install App" from the menu. Tap "Add" to confirm.' },
      { icon: CheckCircle2,color: 'bg-primary/10 text-primary',      title: 'Done! Open from your screen', desc: 'NoteStandard now appears on your home screen just like a native app — with push notifications!' },
    ],
    ios: [
      { icon: Globe,       color: 'bg-blue-500/10 text-blue-400',   title: 'Open Safari',                desc: 'This only works in Safari. If you\'re using Chrome on iOS, copy the URL and open it in Safari.' },
      { icon: Share2,      color: 'bg-purple-500/10 text-purple-400',title: 'Tap the Share button',       desc: 'Tap the Share icon (box with an arrow) at the bottom of Safari.' },
      { icon: PlusSquare,  color: 'bg-green-500/10 text-green-400', title: 'Add to Home Screen',         desc: 'Scroll down in the share sheet and tap "Add to Home Screen", then tap "Add".' },
      { icon: CheckCircle2,color: 'bg-primary/10 text-primary',      title: 'Done! Launch from your screen', desc: 'NoteStandard is now on your iPhone home screen and works like a native app.' },
    ],
    desktop: [
      { icon: Chrome,      color: 'bg-blue-500/10 text-blue-400',   title: 'Use Chrome or Edge',         desc: 'Open notestandard.com in Google Chrome or Microsoft Edge on your computer.' },
      { icon: Download,    color: 'bg-green-500/10 text-green-400', title: 'Look for the install icon',  desc: 'A small install icon (⊕) appears in the address bar on the right. Click it.' },
      { icon: CheckCircle2,color: 'bg-primary/10 text-primary',      title: 'Click Install',               desc: 'Click "Install" in the popup. The app opens in its own window — no browser UI!' },
    ],
  };

  const steps = GUIDES[activeGuide];

  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-y-auto">

      {/* ── Top nav ── */}
      <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-[#080808]/80 backdrop-blur-lg border-b border-white/5">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-gray-400 hover:text-white"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold text-sm text-gray-300">Get the App</span>
        {installed && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-3 py-1">
            <CheckCircle2 size={12} /> Already installed
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">

        {/* ── Hero ── */}
        <div className="text-center space-y-5 pt-4">
          {/* Platform badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
            {platform === 'android' && <><Smartphone size={13} /> You're on Android</>}
            {platform === 'ios'     && <><Apple size={13} /> You're on iPhone/iPad</>}
            {platform === 'desktop' && <><Globe size={13} /> You're on a computer</>}
          </div>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
            Install{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
              NoteStandard
            </span>
            <br />on Your Device
          </h1>
          <p className="text-gray-400 text-base max-w-xl mx-auto leading-relaxed">
            NoteStandard is a <strong className="text-white">Web App (PWA)</strong> — install it directly from your browser in seconds.
            No App Store needed. Works on Android, iPhone, and desktop.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {FEATURES.map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${bg} border border-white/5 text-xs font-semibold ${color}`}>
                <Icon size={12} />{label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Primary CTA ── */}
        {!installed ? (
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-purple-500/10 border border-primary/30 p-8 text-center space-y-5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                <Smartphone size={28} className="text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mb-2">
                Install NoteStandard Web App
              </h2>
              <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
                Install NoteStandard directly on your phone or desktop from your browser. Works like a native mobile app with instant loading, offline access, and push notifications.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
                <button
                  onClick={handleInstall}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-9 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-black text-base shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-100 border border-white/10"
                >
                  <Smartphone size={20} />
                  Install Web App
                </button>

                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 font-bold text-sm border border-white/10 transition-all"
                >
                  <Globe size={18} />
                  Open Web App
                </button>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                {platform === 'ios'
                  ? 'Works in Safari on iPhone / iPad. Tap Install Web App above for instructions.'
                  : 'Works in Google Chrome, Edge, Brave, Opera & all modern mobile browsers.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-green-500/5 border border-green-500/20 p-8 text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-400 mx-auto" />
            <h2 className="text-2xl font-black">App Already Installed!</h2>
            <p className="text-gray-400 text-sm">
              You're running NoteStandard as an installed app. You'll receive push notifications and the app works offline.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-bold text-sm hover:bg-green-500/20 transition-all"
            >
              Back to Dashboard <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step-by-step guide ── */}
        <div id="install-guide" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Step-by-step Guide</h2>
            {/* Guide switcher */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
              {(['android', 'ios', 'desktop'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setActiveGuide(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeGuide === p
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {p === 'android' ? '🤖 Android' : p === 'ios' ? '🍎 iPhone' : '💻 Desktop'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-all group">
                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl ${step.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon size={18} />
                    </div>
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 min-h-[20px] bg-white/10" />
                    )}
                  </div>
                  <div className="pt-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Step {i + 1}</span>
                    </div>
                    <h3 className="font-bold text-sm text-white mb-1">{step.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── What you get ── */}
        <div className="rounded-3xl bg-white/[0.03] border border-white/[0.07] p-8 space-y-5">
          <h2 className="text-xl font-black">What You Get After Installing</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { emoji: '🔔', title: 'Push Notifications',    desc: 'Get notified instantly when someone messages or mentions you — even when the browser is closed.' },
              { emoji: '📱', title: 'Home Screen Icon',      desc: 'NoteStandard opens from your home screen just like WhatsApp or Instagram.' },
              { emoji: '⚡', title: 'Faster Load Times',     desc: 'The app loads instantly from cache, even on slow connections.' },
              { emoji: '🌐', title: 'Works Offline',          desc: 'Read your saved notes and view conversations even without internet.' },
              { emoji: '🔒', title: 'Same Secure Account',   desc: 'Your account, notes, and chats are synced — nothing is lost.' },
              { emoji: '🚀', title: 'No App Store Needed',   desc: 'Install directly from the browser — no approval wait, no store fees.' },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div>
                  <p className="font-bold text-sm text-white mb-0.5">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── QR code (useful on desktop to send link to phone) ── */}
        <div className="rounded-3xl bg-white/[0.03] border border-white/[0.07] p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            <div className="bg-white p-4 rounded-2xl shadow-2xl">
              <QRCodeSVG
                value={`${window.location.origin}/dashboard/download`}
                size={140}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
                includeMargin={false}
              />
            </div>
          </div>
          <div className="text-center md:text-left space-y-2">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <QrCode size={18} className="text-purple-400" />
              <h3 className="font-black text-lg">Install on Your Phone</h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
              On desktop? Scan this QR code with your phone camera to open NoteStandard on your phone — then follow the install guide above to add it to your home screen.
            </p>
            <p className="text-xs text-gray-600 font-mono pt-1">{window.location.origin}/dashboard/download</p>
          </div>
        </div>

        {/* ── FAQ / Info box ── */}
        <div className="rounded-3xl bg-blue-500/5 border border-blue-500/15 p-7 flex gap-4">
          <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-bold text-blue-300 text-sm">Why is there no Play Store or App Store version yet?</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We are actively working on getting NoteStandard listed on both the Google Play Store and Apple App Store.
              In the meantime, the Web App (PWA) version gives you <strong className="text-white">identical features</strong> — including push notifications, offline access,
              and a home screen icon — without needing a store listing. It's the recommended way to use NoteStandard on mobile right now.
            </p>
          </div>
        </div>

        {/* ── Support ── */}
        <div className="text-center pb-8">
          <p className="text-gray-600 text-xs">
            Having trouble installing? Contact us at{' '}
            <a href="mailto:support@notestandard.com" className="text-primary hover:underline">
              support@notestandard.com
            </a>
          </p>
        </div>

      </div>

      <IOSInstallModal isOpen={isIOSModalOpen} onClose={() => setIsIOSModalOpen(false)} />
    </div>
  );
};

export default DownloadPage;
