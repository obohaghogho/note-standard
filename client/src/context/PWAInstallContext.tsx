import React, { createContext, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { IOSInstallModal } from '../components/common/IOSInstallModal';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PlatformType = 'ios' | 'android' | 'desktop';

export function detectPlatform(): PlatformType {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface PWAInstallContextType {
  deferredPrompt: BeforeInstallPromptEvent | null;
  canInstall: boolean;
  isInstalled: boolean;
  platform: PlatformType;
  installApp: () => Promise<void>;
  openIOSModal: () => void;
}

const PWAInstallContext = createContext<PWAInstallContextType | undefined>(undefined);

export const PWAInstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isInStandaloneMode());
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (platform === 'ios') {
      setCanInstall(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser default install banner so we can trigger it from our custom button
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setCanInstall(false);
      toast.success('🎉 NoteStandard Web App installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [platform]);

  const installApp = async () => {
    if (isInstalled) {
      toast.success('NoteStandard is already installed on your device!');
      return;
    }

    if (platform === 'ios') {
      setIsIOSModalOpen(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          toast.success('Installing NoteStandard Web App…');
        }
        setDeferredPrompt(null);
        setCanInstall(false);
      } catch (err) {
        console.warn('PWA install prompt error:', err);
      }
    } else {
      // Fallback: If browser prompt isn't active or was dismissed
      toast('To install: Tap browser menu (⋮) → "Add to Home Screen" or "Install App"', {
        icon: '📱',
        duration: 6000,
      });
      // Scroll to guide if element exists
      const guideEl = document.getElementById('install-guide');
      if (guideEl) {
        guideEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <PWAInstallContext.Provider
      value={{
        deferredPrompt,
        canInstall,
        isInstalled,
        platform,
        installApp,
        openIOSModal: () => setIsIOSModalOpen(true),
      }}
    >
      {children}
      <IOSInstallModal isOpen={isIOSModalOpen} onClose={() => setIsIOSModalOpen(false)} />
    </PWAInstallContext.Provider>
  );
};

export const usePWAInstall = () => {
  const context = useContext(PWAInstallContext);
  if (!context) {
    throw new Error('usePWAInstall must be used within a PWAInstallProvider');
  }
  return context;
};
