import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Play, Pause, Volume2, VolumeX, RotateCcw,
    MessageSquare, Video, Wallet, Users, Bot, ShieldCheck,
    Send, Mic, PhoneCall, ArrowRight, Copy, Check, Sparkles, Sliders, PlayCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Chapter {
    id: string;
    title: string;
    duration: string;
    timestamp: number; // in seconds
    icon: React.ElementType;
    badge: string;
    description: string;
    narration: string;
    steps: string[];
}

const CHAPTERS: Chapter[] = [
    {
        id: 'chat',
        title: 'Real-Time Messaging & Voice Notes',
        duration: '0:25',
        timestamp: 0,
        icon: MessageSquare,
        badge: 'Core Chat',
        description: 'Instant encrypted messaging with rich media, high-fidelity voice notes, live reaction emojis, and read receipts.',
        narration: 'Welcome to NoteStandard Messaging. Type messages, record crystal-clear voice notes, share media, and react instantly in private or group conversations.',
        steps: [
            'Tap the voice note icon to record audio on the fly',
            'Send files, media attachments, and code snippets securely',
            'React to any message with custom emojis and instant feedback'
        ]
    },
    {
        id: 'calls',
        title: 'HD Voice & Video Calling',
        duration: '0:25',
        timestamp: 25,
        icon: Video,
        badge: 'WebRTC Calls',
        description: 'Low-latency HD WebRTC 1-on-1 and group calls with screen sharing, background blur, and active speaker spotlight.',
        narration: 'Connect face-to-face with crystal-clear WebRTC audio and video calling. Share your screen with one click and collaborate effortlessly.',
        steps: [
            'Start an instant 1-on-1 or group call with any contact',
            'Share screen, window, or specific browser tabs in HD',
            'Toggle camera, mute mic, and switch audio devices on the fly'
        ]
    },
    {
        id: 'wallet',
        title: 'Multi-Currency Digital Wallet',
        duration: '0:25',
        timestamp: 50,
        icon: Wallet,
        badge: 'Fintech & Wallet',
        description: 'Instant virtual NUBAN account generation, multi-currency wallet (NGN, USD, EUR), and peer-to-peer transfers inside chat.',
        narration: 'Manage your finances directly inside NoteStandard. Get a dedicated virtual bank account, fund your wallet, and send money to anyone in chat instantly.',
        steps: [
            'Generate a dedicated virtual bank account number in seconds',
            'Hold and exchange multi-currency balances with live rates',
            'Send peer-to-peer payments directly inside active chat threads'
        ]
    },
    {
        id: 'teams',
        title: 'Team Workspaces & Channels',
        duration: '0:20',
        timestamp: 75,
        icon: Users,
        badge: 'Collaboration',
        description: 'Organize work into dedicated team spaces, public/private channels, task checklists, and shared pinboards.',
        narration: 'Streamline team productivity with structured workspaces, channel discussions, and assigned tasks in real time.',
        steps: [
            'Create dedicated workspace channels for engineering, marketing, or projects',
            'Assign team tasks with due dates and real-time status tracking',
            'Share pinned documents and notes accessible to team members'
        ]
    },
    {
        id: 'ai',
        title: 'AI Assistant & Auto Summaries',
        duration: '0:15',
        timestamp: 95,
        icon: Bot,
        badge: 'AI Powered',
        description: 'Smart AI note taking, automated transcriptions for voice messages & calls, and instant multilingual translation.',
        narration: 'Supercharge your workflow with our built-in AI Assistant. Get instant summaries of long conversations and automated voice transcriptions.',
        steps: [
            'Generate concise bullet summaries of unread chat threads',
            'Transcribe incoming voice notes into text automatically',
            'Translate incoming messages into 30+ languages instantaneously'
        ]
    },
    {
        id: 'security',
        title: 'Bank-Grade E2E Security',
        duration: '0:15',
        timestamp: 110,
        icon: ShieldCheck,
        badge: 'Security & E2E',
        description: 'End-to-end encryption for chat & calls, biometric authentication, app lock PIN, and session device monitoring.',
        narration: 'Your privacy is paramount. NoteStandard protects every message, file, and payment with end-to-end encryption and bank-grade protocols.',
        steps: [
            'End-to-End Encryption (E2EE) ensures only you and your recipient read messages',
            'Enable biometric lock and PIN protection for app access',
            'View and revoke active device sessions anytime'
        ]
    }
];

