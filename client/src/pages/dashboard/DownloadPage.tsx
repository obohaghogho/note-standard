import React, { useEffect, useState } from 'react';
import { 
  Smartphone, 
  Apple, 
  AlertCircle, 
  ArrowRight,
  Monitor,
  Zap,
  Globe,
  QrCode
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { cn } from '../../utils/cn';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const DownloadPage: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Update UI notify the user they can install the PWA
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success('NoteStandard is being installed!');
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const handleNativeDownload = (platform: 'android' | 'ios') => {
    const filename = platform === 'android' ? 'app-release.apk' : 'app-release.ipa';
    const link = document.createElement('a');
    link.href = `/downloads/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Starting ${platform === 'android' ? 'Android (APK)' : 'iOS (IPA)'} download...`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-12 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Hero Section */}
        <div className="flex flex-col lg:flex-row items-center gap-12 bg-gradient-to-br from-blue-600/10 to-purple-600/10 rounded-[3rem] p-8 md:p-16 border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10"></div>
          
          <div className="flex-1 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest animate-pulse">
              <Zap size={14} /> Mobile App Now available
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight italic uppercase">
              Take NoteStandard <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Everywhere</span>
            </h1>
            <p className="text-gray-400 text-lg font-medium max-w-xl leading-relaxed">
              Experience the full power of real-time collaboration and secure note-taking on your mobile device. Choose your preferred installation method below.
            </p>
            
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4">
              <Button 
                onClick={() => handleNativeDownload('android')}
                className="h-14 px-8 rounded-2xl bg-[#3DDC84] hover:bg-[#32b86c] text-black font-black flex items-center gap-3 shadow-xl shadow-[#3DDC84]/20 border-none"
              >
                <Smartphone size={20} /> Android APK
              </Button>
              <Button 
                onClick={() => handleNativeDownload('ios')}
                className="h-14 px-8 rounded-2xl bg-white hover:bg-gray-200 text-black font-black flex items-center gap-3 shadow-xl shadow-white/10 border-none"
              >
                <Apple size={20} /> iOS IPA
              </Button>
            </div>
          </div>

          <div className="flex-1 relative group">
             <div className="absolute inset-0 bg-blue-500/20 blur-[100px] rounded-full group-hover:scale-110 transition-transform"></div>
             <img 
               src="/images/mobile_mockup.png" 
               alt="NoteStandard Mobile" 
               className="relative w-full max-w-[400px] mx-auto drop-shadow-[0_35px_35px_rgba(0,0,0,0.5)] transform hover:rotate-2 transition-all duration-500"
             />
          </div>
        </div>

        {/* PWA & Install Options Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* PWA Option */}
          <div className={cn(
            "p-8 rounded-[2.5rem] border transition-all duration-300 flex flex-col justify-between h-full group relative overflow-hidden",
            isInstallable ? "bg-primary/5 border-primary/20 scale-105 shadow-2xl shadow-primary/10" : "bg-white/5 border-white/5 opacity-80"
          )}>
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Monitor size={28} />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight italic">Install via Browser</h3>
              <p className="text-sm text-gray-500 font-bold leading-relaxed">
                Install NoteStandard directly from your browser as a PWA. No downloads, no storage waste, just instant access.
              </p>
            </div>
            <div className="pt-8">
              <Button 
                onClick={handleInstallPWA}
                disabled={!isInstallable}
                fullWidth 
                variant={isInstallable ? 'primary' : 'ghost'}
                className="h-14 rounded-xl font-black uppercase tracking-widest text-xs"
              >
                {isInstallable ? 'Install Now' : 'Not Supported on this Browser'}
              </Button>
            </div>
            {isInstallable && (
               <div className="absolute top-4 right-4">
                  <div className="px-2 py-1 bg-primary text-[8px] font-black rounded-lg uppercase">Recommended</div>
               </div>
            )}
          </div>

          {/* Quick Connect / QR Code */}
          <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5 flex flex-col justify-between group">
             <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                   <QrCode size={28} />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight italic">Scan to download</h3>
                <p className="text-sm text-gray-500 font-bold leading-relaxed">
                   Scan this code with your phone camera to download the installer directly to your mobile device.
                </p>
             </div>
             <div className="pt-8 flex justify-center">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-white/5 border border-white/10 group-hover:scale-105 transition-transform duration-500">
                   <QRCodeSVG 
                     value={window.location.origin + '/dashboard/download'} 
                     size={160}
                     bgColor="#ffffff"
                     fgColor="#000000"
                     level="H"
                     includeMargin={false}
                   />
                </div>
             </div>
          </div>

          {/* Website / Web App */}
          <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/5 flex flex-col justify-between group">
             <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                   <Globe size={28} />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight italic">Web Dashboard</h3>
                <p className="text-sm text-gray-500 font-bold leading-relaxed">
                   Already using the perfect platform. Your current browser experience is fully responsive and desktop-ready.
                </p>
             </div>
             <div className="pt-8 text-center text-[10px] font-black text-gray-700 uppercase tracking-[0.3em]">
                Current active session
             </div>
          </div>

        </div>

        {/* Installation Guides */}
        <div className="space-y-8 pt-6">
           <h2 className="text-3xl font-black uppercase tracking-tighter italic border-l-4 border-primary pl-6">Installation Guides</h2>
           
           <div className="grid md:grid-cols-2 gap-8">
              
              {/* Android Guide */}
              <div className="space-y-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/5">
                 <div className="flex items-center gap-3">
                    <Smartphone className="text-[#3DDC84]" size={24} />
                    <h4 className="text-xl font-black uppercase italic tracking-tight">Android Installation</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">01</span>
                       <p className="text-sm text-gray-400 font-bold">Download the APK file above to your device.</p>
                    </div>
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">02</span>
                       <p className="text-sm text-gray-400 font-bold">Go to <span className="text-white">Settings &gt; Security</span> and enable "Unknown Sources".</p>
                    </div>
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">03</span>
                       <p className="text-sm text-gray-400 font-bold">Open the APK file from your Downloads folder and tap "Install".</p>
                    </div>
                 </div>
              </div>

              {/* iOS Guide */}
              <div className="space-y-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/5">
                 <div className="flex items-center gap-3">
                    <Apple className="text-white" size={24} />
                    <h4 className="text-xl font-black uppercase italic tracking-tight">iOS Installation</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">01</span>
                       <p className="text-sm text-gray-400 font-bold">Download the .IPA file. Note: This requires an enterprise certificate or alt-store.</p>
                    </div>
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">02</span>
                       <p className="text-sm text-gray-400 font-bold">Recommended: Use <span className="text-white italic">PWA (Install via Browser)</span> for iOS for the best experience.</p>
                    </div>
                    <div className="flex items-start gap-4">
                       <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black flex-shrink-0">03</span>
                       <p className="text-sm text-gray-400 font-bold">To use PWA: Tap the <span className="text-primary font-black">Share icon</span> in Safari and select "Add to Home Screen".</p>
                    </div>
                 </div>
              </div>

           </div>
        </div>

        {/* Support Section */}
        <div className="text-center bg-gray-900/50 p-12 rounded-[3rem] border border-dashed border-white/10">
           <AlertCircle className="mx-auto text-gray-600 mb-4" size={40} />
           <p className="text-gray-500 font-bold text-sm max-w-lg mx-auto leading-relaxed">
              If you encounter any issues during installation, please contact our support team or check your device's security settings.
           </p>
           <button className="mt-6 text-primary text-xs font-black uppercase tracking-[0.3em] hover:opacity-80 flex items-center gap-2 mx-auto transition-all">
              Technical Support <ArrowRight size={14} />
           </button>
        </div>

      </div>
    </div>
  );
};

export default DownloadPage;
