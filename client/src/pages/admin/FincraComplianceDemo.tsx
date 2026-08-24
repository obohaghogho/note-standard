import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    RotateCcw,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Minimize2,
    ArrowRight,
    Lock,
    Scale,
    FileText,
    Activity,
    Layers,
    DollarSign,
    RefreshCw,
    UserCheck,
    Sliders,
    HelpCircle,
    Check,
    X,
    Info
} from 'lucide-react';
import './FincraComplianceDemo.css';

// ─── TYPES & INTERFACES ───
interface LifecycleStep {
    id: string;
    label: string;
    status: 'INITIATED' | 'VALIDATED' | 'PROVIDER_REQUESTED' | 'WEBHOOK_RECEIVED' | 'LEDGER_POSTED' | 'SETTLED' | 'PROVIDER_FAILED' | 'REVERSAL_POSTED' | 'WALLET_RESTORED' | 'REVERSED';
    timestamp: string;
    actor: string;
    description: string;
    details: string;
}

interface LedgerLine {
    id: string;
    account: string;
    type: 'Asset' | 'Liability' | 'Expense' | 'Revenue';
    debit: number;
    credit: number;
    reference: string;
    description: string;
}

interface AuditLogEntry {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    txId: string;
    reference: string;
    result: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REVERSED';
}

interface ComplianceControlItem {
    id: string;
    name: string;
    status: 'VERIFIED' | 'IMPLEMENTED — LIVE VALIDATION PENDING' | 'PARTIALLY IMPLEMENTED' | 'NOT VERIFIED' | 'NOT IMPLEMENTED';
    evidence: string;
    description: string;
}

// ─── COMPLIANCE CONTROLS MATRIX BASED ON REPOSITORY AUDIT ───
const COMPLIANCE_CONTROLS_DATA: ComplianceControlItem[] = [
    {
        id: 'ctrl-1',
        name: 'Authentication & Session Security',
        status: 'VERIFIED',
        evidence: 'AuthContext.tsx, authRoutes.js, Express Bearer Middleware',
        description: 'Multi-factor capable Supabase JWT session verification with token auto-refresh and session arbitration.'
    },
    {
        id: 'ctrl-2',
        name: 'KYC Status & User Verification',
        status: 'IMPLEMENTED — LIVE VALIDATION PENDING',
        evidence: 'profiles.plan_tier, 20260226_create_pending_verifications.sql',
        description: 'Tiered user verification framework enforcing tier limits and identification check protocols.'
    },
    {
        id: 'ctrl-3',
        name: 'Transaction Limits & Velocity Enforcement',
        status: 'IMPLEMENTED — LIVE VALIDATION PENDING',
        evidence: '114_add_custom_deposit_limit.sql, LimitRequestsPage.tsx',
        description: 'Dynamic per-transaction and daily cumulative cap verification prior to routing payment requests.'
    },
    {
        id: 'ctrl-4',
        name: 'Authorization & Role Access (RBAC)',
        status: 'VERIFIED',
        evidence: 'ProtectedRoute.tsx (allowedRoles=[admin, support]), 330_rbac_roles_permissions.sql',
        description: 'Strict role-based access control protecting administration dashboards and compliance endpoints.'
    },
    {
        id: 'ctrl-5',
        name: 'Idempotency & Duplicate Request Protection',
        status: 'VERIFIED',
        evidence: '174_fincra_deterministic_idempotency.sql, 185_fix_confirm_deposit_idempotency.sql',
        description: 'Deterministic hash-keyed idempotency fences preventing duplicate provider requests or replay attacks.'
    },
    {
        id: 'ctrl-6',
        name: 'Row Level Security (RLS) Isolation',
        status: 'VERIFIED',
        evidence: '067_ledger_balance_and_rls_hardening.sql, 078_wallet_rls_hardening.sql, 175_harden_rls_public.sql',
        description: 'Hardened PostgreSQL RLS policies preventing cross-tenant wallet or transaction access.'
    },
    {
        id: 'ctrl-7',
        name: 'Provider Health & Capabilities Verification',
        status: 'VERIFIED',
        evidence: 'providerHealthRoutes.js, 257_provider_health_metrics.sql, PaymentCapabilitiesPage.tsx',
        description: 'Real-time telemetry and circuit breaker evaluation of external gateways prior to dispatching payments.'
    },
    {
        id: 'ctrl-8',
        name: 'Webhook Event Processing & Verification',
        status: 'VERIFIED',
        evidence: 'server/routes/webhooks.js, server/routes/fincraWebhook.js, 304_webhook_events.sql',
        description: 'HMAC signature verification and outbox pattern handling for inbound provider notifications.'
    },
    {
        id: 'ctrl-9',
        name: 'Double-Entry Ledger Accounting Integrity',
        status: 'VERIFIED',
        evidence: '067_ledger_balance_and_rls_hardening.sql, 164_v6_institutional_ledger.sql, 299_double_entry_ledger.sql',
        description: 'Atomic double-entry journal posting enforcing strict equality: Total Debits == Total Credits.'
    },
    {
        id: 'ctrl-10',
        name: 'Settlement Finality & State Machine Tracking',
        status: 'VERIFIED',
        evidence: '136_settlement_finality.sql, 253_settlements_state_machine.sql, 407_atomic_withdrawal_settlement_rpc.sql',
        description: 'Deterministic state machine preventing premature balance releases until provider confirmation.'
    },
    {
        id: 'ctrl-11',
        name: 'Failed Transaction & Dead Letter Queue (DLQ)',
        status: 'VERIFIED',
        evidence: '172_hardened_dlq.sql, 310_dead_letter_queue.sql',
        description: 'Isolated quarantine storage for unresolvable provider errors with automated retries.'
    },
    {
        id: 'ctrl-12',
        name: 'Reversal & Refund Accounting Safeguards',
        status: 'VERIFIED',
        evidence: '204_fix_payout_reversal_and_ui_state.sql, 246_reconcile_and_refund_reserved_withdrawals.sql',
        description: 'Automated atomic ledger reversal entries restoring user balances upon provider payment cancellation.'
    },
    {
        id: 'ctrl-13',
        name: 'Immutable Audit Trail Logging',
        status: 'VERIFIED',
        evidence: '256_immutable_audit_log.sql, 331_audit_logs_compliance.sql, 345_audit_trail_explorer.sql',
        description: 'Append-only cryptographic action log capturing every compliance, payment, and system decision.'
    }
];

