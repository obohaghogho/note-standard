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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).deferredPWAInstallPrompt as BeforeInstallPromptEvent) || null
  );
  const [canInstall, setCanInstall] = useState(true);
  const [isInstalled, setIsInstalled] = useState(isInStandaloneMode());
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      (window as unknown as Record<string, unknown>).deferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as unknown as Record<string, unknown>).deferredPWAInstallPrompt = null;
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

    const activePrompt = deferredPrompt || ((typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).deferredPWAInstallPrompt) as BeforeInstallPromptEvent | null);

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const { outcome } = await activePrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          toast.success('Installing NoteStandard Web App…');
        }
        setDeferredPrompt(null);
        (window as unknown as Record<string, unknown>).deferredPWAInstallPrompt = null;
        setCanInstall(false);
      } catch (err) {
        console.warn('PWA install error:', err);
      }
    } else {
      // If browser has not fired beforeinstallprompt yet or already installed, trigger service worker / browser install flow directly
      toast.loading('Opening 1-tap installation dialog…', { duration: 3000 });
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_INSTALL' });
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