export const AppDemoSection: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'video' | 'interactive'>('video');
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showSubtitles, setShowSubtitles] = useState(true);
    const [copiedNuban, setCopiedNuban] = useState(false);

    // Interactive Mode State
    const [simulatedChat, setSimulatedChat] = useState([
        { sender: 'Alex (Product Lead)', text: 'Hey team! Welcome to NoteStandard Pro 🚀', time: '10:42 AM', type: 'text' },
        { sender: 'You', text: 'Thanks Alex! Sending over the project notes now.', time: '10:43 AM', type: 'text' },
        { sender: 'Alex (Product Lead)', text: 'Awesome! Did you check out the new wallet feature?', time: '10:43 AM', type: 'text' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const totalDuration = 125; // 2 min 5 sec
    const activeChapter = CHAPTERS[currentChapterIndex];

    // Timer effect for video simulation
    useEffect(() => {
        let timer: any = null;
        if (isPlaying && activeTab === 'video') {
            timer = setInterval(() => {
                setCurrentTime((prev) => {
                    const next = prev + 1 * playbackSpeed;
                    if (next >= totalDuration) {
                        return 0; // Loop around
                    }
                    // Sync chapter index based on timestamp
                    const newChapterIdx = CHAPTERS.findIndex((ch, idx) => {
                        const nextCh = CHAPTERS[idx + 1];
                        return next >= ch.timestamp && (!nextCh || next < nextCh.timestamp);
                    });
                    if (newChapterIdx !== -1 && newChapterIdx !== currentChapterIndex) {
                        setCurrentChapterIndex(newChapterIdx);
                    }
                    return next;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isPlaying, playbackSpeed, activeTab, currentChapterIndex]);

    // Ensure no speech synthesis voice narration plays
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }, []);

    const handleSelectChapter = (index: number) => {
        setCurrentChapterIndex(index);
        setCurrentTime(CHAPTERS[index].timestamp);
        setIsPlaying(true);
    };

    const handleSendSimulatedMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        setSimulatedChat(prev => [
            ...prev,
            { sender: 'You', text: chatInput, time: 'Just now', type: 'text' }
        ]);
        setChatInput('');

        // Simulated reply
        setTimeout(() => {
            setSimulatedChat(prev => [
                ...prev,
                { sender: 'NoteStandard AI Bot', text: '✨ Received! I can automatically summarize or translate this message for you.', time: 'Just now', type: 'ai' }
            ]);
        }, 1000);
    };

    const handleSimulateVoiceNote = () => {
        setIsRecordingAudio(true);
        setTimeout(() => {
            setIsRecordingAudio(false);
            setSimulatedChat(prev => [
                ...prev,
                { sender: 'You', text: 'Voice note (0:14) 🎵', time: 'Just now', type: 'voice' }
            ]);
        }, 2000);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <section id="demo" className="py-16 sm:py-24 relative overflow-hidden w-full bg-slate-950/60 backdrop-blur-3xl border-y border-white/10">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-emerald-500/10 via-cyan-500/10 to-purple-500/10 blur-[140px] pointer-events-none rounded-full" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
                {/* Header Title Section */}
                <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-semibold mb-4 backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    >
                        <PlayCircle className="w-4 h-4 animate-pulse" />
                        <span>Interactive App Video & Feature Demo</span>
                    </motion.div>

                    <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4 leading-tight">
                        See NoteStandard <br className="hidden sm:inline" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                            In Action Before You Sign Up
                        </span>
                    </h2>

                    <p className="text-gray-300 text-sm sm:text-lg leading-relaxed">
                        Watch our complete video tour below or switch to <strong className="text-emerald-400 font-semibold">Live Interactive Simulator Mode</strong> to test drive real-time chat, video calls, and the digital wallet right on this page.
                    </p>

                    {/* Mode Toggle Switch */}
                    <div className="mt-8 inline-flex p-1.5 rounded-2xl bg-white/5 border border-white/15 backdrop-blur-xl shadow-2xl">
                        <button
                            onClick={() => setActiveTab('video')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 ${
                                activeTab === 'video'
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Watch Video Tour (2 Min)
                        </button>
                        <button
                            onClick={() => setActiveTab('interactive')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 ${
                                activeTab === 'interactive'
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Sliders className="w-4 h-4" />
                            Live Interactive Simulator
                        </button>
                    </div>
                </div>

                {/* Chapter Selector Navigation (For Video Mode) */}
                {activeTab === 'video' && (
                    <div className="mb-8 overflow-x-auto pb-2 scrollbar-none">
                        <div className="flex items-center gap-3 min-w-max justify-start lg:justify-center">
                            {CHAPTERS.map((ch, idx) => {
                                const Icon = ch.icon;
                                const isActive = currentChapterIndex === idx;
                                return (
                                    <button
                                        key={ch.id}
                                        onClick={() => handleSelectChapter(idx)}
                                        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                                            isActive
                                                ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-105'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-gray-400'}`} />
                                        <span>{ch.title}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-emerald-300 border border-white/10">
                                            {ch.duration}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Main Showcase Player Box */}
                <div className="rounded-3xl border border-white/20 bg-slate-900/90 shadow-[0_25px_70px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2)] overflow-hidden relative backdrop-blur-2xl">
                    {/* Browser Mockup Header */}
                    <div className="h-12 border-b border-white/10 bg-black/40 flex items-center justify-between px-5 backdrop-blur-md">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </div>

                        <div className="flex items-center gap-2 px-4 py-1 rounded-lg bg-black/60 border border-white/10 text-xs font-mono text-emerald-400 shadow-inner">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>https://notestandard.com/app/demo</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                Live Demo Mode
                            </span>
                        </div>
                    </div>

                    {/* VIDEO TOUR MODE */}
                    {activeTab === 'video' ? (
                        <div className="relative min-h-[460px] sm:min-h-[520px] flex flex-col justify-between p-6 sm:p-8 bg-gradient-to-b from-slate-950/80 via-slate-900 to-slate-950">
                            {/* Top Status & Chapter Badge */}
                            <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 shadow-lg">
                                        {React.createElement(activeChapter.icon, { className: "w-6 h-6" })}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                Chapter {currentChapterIndex + 1} of {CHAPTERS.length}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">
                                                [{formatTime(currentTime)} / {formatTime(totalDuration)}]
                                            </span>
                                        </div>
                                        <h3 className="text-lg sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                                            {activeChapter.title}
                                        </h3>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsMuted(!isMuted)}
                                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                                            isMuted 
                                                ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                                                : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                                        }`}
                                    >
                                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 animate-pulse" />}
                                        <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Voice Narration On'}</span>
                                    </button>

                                    <button
                                        onClick={() => setShowSubtitles(!showSubtitles)}
                                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                                            showSubtitles
                                                ? 'bg-emerald-500/20 border-emerald-400 text-white'
                                                : 'bg-white/5 border-white/10 text-gray-400'
                                        }`}
                                    >
                                        CC
                                    </button>
                                </div>
                            </div>

                            {/* ANIMATED CANVAS STAGE FOR FEATURE DEMO */}
                            <div className="my-6 relative rounded-2xl border border-white/10 bg-slate-950/70 p-6 overflow-hidden min-h-[280px] sm:min-h-[320px] flex items-center justify-center">
                                <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeChapter.id}
                                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.96, y: -10 }}
                                        transition={{ duration: 0.4 }}
                                        className="w-full max-w-2xl relative z-10"
                                    >
                                        {/* CHAPTER 1: CHAT DEMO */}
                                        {activeChapter.id === 'chat' && (
                                            <div className="space-y-4">
                                                <div className="flex items-start gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white flex-shrink-0">
                                                        JD
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm font-bold text-white">Jossy (Engineering)</span>
                                                            <span className="text-[10px] text-emerald-400 font-mono">E2E Encrypted 🔒</span>
                                                        </div>
                                                        <p className="text-sm text-gray-200 bg-emerald-950/60 p-3 rounded-xl border border-emerald-500/30">
                                                            Hey! Did you check out the new real-time WebRTC audio call updates?
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-start gap-3 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/30 ml-8">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
                                                            <button className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-black">
                                                                <Play className="w-4 h-4 fill-current ml-0.5" />
                                                            </button>
                                                            <div className="flex-1 space-y-1">
                                                                <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full w-4/5 animate-pulse" />
                                                                <span className="text-[10px] font-mono text-gray-400">Voice Note • 0:18</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-2">
                                                    <Sparkles className="w-4 h-4 text-emerald-400" />
                                                    <span>Live typing indicators, instant read receipts, and voice waveform visualizer</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* CHAPTER 2: CALLS DEMO */}
                                        {activeChapter.id === 'calls' && (
                                            <div className="bg-slate-900/90 rounded-2xl p-6 border border-emerald-500/30 text-center space-y-5">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/30">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                                    HD WebRTC Audio & Video Call Connected • 04:12
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="h-32 rounded-xl bg-slate-800 border border-white/10 relative overflow-hidden flex flex-col justify-end p-3">
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                                        <div className="relative z-10 text-left">
                                                            <div className="text-xs font-bold text-white">Sarah Jenkins</div>
                                                            <div className="text-[10px] text-emerald-400">Active Speaker 🎙️</div>
                                                        </div>
                                                    </div>
                                                    <div className="h-32 rounded-xl bg-emerald-950/40 border border-emerald-500/40 relative overflow-hidden flex flex-col justify-end p-3">
                                                        <div className="relative z-10 text-left">
                                                            <div className="text-xs font-bold text-white">You (Screen Sharing)</div>
                                                            <div className="text-[10px] text-gray-400">1080p 60fps</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-center gap-4 pt-2">
                                                    <div className="p-3 rounded-full bg-slate-800 border border-white/10 text-gray-200">
                                                        <Mic className="w-5 h-5" />
                                                    </div>
                                                    <div className="p-3 rounded-full bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                                                        <Video className="w-5 h-5" />
                                                    </div>
                                                    <div className="p-3 rounded-full bg-red-500 text-white shadow-lg">
                                                        <PhoneCall className="w-5 h-5 rotate-[135deg]" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* CHAPTER 3: WALLET DEMO */}
                                        {activeChapter.id === 'wallet' && (
                                            <div className="space-y-4">
                                                <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-900/60 via-teal-900/40 to-slate-900 border border-emerald-500/40 shadow-2xl relative overflow-hidden">
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div>
                                                            <div className="text-xs text-emerald-400 font-semibold tracking-wider uppercase">Multi-Currency Wallet</div>
                                                            <div className="text-3xl font-black text-white mt-1 font-mono">₦ 458,250.00</div>
                                                        </div>
                                                        <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                                                            Tier 3 Verified
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                                        <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                                                            <div className="text-[10px] text-gray-400">Zenith Bank NUBAN</div>
                                                            <div className="text-sm font-bold text-white font-mono flex items-center justify-between">
                                                                9048123490
                                                                <Copy className="w-3.5 h-3.5 text-emerald-400 cursor-pointer" />
                                                            </div>
                                                        </div>
                                                        <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                                                            <div className="text-[10px] text-gray-400">USD Balance</div>
                                                            <div className="text-sm font-bold text-emerald-400 font-mono">$ 1,240.50</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* CHAPTER 4: TEAMS DEMO */}
                                        {activeChapter.id === 'teams' && (
                                            <div className="p-6 rounded-2xl bg-slate-900/90 border border-white/15 space-y-4">
                                                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-5 h-5 text-emerald-400" />
                                                        <span className="font-bold text-white text-base">NoteStandard HQ Workspace</span>
                                                    </div>
                                                    <span className="text-xs text-gray-400">14 Members Online</span>
                                                </div>

                                                <div className="space-y-2">
                                                    {['# general-discussion', '# engineering-sprints', '# wallet-api-integrations'].map((ch, i) => (
                                                        <div key={i} className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                                                            i === 1 ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200' : 'bg-white/5 border-white/10 text-gray-300'
                                                        }`}>
                                                            <span>{ch}</span>
                                                            {i === 1 && <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-[10px] font-bold">Active</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* CHAPTER 5: AI DEMO */}
                                        {activeChapter.id === 'ai' && (
                                            <div className="p-6 rounded-2xl bg-slate-900/90 border border-cyan-500/30 space-y-4">
                                                <div className="flex items-center gap-2 text-cyan-400">
                                                    <Bot className="w-6 h-6 animate-spin-slow" />
                                                    <span className="font-bold text-white text-base">NoteStandard AI Companion</span>
                                                </div>

                                                <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-gray-200 space-y-2">
                                                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                        Instant Thread Summary Generated:
                                                    </div>
                                                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                        <li>Team agreed to deploy Zenith Virtual NUBAN integration tomorrow.</li>
                                                        <li>Agora RTC video call scheduled for 3:00 PM GMT.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}

                                        {/* CHAPTER 6: SECURITY DEMO */}
                                        {activeChapter.id === 'security' && (
                                            <div className="p-6 rounded-2xl bg-slate-900/90 border border-emerald-500/40 text-center space-y-4">
                                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                                    <ShieldCheck className="w-9 h-9" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xl font-bold text-white">Bank-Grade E2EE Encryption</h4>
                                                    <p className="text-xs text-gray-300 max-w-md mx-auto mt-1">
                                                        256-bit AES Elliptic Curve Encryption guarantees that no unauthorized third-parties or servers can access your private data.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>

                                {/* Closed Caption Box */}
                                {showSubtitles && (
                                    <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-3 rounded-xl border border-white/10 text-center text-xs sm:text-sm text-emerald-300 font-medium z-20 shadow-lg">
                                        💬 "{activeChapter.narration}"
                                    </div>
                                )}
                            </div>

                            {/* VIDEO PLAYER BOTTOM CONTROLS & TIMELINE SCRUBBER */}
                            <div className="space-y-3 relative z-10">
                                {/* Timeline Scrubber */}
                                <div className="relative group cursor-pointer">
                                    <input
                                        type="range"
                                        min="0"
                                        max={totalDuration}
                                        value={currentTime}
                                        onChange={(e) => {
                                            const time = Number(e.target.value);
                                            setCurrentTime(time);
                                            const newChapterIdx = CHAPTERS.findIndex((ch, idx) => {
                                                const nextCh = CHAPTERS[idx + 1];
                                                return time >= ch.timestamp && (!nextCh || time < nextCh.timestamp);
                                            });
                                            if (newChapterIdx !== -1) setCurrentChapterIndex(newChapterIdx);
                                        }}
                                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setIsPlaying(!isPlaying)}
                                            className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                                        >
                                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                                        </button>

                                        <button
                                            onClick={() => {
                                                setCurrentTime(0);
                                                setCurrentChapterIndex(0);
                                                setIsPlaying(true);
                                            }}
                                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
                                            title="Restart Video Tour"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>

                                        <span className="text-xs font-mono text-gray-300">
                                            {formatTime(currentTime)} / {formatTime(totalDuration)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400 font-medium hidden sm:inline">Speed:</span>
                                        {[1, 1.25, 1.5, 2].map((spd) => (
                                            <button
                                                key={spd}
                                                onClick={() => setPlaybackSpeed(spd)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                                                    playbackSpeed === spd
                                                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                                                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                {spd}x
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* INTERACTIVE SIMULATOR MODE */
                        <div className="p-6 sm:p-8 bg-slate-950/90 min-h-[480px]">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                                        <Sliders className="w-5 h-5 text-emerald-400" />
                                        Try Operating NoteStandard Yourself
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Test sending messages, making transfers, or interacting with features right here.
                                    </p>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                                    No Registration Required
                                </span>
                            </div>

                            <div className="grid lg:grid-cols-3 gap-6">
                                {/* SIMULATED CHAT PANEL */}
                                <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-white/15 p-4 flex flex-col justify-between min-h-[340px]">
                                    <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-white text-xs">
                                                NS
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-white">General Product Channel</div>
                                                <div className="text-[10px] text-emerald-400">3 Online • End-to-End Encrypted</div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setActiveCallState('calling')}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5"
                                        >
                                            <Video className="w-3.5 h-3.5" />
                                            Call
                                        </button>
                                    </div>

                                    {/* Chat Messages Stream */}
                                    <div className="space-y-3 overflow-y-auto max-h-[200px] pr-2 scrollbar-thin">
                                        {simulatedChat.map((msg, i) => (
                                            <div key={i} className={`flex flex-col ${msg.sender === 'You' ? 'items-end' : 'items-start'}`}>
                                                <div className="text-[10px] text-gray-400 mb-0.5 px-1">{msg.sender} • {msg.time}</div>
                                                <div className={`p-3 rounded-2xl text-xs max-w-[85%] ${
                                                    msg.sender === 'You'
                                                        ? 'bg-emerald-600 text-white rounded-tr-none'
                                                        : msg.type === 'ai'
                                                            ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-200'
                                                            : 'bg-white/10 text-gray-200 rounded-tl-none'
                                                }`}>
                                                    {msg.text}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Chat Input Form */}
                                    <form onSubmit={handleSendSimulatedMessage} className="mt-4 flex items-center gap-2 pt-3 border-t border-white/10">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Type a test message..."
                                            className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-emerald-400"
                                        />

                                        <button
                                            type="button"
                                            onClick={handleSimulateVoiceNote}
                                            className={`p-2.5 rounded-xl border text-xs transition-all ${
                                                isRecordingAudio
                                                    ? 'bg-red-500 text-white animate-pulse'
                                                    : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                            }`}
                                            title="Record Voice Note"
                                        >
                                            <Mic className="w-4 h-4" />
                                        </button>

                                        <button
                                            type="submit"
                                            className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold transition-all"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>

                                {/* SIMULATED WALLET WIDGET */}
                                <div className="rounded-2xl bg-slate-900 border border-emerald-500/30 p-5 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                                <Wallet className="w-4 h-4" />
                                                Live Digital Wallet
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-mono">NGN / USD</span>
                                        </div>

                                        <div className="p-4 rounded-xl bg-black/50 border border-white/10 mb-4">
                                            <div className="text-[10px] text-gray-400">Total Available Balance</div>
                                            <div className="text-2xl font-black text-white font-mono mt-1">₦ 150,000.00</div>
                                            <div className="text-[10px] text-emerald-400 mt-1">Virtual NUBAN: 9048123490</div>
                                        </div>

                                        <div className="space-y-2">
                                            <button
                                                onClick={() => {
                                                    setCopiedNuban(true);
                                                    setTimeout(() => setCopiedNuban(false), 2000);
                                                }}
                                                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-white font-semibold flex items-center justify-center gap-2 transition-all"
                                            >
                                                {copiedNuban ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                                {copiedNuban ? 'NUBAN Account Copied!' : 'Copy Virtual Account NUBAN'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-white/10 text-center">
                                        <Link
                                            to="/signup"
                                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-all"
                                        >
                                            Sign Up for Full App Access
                                            <ArrowRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* FEATURE EXPLANATION CARDS UNDER PLAYER */}
                <div className="grid md:grid-cols-3 gap-6 mt-12">
                    {activeChapter.steps.map((step, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="glass-card p-6 rounded-2xl border border-white/10 hover:border-emerald-400/40 transition-all group"
                        >
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-110 transition-transform">
                                0{idx + 1}
                            </div>
                            <h4 className="text-white font-bold text-sm sm:text-base mb-1">
                                {step}
                            </h4>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Built into NoteStandard for seamless productivity without extra third-party tools.
                            </p>
                        </motion.div>
                    ))}
                </div>

                {/* BOTTOM CALL TO ACTION BANNER */}
                <div className="mt-14 p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/40 text-center relative overflow-hidden shadow-2xl">
                    <div className="relative z-10 max-w-2xl mx-auto space-y-4">
                        <h3 className="text-2xl sm:text-4xl font-extrabold text-white">
                            Ready to Upgrade Your Communications?
                        </h3>
                        <p className="text-sm sm:text-base text-gray-300">
                            Join thousands of teams and individuals already using NoteStandard for real-time messaging, WebRTC calls, and digital payments.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
                            <Link
                                to="/signup"
                                className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-base transition-all shadow-[0_0_25px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2"
                            >
                                Get Started Free
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                            <a
                                href="#features"
                                className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-xl font-bold text-base transition-all backdrop-blur-md"
                            >
                                Compare All Features
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AppDemoSection;