export default function FincraComplianceDemo() {
    // ─── STATE MANAGEMENT ───
    const [presentationMode, setPresentationMode] = useState<boolean>(false);
    const [voiceNarration, setVoiceNarration] = useState<boolean>(true);
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(5); // default settled
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
    const [failureScenario, setFailureScenario] = useState<boolean>(false);

    // Dynamic Fee Calculator State
    const [grossAmount, setGrossAmount] = useState<number>(500000);
    const [providerFee, setProviderFee] = useState<number>(2500); // 0.5%
    const [platformFee, setPlatformFee] = useState<number>(23000); // 4.6%

    // Editable Double-Entry Ledger State
    const [ledgerEntries, setLedgerEntries] = useState<LedgerLine[]>([
        { id: '1', account: '1010 - User NGN Custody Account', type: 'Asset', debit: 500000, credit: 0, reference: 'DEMO-TX-001', description: 'Fincra Inbound Settlement Custody' },
        { id: '2', account: '2010 - Fincra Clearing Reserve', type: 'Liability', debit: 0, credit: 474500, reference: 'DEMO-TX-001', description: 'Net Provider Settlement Credit' },
        { id: '3', account: '4010 - Fincra Processing Fee Expense', type: 'Expense', debit: 0, credit: 2500, reference: 'DEMO-TX-001', description: 'Gateway Provider Transaction Fee' },
        { id: '4', account: '4020 - NoteStandard Platform Fee Revenue', type: 'Revenue', debit: 0, credit: 23000, reference: 'DEMO-TX-001', description: 'Platform Service Fee Allocation' }
    ]);

    // Reconciliation View State
    const [mismatchSimulated, setMismatchSimulated] = useState<boolean>(false);

    // Audit Trail State
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
        { id: 'log-1', timestamp: '09:00:01', actor: 'DEMO_USER', action: 'Transaction initiated by user', txId: 'DEMO-TX-001', reference: 'DEMO-PROVIDER-001', result: 'SUCCESS' },
        { id: 'log-2', timestamp: '09:00:02', actor: 'COMPLIANCE', action: 'KYC Tier 1 & Daily Limit Validation passed', txId: 'DEMO-TX-001', reference: 'LIMIT-CHECK-8821', result: 'SUCCESS' },
        { id: 'log-3', timestamp: '09:00:03', actor: 'SYSTEM', action: 'Fincra Sandbox Request Dispatched', txId: 'DEMO-TX-001', reference: 'DEMO-PROVIDER-001', result: 'SUCCESS' },
        { id: 'log-4', timestamp: '09:00:04', actor: 'PROVIDER', action: 'Signed Fincra Webhook Event Received', txId: 'DEMO-TX-001', reference: 'DEMO-WEBHOOK-001', result: 'SUCCESS' },
        { id: 'log-5', timestamp: '09:00:05', actor: 'LEDGER', action: 'Double-Entry Journal Lines Posted', txId: 'DEMO-TX-001', reference: 'DEMO-LEDGER-001', result: 'SUCCESS' },
        { id: 'log-6', timestamp: '09:00:06', actor: 'SYSTEM', action: 'Reconciliation & Settlement Finalized', txId: 'DEMO-TX-001', reference: 'SETTLED-REF-001', result: 'SUCCESS' }
    ]);

    // ─── LIFECYCLE STEPS DEFINITION ───
    const normalLifecycleSteps: LifecycleStep[] = [
        { id: 'step-1', label: '1. INITIATED', status: 'INITIATED', timestamp: '09:00:01', actor: 'DEMO_USER', description: 'User submits transaction request of ₦500,000 DEMO.', details: 'ID: DEMO-TX-001 | Currency: NGN | Destination: Fincra Virtual Account' },
        { id: 'step-2', label: '2. VALIDATED', status: 'VALIDATED', timestamp: '09:00:02', actor: 'COMPLIANCE', description: 'KYC Tier 1 check verified. Remaining daily limit (₦1,125,000) > ₦500,000.', details: 'User Status: VERIFIED | Risk Score: LOW | Idempotency Key: HASH-7712' },
        { id: 'step-3', label: '3. PROVIDER_REQUESTED', status: 'PROVIDER_REQUESTED', timestamp: '09:00:03', actor: 'SYSTEM', description: 'Fincra payment endpoint called with sandbox parameters.', details: 'Provider Ref: DEMO-PROVIDER-001 | Channel: NGN_BANK_TRANSFER' },
        { id: 'step-4', label: '4. WEBHOOK_RECEIVED', status: 'WEBHOOK_RECEIVED', timestamp: '09:00:04', actor: 'PROVIDER', description: 'Inbound Fincra webhook notification cryptographically verified.', details: 'Webhook Event ID: DEMO-WEBHOOK-001 | Signature: SHA256-VALID' },
        { id: 'step-5', label: '5. LEDGER_POSTED', status: 'LEDGER_POSTED', timestamp: '09:00:05', actor: 'LEDGER', description: 'Double-entry journal posted. Debits (₦500k) == Credits (₦500k).', details: 'Ledger Ref: DEMO-LEDGER-001 | Balance Check: MATCHED' },
        { id: 'step-6', label: '6. SETTLED', status: 'SETTLED', timestamp: '09:00:06', actor: 'SYSTEM', description: 'Transaction marked SETTLED. Wallet credit applied.', details: 'Wallet Delta: +₦500,000 DEMO | Final Status: SETTLED' }
    ];

    const failureLifecycleSteps: LifecycleStep[] = [
        { id: 'f-step-1', label: '1. INITIATED', status: 'INITIATED', timestamp: '09:05:01', actor: 'DEMO_USER', description: 'User initiates ₦100,000 withdrawal via Fincra payout.', details: 'ID: DEMO-TX-ERR-99 | Wallet Balance: ₦2,450,000 DEMO' },
        { id: 'f-step-2', label: '2. VALIDATED', status: 'VALIDATED', timestamp: '09:05:02', actor: 'COMPLIANCE', description: 'Pre-flight check passed. Wallet balance reserved.', details: 'Reserved Amount: ₦100,000 DEMO | Status: PENDING_PROVIDER' },
        { id: 'f-step-3', label: '3. PROVIDER_REQUESTED', status: 'PROVIDER_REQUESTED', timestamp: '09:05:03', actor: 'SYSTEM', description: 'Payout request dispatched to Fincra settlement API.', details: 'Provider Ref: DEMO-PROVIDER-ERR-99' },
        { id: 'f-step-4', label: '4. PROVIDER_FAILED', status: 'PROVIDER_FAILED', timestamp: '09:05:04', actor: 'PROVIDER', description: 'Fincra returned 502 GATEWAY_TIMEOUT provider failure.', details: 'Error Code: PROVIDER_TIMEOUT | Event Logged in DLQ' },
        { id: 'f-step-5', label: '5. REVERSAL_POSTED', status: 'REVERSAL_POSTED', timestamp: '09:05:05', actor: 'LEDGER', description: 'Atomic reversal entry posted to double-entry ledger.', details: 'Reversal Ref: DEMO-REV-001 | Restoring debit to custody account' },
        { id: 'f-step-6', label: '6. REVERSED', status: 'REVERSED', timestamp: '09:05:06', actor: 'SYSTEM', description: 'Wallet balance restored to ₦2,450,000 DEMO. Final status REVERSED.', details: 'Final Balance: ₦2,450,000 DEMO | Reversal Balanced: YES' }
    ];

    const activeSteps = failureScenario ? failureLifecycleSteps : normalLifecycleSteps;

    // ─── VOICE NARRATION SPEECH ENGINE ───
    const speakNarration = useCallback((text: string) => {
        if (!voiceNarration || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel(); // Stop any active speech
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        } catch {
            /* silent fallback */
        }
    }, [voiceNarration]);

    // Narrate when step changes
    useEffect(() => {
        const step = activeSteps[currentStepIndex];
        if (step && voiceNarration) {
            speakNarration(`Stage ${step.label}. ${step.description}`);
        }
    }, [currentStepIndex, activeSteps, voiceNarration, speakNarration]);

    // Keyboard Shortcuts (Esc to exit presentation mode, P to toggle)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && presentationMode) {
                setPresentationMode(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [presentationMode]);

    // Dynamic Calculations
    const totalDebits = ledgerEntries.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
    const totalCredits = ledgerEntries.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
    const isLedgerBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    const netProviderSettlement = (Number(grossAmount) || 0) - (Number(providerFee) || 0) - (Number(platformFee) || 0);

    const providerAmount = mismatchSimulated ? 490000 : 500000;
    const internalAmount = 500000;
    const isReconciled = providerAmount === internalAmount && isLedgerBalanced;

    // Handlers
    const handleNextStep = () => {
        if (currentStepIndex < activeSteps.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        }
    };

    const handlePrevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    const handleSimulateFailure = () => {
        setFailureScenario(true);
        setCurrentStepIndex(0);
        speakNarration('Simulating safe provider failure scenario. Watch how the system catches the timeout and executes an atomic ledger reversal.');
    };

    const handleSimulateSuccess = () => {
        setFailureScenario(false);
        setCurrentStepIndex(5);
        speakNarration('Loaded standard successful deposit and settlement workflow.');
    };

    const handleResetDemo = () => {
        setFailureScenario(false);
        setCurrentStepIndex(5);
        setGrossAmount(500000);
        setProviderFee(2500);
        setPlatformFee(23000);
        setMismatchSimulated(false);
        setShowResetConfirm(false);
        setLedgerEntries([
            { id: '1', account: '1010 - User NGN Custody Account', type: 'Asset', debit: 500000, credit: 0, reference: 'DEMO-TX-001', description: 'Fincra Inbound Settlement Custody' },
            { id: '2', account: '2010 - Fincra Clearing Reserve', type: 'Liability', debit: 0, credit: 474500, reference: 'DEMO-TX-001', description: 'Net Provider Settlement Credit' },
            { id: '3', account: '4010 - Fincra Processing Fee Expense', type: 'Expense', debit: 0, credit: 2500, reference: 'DEMO-TX-001', description: 'Gateway Provider Transaction Fee' },
            { id: '4', account: '4020 - NoteStandard Platform Fee Revenue', type: 'Revenue', debit: 0, credit: 23000, reference: 'DEMO-TX-001', description: 'Platform Service Fee Allocation' }
        ]);
        speakNarration('Demo state reset. Production databases and live financial accounts remained completely untouched.');
    };

    const updateLedgerValue = (id: string, field: 'debit' | 'credit', value: number) => {
        setLedgerEntries(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    return (
        <div className={`fincra-demo-container ${presentationMode ? 'presentation-mode-active' : ''}`}>

            {/* ─── PRESENTATION MODE WATERMARK & OVERLAY ─── */}
            {presentationMode && (
                <div className="presentation-header-bar flex items-center justify-between px-6 py-3 bg-cyan-950/90 border-b border-cyan-500/40 text-white sticky top-0 z-50 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <span className="animate-pulse flex h-3 w-3 rounded-full bg-cyan-400"></span>
                        <span className="font-mono text-sm font-bold tracking-wider text-cyan-300 uppercase">
                            DEMO / TEST DATA — FINCRA COMPLIANCE REVIEW MODE (1920x1080 OPTIMIZED)
                        </span>
                    </div>
                    <button
                        onClick={() => setPresentationMode(false)}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-medium text-xs transition shadow"
                    >
                        <Minimize2 className="w-4 h-4" /> Exit Presentation (Esc)
                    </button>
                </div>
            )}

            {/* ─── TOP SECTION: DEMO INTRODUCTION & CONTROLS ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 relative overflow-hidden backdrop-blur-xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                                <ShieldCheck className="w-8 h-8 text-cyan-400" />
                                NoteStandard
                            </h1>
                            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                Fincra Compliance Review
                            </span>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-200">
                            Compliance & Transaction Controls Demonstration
                        </h2>
                        <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                            Controlled demonstration of compliance controls, transaction lifecycle, double-entry ledger accounting, and settlement traceability. Prepared for Fincra Compliance Team.
                        </p>
                    </div>

                    {/* Quick Control Toolbar */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setVoiceNarration(!voiceNarration)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition ${voiceNarration ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                            title="Toggle Voice Explanation"
                        >
                            {voiceNarration ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
                            Voice: {voiceNarration ? 'ON' : 'OFF'}
                        </button>

                        <button
                            onClick={() => setPresentationMode(!presentationMode)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-600/30"
                        >
                            <Maximize2 className="w-4 h-4" />
                            Presentation Mode
                        </button>

                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
                        >
                            <RotateCcw className="w-4 h-4 text-amber-400" />
                            Reset Demo
                        </button>
                    </div>
                </div>

                {/* Banner */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                            <span className="font-mono font-bold text-amber-300 text-xs tracking-wider uppercase block">
                                DEMO ENVIRONMENT — TEST DATA ONLY — NO REAL MONEY
                            </span>
                            <span className="text-xs text-slate-300">
                                All transactions displayed in this demonstration use controlled test data and do not initiate real external financial movement.
                            </span>
                        </div>
                    </div>
                    <span className="hidden md:inline-block px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 text-[10px] font-mono font-bold uppercase border border-amber-500/40">
                        ISOLATED DEMO STATE
                    </span>
                </div>
            </div>

            {/* ─── GRID: SECTION 2 (USER/KYC) & SECTION 3 (WALLETS) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* 2. USER & KYC CONTROL */}
                <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-bold text-white text-base">2. User & KYC Controls</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            DEMO PROFILE
                        </span>
                    </div>

                    <div className="space-y-3 text-xs">
                        <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 font-medium">User Identifier:</span>
                            <span className="font-mono text-cyan-300 font-bold">USR-DEMO-FINCRA-8821</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 font-medium">Account Status:</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold font-mono">ACTIVE</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 font-medium">KYC Tier:</span>
                            <span className="text-white font-semibold">Tier 1 — Verified Identification</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 font-medium">Verification Status:</span>
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-4 h-4" /> VERIFIED
                            </span>
                        </div>

                        {/* Limits Bar */}
                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between text-slate-300 font-medium">
                                <span>Daily Limit: ₦1,500,000 / $1,000</span>
                                <span className="text-cyan-400 font-bold">Used: ₦375,000 (25%)</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div className="bg-cyan-500 h-2 rounded-full" style={{ width: '25%' }}></div>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-400">
                                <span>Remaining Limit:</span>
                                <span className="text-emerald-400 font-bold font-mono">₦1,125,000 / $750 DEMO</span>
                            </div>
                        </div>

                        <div className="text-[11px] text-slate-400 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
                            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span>Rule: Verification pipeline enforces Tier 1 daily limit before dispatching payment intents to Fincra routing engines.</span>
                        </div>
                    </div>
                </div>

                {/* 3. WALLET CONTROL */}
                <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-cyan-400" />
                            <h3 className="font-bold text-white text-base">3. Active Wallet Models (6-Asset Infrastructure)</h3>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">ISOLATED DEMO BALANCES</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>NGN Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">₦ 2,450,000.00</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>

                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>USD Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">$ 15,200.00</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>

                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>GHS Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">GH₵ 18,500.00</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>

                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>BTC Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">1.25000000 BTC</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>

                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>USDT Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">10,000.00 USDT</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>

                        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="flex justify-between items-center text-slate-400 font-mono">
                                <span>USDC Wallet</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[9px]">ACTIVE</span>
                            </div>
                            <div className="text-base font-bold text-white font-mono">5,000.00 USDC</div>
                            <div className="text-[10px] text-slate-500 font-mono">DEMO BALANCE</div>
                        </div>
                    </div>

                    {/* Unsupported currencies requirement explicitly stated */}
                    <div className="flex items-center gap-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400 font-medium">Restricted Assets:</span>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded font-mono text-[11px] flex items-center gap-1">
                                <X className="w-3 h-3" /> EUR — NOT AVAILABLE
                            </span>
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded font-mono text-[11px] flex items-center gap-1">
                                <X className="w-3 h-3" /> GBP — NOT AVAILABLE
                            </span>
                        </div>
                    </div>
                </div>

            </div>

            {/* ─── 4. TRANSACTION LIFECYCLE DEMONSTRATION ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-cyan-400" />
                            <h3 className="font-bold text-white text-lg">4. Interactive Transaction Lifecycle</h3>
                        </div>
                        <p className="text-xs text-slate-400">
                            {failureScenario ? 'Demonstrating Provider Failure & Reversal Workflow' : 'Demonstrating End-to-End Deposit & Settlement Workflow'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {failureScenario ? (
                            <button
                                onClick={handleSimulateSuccess}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow"
                            >
                                <CheckCircle2 className="w-4 h-4" /> Load Success Flow
                            </button>
                        ) : (
                            <button
                                onClick={handleSimulateFailure}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow"
                            >
                                <AlertTriangle className="w-4 h-4" /> Simulate Provider Failure
                            </button>
                        )}

                        <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                            <button
                                onClick={handlePrevStep}
                                disabled={currentStepIndex === 0}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-300 disabled:opacity-30 hover:text-white"
                            >
                                Prev
                            </button>
                            <span className="px-2 text-xs font-mono text-cyan-400 font-bold">
                                {currentStepIndex + 1}/{activeSteps.length}
                            </span>
                            <button
                                onClick={handleNextStep}
                                disabled={currentStepIndex === activeSteps.length - 1}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-300 disabled:opacity-30 hover:text-white"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* Timeline Stepper Nodes */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {activeSteps.map((step, idx) => {
                        const isActive = idx === currentStepIndex;
                        const isCompleted = idx < currentStepIndex;
                        return (
                            <div
                                key={step.id}
                                onClick={() => setCurrentStepIndex(idx)}
                                className={`cursor-pointer p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
                                    isActive
                                        ? 'bg-cyan-950/80 border-cyan-400 shadow-lg shadow-cyan-500/20 scale-105'
                                        : isCompleted
                                            ? 'bg-slate-950/80 border-emerald-500/40 text-slate-300'
                                            : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-mono text-[10px] text-slate-400">{step.timestamp}</span>
                                    {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                    {isActive && <span className="animate-ping h-2 w-2 rounded-full bg-cyan-400"></span>}
                                </div>
                                <div className="font-bold font-mono text-[11px] truncate">{step.label}</div>
                                <div className="text-[10px] text-slate-400 truncate">{step.actor}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Active Step Detailed Card */}
                {activeSteps[currentStepIndex] && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-cyan-500/40 space-y-2">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                            <span className="font-mono font-bold text-cyan-300 text-sm">
                                ACTIVE STEP: {activeSteps[currentStepIndex].label}
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                ACTOR: {activeSteps[currentStepIndex].actor}
                            </span>
                        </div>
                        <p className="text-xs text-slate-200 font-medium">
                            {activeSteps[currentStepIndex].description}
                        </p>
                        <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                            {activeSteps[currentStepIndex].details}
                        </div>
                    </div>
                )}
            </div>

            {/* ─── 5. EVIDENCE TRACEABILITY ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-400" />
                        <h3 className="font-bold text-white text-base">5. Evidence Traceability Chain</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        AUDIT VERIFIED
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">1. Provider Tx ID</span>
                        <span className="font-mono font-bold text-cyan-300 block truncate">DEMO-PROVIDER-001</span>
                        <span className="text-[10px] text-slate-500">External Evidence</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">2. Webhook Event ID</span>
                        <span className="font-mono font-bold text-cyan-300 block truncate">DEMO-WEBHOOK-001</span>
                        <span className="text-[10px] text-slate-500">Signed Inbound Payload</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">3. NoteStandard Tx ID</span>
                        <span className="font-mono font-bold text-cyan-300 block truncate">DEMO-TX-001</span>
                        <span className="text-[10px] text-slate-500">Internal Core Ref</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">4. Ledger Line ID</span>
                        <span className="font-mono font-bold text-cyan-300 block truncate">DEMO-LEDGER-001</span>
                        <span className="text-[10px] text-slate-500">Double-Entry Journal</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">5. Wallet Balance Delta</span>
                        <span className="font-mono font-bold text-emerald-400 block truncate">+₦500,000 DEMO</span>
                        <span className="text-[10px] text-slate-500">Custody Allocation</span>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">6. Settlement Finality</span>
                        <span className="font-mono font-bold text-emerald-400 block truncate">SETTLED</span>
                        <span className="text-[10px] text-slate-500">State Machine State</span>
                    </div>
                </div>
            </div>

            {/* ─── 6. DOUBLE-ENTRY LEDGER DEMONSTRATION ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <Scale className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-bold text-white text-base">6. Double-Entry Ledger Demonstration</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-mono">DYNAMIC EQUALITY CHECK</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                            isLedgerBalanced
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                        }`}>
                            BALANCED: {isLedgerBalanced ? 'YES' : 'NO (IMBALANCE DETECTED)'}
                        </span>
                    </div>
                </div>

                <p className="text-xs text-slate-400">
                    The table below evaluates <code className="text-cyan-300 font-mono">Total Debits === Total Credits</code> dynamically in code. You can edit amounts below to test accounting validation failure handling.
                </p>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                                <th className="p-2.5">Account Code & Name</th>
                                <th className="p-2.5">Type</th>
                                <th className="p-2.5 text-right">Debit (₦)</th>
                                <th className="p-2.5 text-right">Credit (₦)</th>
                                <th className="p-2.5">Reference</th>
                                <th className="p-2.5">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                            {ledgerEntries.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-800/40">
                                    <td className="p-2.5 font-bold text-cyan-300">{row.account}</td>
                                    <td className="p-2.5">
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                                            {row.type}
                                        </span>
                                    </td>
                                    <td className="p-2.5 text-right">
                                        <input
                                            type="number"
                                            value={row.debit}
                                            onChange={(e) => updateLedgerValue(row.id, 'debit', Number(e.target.value))}
                                            className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-emerald-400 font-bold focus:border-cyan-400 outline-none"
                                        />
                                    </td>
                                    <td className="p-2.5 text-right">
                                        <input
                                            type="number"
                                            value={row.credit}
                                            onChange={(e) => updateLedgerValue(row.id, 'credit', Number(e.target.value))}
                                            className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-cyan-400 font-bold focus:border-cyan-400 outline-none"
                                        />
                                    </td>
                                    <td className="p-2.5 text-slate-400 text-[11px]">{row.reference}</td>
                                    <td className="p-2.5 text-slate-300 text-[11px]">{row.description}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-950 font-mono font-bold text-xs border-t border-slate-800">
                                <td colSpan={2} className="p-3 text-slate-300">TOTAL ACCOUNTING BALANCE</td>
                                <td className="p-3 text-right text-emerald-400 text-sm">₦ {totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-right text-cyan-400 text-sm">₦ {totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td colSpan={2} className="p-3 text-right">
                                    <span className={isLedgerBalanced ? 'text-emerald-400' : 'text-red-400'}>
                                        DELTA: ₦ {Math.abs(totalDebits - totalCredits).toLocaleString()}
                                    </span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* ─── GRID: SECTION 7 (FEES) & SECTION 10 (RECONCILIATION) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* 7. FEE RECONCILIATION */}
                <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-cyan-400" />
                            <h3 className="font-bold text-white text-base">7. Fee Engine & Net Settlement</h3>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">FORMULA CALCULATOR</span>
                    </div>

                    <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Gross Amount (₦)</label>
                                <input
                                    type="number"
                                    value={grossAmount}
                                    onChange={(e) => setGrossAmount(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Provider Fee (₦)</label>
                                <input
                                    type="number"
                                    value={providerFee}
                                    onChange={(e) => setProviderFee(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-amber-400 text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] text-slate-400 block mb-1">Platform Fee (₦)</label>
                                <input
                                    type="number"
                                    value={platformFee}
                                    onChange={(e) => setPlatformFee(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-cyan-400 text-xs"
                                />
                            </div>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 font-mono">
                            <div className="flex justify-between text-slate-400">
                                <span>Gross Transaction Amount:</span>
                                <span className="text-white font-bold">₦ {grossAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-amber-400">
                                <span>- Fincra Provider Fee (0.5%):</span>
                                <span>- ₦ {providerFee.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-cyan-400">
                                <span>- NoteStandard Platform Fee (4.6%):</span>
                                <span>- ₦ {platformFee.toLocaleString()}</span>
                            </div>
                            <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-emerald-400">
                                <span>= Net Provider Settlement:</span>
                                <span>₦ {netProviderSettlement.toLocaleString()} NGN</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 10. RECONCILIATION VIEW */}
                <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-bold text-white text-base">10. Dynamic Reconciliation View</h3>
                        </div>
                        <button
                            onClick={() => setMismatchSimulated(!mismatchSimulated)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono border border-slate-700"
                        >
                            Toggle Mismatch: {mismatchSimulated ? 'ON' : 'OFF'}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Provider Settlement Amount</span>
                            <span className={`font-bold text-sm ${mismatchSimulated ? 'text-red-400' : 'text-emerald-400'}`}>
                                ₦ {providerAmount.toLocaleString()}
                            </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Internal Transaction Record</span>
                            <span className="font-bold text-sm text-cyan-300">
                                ₦ {internalAmount.toLocaleString()}
                            </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Ledger Total Debits</span>
                            <span className="font-bold text-xs text-white">₦ {totalDebits.toLocaleString()}</span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px] block">Ledger Total Credits</span>
                            <span className="font-bold text-xs text-white">₦ {totalCredits.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border flex items-center justify-between ${
                        isReconciled
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/40 text-red-300'
                    }`}>
                        <div className="flex items-center gap-2">
                            {isReconciled ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
                            <span className="font-mono font-bold text-xs">
                                RECONCILIATION STATUS: {isReconciled ? 'RECONCILED' : 'MISMATCH DETECTED'}
                            </span>
                        </div>
                        <span className="text-[10px] font-mono underline">
                            {isReconciled ? 'Zero Discrepancy' : 'Provider Discrepancy ₦10,000'}
                        </span>
                    </div>
                </div>

            </div>

            {/* ─── 8. COMPLIANCE CONTROLS PANEL ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-cyan-400" />
                        <h3 className="font-bold text-white text-base">8. Repository Compliance Controls Matrix</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">13 AUDITED CONTROLS</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                                <th className="p-2.5">Control Name</th>
                                <th className="p-2.5">Repository Verified Status</th>
                                <th className="p-2.5">Code / Migration Evidence</th>
                                <th className="p-2.5">Control Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                            {COMPLIANCE_CONTROLS_DATA.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-800/40">
                                    <td className="p-2.5 font-bold text-cyan-300">{item.name}</td>
                                    <td className="p-2.5">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            item.status === 'VERIFIED'
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                        }`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="p-2.5 text-slate-400 text-[11px]">{item.evidence}</td>
                                    <td className="p-2.5 text-slate-300 text-[11px] font-sans">{item.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── 11. AUDIT TRAIL ─── */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-cyan-400" />
                        <h3 className="font-bold text-white text-base">11. Immutable Demo Audit Log</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">CHRONOLOGICAL TRAIL</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                                <th className="p-2.5">Timestamp</th>
                                <th className="p-2.5">Actor</th>
                                <th className="p-2.5">Action Executed</th>
                                <th className="p-2.5">Tx ID</th>
                                <th className="p-2.5">Reference ID</th>
                                <th className="p-2.5">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                            {auditLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-800/40">
                                    <td className="p-2.5 text-slate-400">{log.timestamp}</td>
                                    <td className="p-2.5 text-cyan-300 font-bold">{log.actor}</td>
                                    <td className="p-2.5 text-slate-200">{log.action}</td>
                                    <td className="p-2.5 text-slate-400">{log.txId}</td>
                                    <td className="p-2.5 text-slate-400">{log.reference}</td>
                                    <td className="p-2.5">
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                                            {log.result}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── RESET CONFIRMATION MODAL ─── */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                        <div className="flex items-center gap-3 text-amber-400">
                            <AlertTriangle className="w-6 h-6 shrink-0" />
                            <h3 className="font-bold text-white text-lg">Reset Demo State?</h3>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            This will reset local interactive demo inputs, failure simulations, and ledger entries to their defaults.
                        </p>
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                            Safety Guarantee: This action affects ONLY local React state. No database records, production wallets, or live API credentials will be modified.
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResetDemo}
                                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30"
                            >
                                Confirm Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
