import sys
sys.path.insert(0, r'C:\Users\hp\AppData\Roaming\Python\Python314\site-packages')

import os
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

output_dirs = [
    r'C:\Users\hp\Downloads',
    r'C:\Users\hp\Desktop',
    r'C:\Users\hp\.gemini\antigravity-ide\brain\5ce5c861-cc50-4e94-b0e7-e7a8bdabc3ee'
]

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#475569"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 11 * 72 - 36, "Jossy Digital Technologies Ltd | NoteStandard Enterprise Fincra Onboarding Package")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 11 * 72 - 42, 8.5 * 72 - 54, 11 * 72 - 42)
            
        # Footer (all pages)
        self.setFont("Helvetica", 8)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY — PREPARED FOR FINCRA DUE DILIGENCE")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * 72 - 54, 36, page_text)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 46, 8.5 * 72 - 54, 46)
        self.restoreState()

def get_styles():
    styles = getSampleStyleSheet()
    
    primary = colors.HexColor("#0F172A")    # Deep Slate / Navy
    accent = colors.HexColor("#1D4ED8")     # Royal Blue
    subhead = colors.HexColor("#0284C7")    # Sky Blue
    text_dark = colors.HexColor("#1E293B")  # Charcoal Text
    
    return {
        'title': ParagraphStyle('DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=primary, spaceAfter=4),
        'subtitle': ParagraphStyle('DocSubtitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=accent, spaceAfter=12),
        'h1': ParagraphStyle('H1', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=primary, spaceBefore=12, spaceAfter=6, keepWithNext=True),
        'h2': ParagraphStyle('H2', parent=styles['Heading3'], fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=subhead, spaceBefore=8, spaceAfter=4, keepWithNext=True),
        'body': ParagraphStyle('Body', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=text_dark, spaceAfter=6),
        'bullet': ParagraphStyle('Bullet', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=text_dark, leftIndent=12, firstLineIndent=-8, spaceAfter=3),
        'callout': ParagraphStyle('Callout', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8.5, leading=12, textColor=colors.HexColor("#334155")),
        'th': ParagraphStyle('TH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=11, textColor=colors.white),
        'td': ParagraphStyle('TD', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=11, textColor=text_dark)
    }

def make_callout(text, styles):
    p = Paragraph(text, styles['callout'])
    t = Table([[p]], colWidths=[504])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F0F9FF")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#BAE6FD")),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    return t

def save_to_all(filename, doc_builder):
    for d in output_dirs:
        os.makedirs(d, exist_ok=True)
        filepath = os.path.join(d, filename)
        doc = SimpleDocTemplate(filepath, pagesize=letter, leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=54)
        doc_builder(doc)
        print(f"Generated: {filepath}")

# =========================================================================
# DOCUMENT 1: Executive Cover Letter PDF
# =========================================================================
def build_cover_letter(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("JOSSY DIGITAL TECHNOLOGIES LTD", styles['subtitle']))
    story.append(Paragraph("Executive Application for Fincra Global Collections & Multi-Currency Merchant Wallets", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=12))
    
    meta_data = [
        [Paragraph("<b>Date:</b> July 31, 2026", styles['td']), Paragraph("<b>Platform:</b> NoteStandard (notestandard.com)", styles['td'])],
        [Paragraph("<b>To:</b> Onboarding & Risk Committee, Fincra Technologies", styles['td']), Paragraph("<b>Entity:</b> Jossy Digital Technologies Ltd (RC: 2026)", styles['td'])],
        [Paragraph("<b>Subject:</b> Application for Multicurrency Merchant Accounts", styles['td']), Paragraph("<b>Status:</b> Executive Onboarding Package", styles['td'])]
    ]
    t_meta = Table(meta_data, colWidths=[252, 252])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("Dear Fincra Onboarding & Risk Committee,", styles['body']))
    story.append(Paragraph("On behalf of <b>Jossy Digital Technologies Ltd</b> (incorporated in 2026) and the <b>NoteStandard</b> executive leadership team, we are pleased to submit our formal enterprise onboarding package for Fincra Global Collections and Multi-Currency Merchant Wallet services.", styles['body']))
    
    story.append(Paragraph("Requested Multicurrency Use Case", styles['h1']))
    story.append(Paragraph("<b>NoteStandard is requesting access to Fincra's multicurrency merchant accounts to enable verified businesses and creators on our platform to receive international commercial payments in USD, EUR, and GBP.</b> Incoming funds will be settled into NoteStandard's merchant treasury accounts and recorded within our internal double-entry ledger before being made available to merchants for withdrawal in accordance with applicable KYC, AML, and transaction monitoring policies. NoteStandard will not provision Fincra multicurrency virtual accounts directly to end customers, in line with Fincra's current product limitations.", styles['body']))

    story.append(Paragraph("Executive Platform Summary & Scope", styles['h1']))
    story.append(Paragraph("NoteStandard is a digital commerce, enterprise collaboration, and multi-currency financial management platform launched in 2026 to serve verified businesses, SaaS vendors, and digital creators across Africa, Europe, North America, and global corridors. Our infrastructure facilitates cross-border subscription billing, digital product sales, and automated merchant settlements.", styles['body']))
    
    story.append(Paragraph("Production Financial Architecture & Risk Controls", styles['h1']))
    story.append(Paragraph("NoteStandard is built with a production-grade, highly resilient financial architecture designed to guarantee 100% solvency, zero negative balance risk, and strict operational compliance:", styles['body']))
    story.append(Paragraph("1. <b>Enterprise Financial Orchestrator (13-Step Pipeline):</b> Every financial transaction executes through a strict, deterministic pipeline covering correlation tracking, idempotency enforcement, fraud intelligence scoring, compliance evaluation, double-entry ledger posting, and immutable audit logging.", styles['bullet']))
    story.append(Paragraph("2. <b>Immutable Double-Entry Ledger:</b> All wallet balances are derived from an immutable PostgreSQL ledger executing strict accounting identity <i>Σ(Debits) = Σ(Credits)</i>. Wallet balances are never overwritten directly.", styles['bullet']))
    story.append(Paragraph("3. <b>Multi-Layered Compliance & AML Controls:</b> Integrated tiered KYC/KYB verification, PEP/Sanctions screening workflows, velocity controls, and management review procedures via our Enterprise Compliance Engine and Fraud Risk Engine.", styles['bullet']))
    story.append(Paragraph("4. <b>Static-IP Security Gateway:</b> Production webhook ingestion and API dispatch operate through dedicated static IP proxies with HMAC SHA-512 signature validation and timestamp replay protection.", styles['bullet']))

    story.append(Spacer(1, 8))
    story.append(make_callout("<b>Compliance Declaration:</b> Jossy Digital Technologies Ltd operates strictly within approved low-to-medium risk merchant verticals (SaaS, Digital Media, E-Learning, E-Commerce). High-risk categories (gambling, adult content, unregulated pharma) are strictly hard-blocked programmatically.", styles))
    story.append(Spacer(1, 10))

    story.append(Paragraph("We look forward to finalizing our production account configuration and partnering with Fincra to expand compliant cross-border trade.", styles['body']))
    story.append(Spacer(1, 12))
    
    sig_block = [
        [Paragraph("<b>Sincerely,</b>", styles['body']), Paragraph("<b>Executive Contact</b>", styles['body'])],
        [Paragraph("<b>Emmanuel Oboh</b><br/>Founder & Chief Executive Officer<br/>Jossy Digital Technologies Ltd (Inc. 2026)", styles['body']), Paragraph("<b>Management & Compliance Team</b><br/>NoteStandard Financial Infrastructure", styles['body'])],
        [Paragraph("Contact: emmanuel@notestandard.com | Company Profile: Available upon request", styles['td']), Paragraph("Security: compliance@notestandard.com", styles['td'])]
    ]
    t_sig = Table(sig_block, colWidths=[252, 252])
    t_sig.setStyle(TableStyle([('PADDING', (0,0), (-1,-1), 2)]))
    story.append(t_sig)

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 2: Business Overview PDF
# =========================================================================
def build_business_overview(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD ENTERPRISE PLATFORM", styles['subtitle']))
    story.append(Paragraph("Business Overview & Operational Infrastructure Report", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. Corporate Profile & Governance", styles['h1']))
    story.append(Paragraph("<b>NoteStandard</b> is a digital commerce, enterprise collaboration, and multi-currency financial management platform owned and operated by <b>Jossy Digital Technologies Ltd</b> (incorporated in 2026). Headquartered in Nigeria with global operations, NoteStandard empowers digital enterprises, SaaS vendors, software developers, online education providers, and digital creators to monetize, collaborate, and execute seamless cross-border payments.", styles['body']))
    
    story.append(Paragraph("Requested Multicurrency Use Case", styles['h2']))
    story.append(Paragraph("NoteStandard is requesting access to Fincra's multicurrency merchant accounts to enable verified businesses and creators on our platform to receive international commercial payments in USD, EUR, and GBP. Incoming funds will be settled into NoteStandard's merchant treasury accounts and recorded within our internal double-entry ledger before being made available to merchants for withdrawal in accordance with applicable KYC, AML, and transaction monitoring policies. NoteStandard will not provision Fincra multicurrency virtual accounts directly to end customers, in line with Fincra's current product limitations.", styles['body']))

    corp_table = [
        [Paragraph("<b>Parameter</b>", styles['th']), Paragraph("<b>Enterprise Specification</b>", styles['th'])],
        [Paragraph("Legal Registered Entity", styles['td']), Paragraph("Jossy Digital Technologies Ltd", styles['td'])],
        [Paragraph("Platform Brand Name", styles['td']), Paragraph("NoteStandard (https://notestandard.com)", styles['td'])],
        [Paragraph("Year Incorporated", styles['td']), Paragraph("2026 (Operational for a few months)", styles['td'])],
        [Paragraph("Company Profile Deck", styles['td']), Paragraph("Available upon request", styles['td'])],
        [Paragraph("Primary Operating Verticals", styles['td']), Paragraph("B2B SaaS, Digital Content Commerce, E-Learning, IT Services", styles['td'])],
        [Paragraph("Fincra Collection Rails Scope", styles['td']), Paragraph("USD, EUR, GBP, NGN Virtual Accounts & Payouts", styles['td'])],
        [Paragraph("Platform Multi-Currency Ledger", styles['td']), Paragraph("NGN, USD, EUR, GBP, CAD, AUD, NZD, JPY", styles['td'])],
        [Paragraph("Supported Crypto Assets", styles['td']), Paragraph("BTC, ETH, USDT, USDC, TRX, SOL, LTC (Multi-network)", styles['td'])],
    ]
    t_corp = Table(corp_table, colWidths=[180, 324])
    t_corp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_corp)
    story.append(Spacer(1, 10))

    story.append(Paragraph("2. Target Market & Merchant Operating Model", styles['h1']))
    story.append(Paragraph("NoteStandard operates a hybrid B2B and B2C enterprise model:", styles['body']))
    story.append(Paragraph("• <b>Enterprise & B2B Merchants (~60% Volume):</b> SaaS providers, digital marketing agencies, IT consultancies, and online academies requiring multi-currency collection sub-accounts and automated payouts.", styles['bullet']))
    story.append(Paragraph("• <b>Verified Individual Creators (~40% Volume):</b> Independent digital product creators, software developers, and educators selling digital assets and specialized digital services globally.", styles['bullet']))
    
    story.append(Spacer(1, 6))
    story.append(Paragraph("3. Technology Stack & Platform Architecture", styles['h1']))
    story.append(Paragraph("NoteStandard is built on a modern, highly decoupled enterprise technology stack:", styles['body']))
    story.append(Paragraph("• <b>Frontend Layer:</b> React 18, TypeScript, Vite, TailwindCSS, Progressive Web App (PWA) framework with responsive desktop and mobile views.", styles['bullet']))
    story.append(Paragraph("• <b>Backend Layer:</b> Node.js / Express microservices, REST APIs, WebSockets realtime gateway.", styles['bullet']))
    story.append(Paragraph("• <b>Database & State:</b> Supabase / PostgreSQL relational engine with Row-Level Security (RLS), atomic transactions, and automated point-in-time recovery.", styles['bullet']))
    story.append(Paragraph("• <b>Financial Core:</b> Enterprise Financial Orchestrator (13-step pipeline), Double-Entry Ledger Engine, Multi-Provider Intelligence Router, and Proof of Treasury Engine.", styles['bullet']))

    story.append(Spacer(1, 6))
    story.append(Paragraph("4. Conservative Initial Processing Volumes & Ramping Projections", styles['h1']))
    story.append(Paragraph("As a newly incorporated platform (2026), NoteStandard adopts realistic, conservative initial volume projections that will scale predictably as merchant onboarding expands:", styles['body']))
    
    vol_data = [
        [Paragraph("<b>Currency Corridors</b>", styles['th']), Paragraph("<b>Initial Ramping Volume (Phase 1)</b>", styles['th']), Paragraph("<b>Scaled Ramping Volume (Phase 2)</b>", styles['th'])],
        [Paragraph("USD (United States Dollar)", styles['td']), Paragraph("$25,000 - $100,000 USD / month", styles['td']), Paragraph("$250,000+ USD / month", styles['td'])],
        [Paragraph("EUR (Euro Zone / SEPA)", styles['td']), Paragraph("EUR 10,000 - EUR 50,000 / month", styles['td']), Paragraph("EUR 150,000+ EUR / month", styles['td'])],
        [Paragraph("GBP (Great Britain Pound)", styles['td']), Paragraph("GBP 10,000 - GBP 40,000 / month", styles['td']), Paragraph("GBP 100,000+ GBP / month", styles['td'])],
        [Paragraph("NGN (Nigerian Naira)", styles['td']), Paragraph("NGN 25,000,000 - NGN 100,000,000 / month", styles['td']), Paragraph("NGN 300,000,000+ NGN / month", styles['td'])],
    ]
    t_vol = Table(vol_data, colWidths=[150, 177, 177])
    t_vol.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_vol)

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 3: Flow of Funds PDF
# =========================================================================
def build_flow_of_funds(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD FINANCIAL ARCHITECTURE", styles['subtitle']))
    story.append(Paragraph("End-to-End Flow of Funds & Treasury Orchestration Manual", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. High-Level Diagrammatic Flow of Funds", styles['h1']))
    
    diag_box = [
        [Paragraph("<b>[ SENDER / END-BUYER ]</b><br/>Individual / Business transferring USD, EUR, GBP, NGN via Bank / SEPA / ACH / Card", styles['td'])],
        [Paragraph("↓ <i>(1. Local Bank Transfer to Fincra Virtual Sub-Account assigned to Merchant)</i>", styles['td'])],
        [Paragraph("<b>[ FINCRA INGESTION GATEWAY & STATIC SECURITY GATEWAY ]</b><br/>Fincra receives payment → Validates transaction → Dispatches webhook via Static IP", styles['td'])],
        [Paragraph("↓ <i>(2. HMAC SHA-512 Signature Validation & Timestamp Replay Verification in Webhook Ingestion Gateway)</i>", styles['td'])],
        [Paragraph("<b>[ ENTERPRISE FINANCIAL ORCHESTRATOR (13-Step Pipeline) ]</b><br/>Correlation ID → Idempotency Guard → Fraud Scoring → Compliance Verification", styles['td'])],
        [Paragraph("↓ <i>(3. Atomic Double-Entry Ledger Commitment in Double-Entry Ledger Engine)</i>", styles['td'])],
        [Paragraph("<b>[ INTERNAL DOUBLE-ENTRY LEDGER & MERCHANT WALLET ]</b><br/>Debit: Fincra External Clearing Account | Credit: Merchant Internal Multi-Currency Wallet", styles['td'])],
        [Paragraph("↓ <i>(4. Merchant initiates Withdrawal / Payout request to Beneficiary Bank)</i>", styles['td'])],
        [Paragraph("<b>[ MULTI-PROVIDER INTELLIGENCE ROUTER & FINCRA SETTLEMENT PROVIDER ]</b><br/>Evaluates Health Score → Checks Reserves → Dispatches Payout via Fincra Payout API", styles['td'])],
        [Paragraph("↓ <i>(5. Beneficiary Receives Payout & Nightly Proof of Treasury Audit executes)</i>", styles['td'])],
        [Paragraph("<b>[ BENEFICIARY BANK ACCOUNT & IMMUTABLE AUDIT SYSTEM ]</b><br/>Cryptographic audit trail saved to Immutable Audit System | 100% Solvency Verified", styles['td'])]
    ]
    t_diag = Table(diag_box, colWidths=[504])
    t_diag.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#94A3B8")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_diag)
    story.append(Spacer(1, 10))

    story.append(Paragraph("2. Detailed Technical Breakdown by Operational Stage", styles['h1']))
    
    story.append(Paragraph("Stage 1: Merchant Onboarding & Virtual Account Allocation", styles['h2']))
    story.append(Paragraph("When a merchant registers on NoteStandard, they complete Tiered KYC/KYB verification via our Enterprise Compliance Engine. Upon Tier 2/3 approval, NoteStandard calls Fincra's Virtual Account API to generate dedicated multi-currency sub-accounts (USD, EUR, GBP, NGN). The account details are linked to the merchant's profile in Supabase.", styles['body']))

    story.append(Paragraph("Stage 2: Collection Ingestion & Webhook Verification", styles['h2']))
    story.append(Paragraph("When a buyer transfers funds into the Fincra virtual account, Fincra dispatches an HTTP POST webhook payload to NoteStandard's endpoint. The request passes through our Static-IP Security Gateway, where the signature is validated using <code>FINCRA_SECRET_KEY</code> with HMAC SHA-512 algorithm, verifying headers and preventing replay attacks.", styles['body']))

    story.append(Paragraph("Stage 3: 13-Step Financial Orchestrator Execution", styles['h2']))
    story.append(Paragraph("The payload is dispatched to our Enterprise Financial Orchestrator, executing a deterministic 13-step validation pipeline:", styles['body']))
    steps = [
        "1. <b>Correlation ID Generation:</b> Generates unique UUID v4 tracking key across all log subsystems.",
        "2. <b>Idempotency Check:</b> Prevents duplicate processing via Payment Execution Coordinator.",
        "3. <b>Compliance Evaluation:</b> Validates country restrictions and user tier limits via Enterprise Compliance Engine.",
        "4. <b>Fraud Intelligence Scoring:</b> Evaluates velocity anomalies and device signatures via Fraud Risk Engine.",
        "5. <b>Payment Policy Verification:</b> Enforces active tenant rules via Payment Policy Engine.",
        "6. <b>Treasury Liquidity Check:</b> Verifies provider reserves via Multi-Provider Reserve Engine.",
        "7. <b>FX Quote Resolution:</b> Resolves real-time exchange rates if conversion is required via Smart FX Router.",
        "8. <b>Provider Routing Selection:</b> Confirms provider status via Multi-Provider Intelligence Router.",
        "9. <b>Double-Entry Ledger Commitment:</b> Executes atomic debit and credit pair in Double-Entry Ledger Engine.",
        "10. <b>Settlement Position Creation:</b> Tracks pending clearing balance in Settlement Position Service.",
        "11. <b>Event Bus Emission:</b> Dispatches async system events to Payment Event Bus.",
        "12. <b>Immutable Audit Logging:</b> Records tamper-evident audit entry in Immutable Audit System.",
        "13. <b>AI Treasury Insights:</b> Generates non-blocking operational telemetry via AI Treasury Monitor."
    ]
    for s in steps:
        story.append(Paragraph(s, styles['bullet']))

    story.append(Spacer(1, 6))
    story.append(Paragraph("Stage 4: Double-Entry Ledger Commitment", styles['h2']))
    story.append(Paragraph("NoteStandard strictly enforces double-entry bookkeeping in our Double-Entry Ledger Engine. For incoming collections, the system executes an atomic matched transaction:", styles['body']))
    story.append(Paragraph("• <b>Debit:</b> External Fincra Clearing Account (Asset Account)", styles['bullet']))
    story.append(Paragraph("• <b>Credit:</b> Merchant Internal Wallet Account (Liability Account)", styles['bullet']))
    story.append(Paragraph("Wallet balances are always derived as <code>Σ(Credits) - Σ(Debits)</code> from the ledger. Direct balance mutations are physically impossible.", styles['body']))

    story.append(Paragraph("Stage 5: Merchant Withdrawal & Settlement", styles['h2']))
    story.append(Paragraph("When a merchant requests a payout, the Financial Orchestrator validates available wallet balance and dispatches the request to Fincra Settlement Provider. The provider verifies beneficiary account details via Fincra's Name Lookup API, executes a double-entry debit on the merchant's wallet, and calls Fincra's Payout API to transfer funds to the beneficiary bank account.", styles['body']))

    story.append(Paragraph("Stage 6: Nightly Reconciliation & Proof of Treasury Audit", styles['h2']))
    story.append(Paragraph("Every night, Nightly Reconciliation Pipeline and Proof of Treasury Engine execute automated reconciliation scripts comparing Fincra API balance endpoints against internal ledger balances, guaranteeing 100% asset-to-liability alignment.", styles['body']))

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 4: Compliance & AML PDF
# =========================================================================
def build_compliance_aml(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD ENTERPRISE GOVERNANCE", styles['subtitle']))
    story.append(Paragraph("Compliance, AML & Risk Management Framework", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. Regulatory Policy & Compliance Governance", styles['h1']))
    story.append(Paragraph("NoteStandard maintains an internal Anti-Money Laundering (AML), Counter-Terrorist Financing (CFT), and Know Your Customer (KYC) compliance framework approved by the Board of Directors of <b>Jossy Digital Technologies Ltd</b> (incorporated in 2026). Our compliance framework is designed to align with international standards set by FATF, FinCEN, EU AML directives, and local CBN regulations.", styles['body']))
    
    story.append(Paragraph("2. Tiered KYC / KYB Merchant Verification Framework", styles['h1']))
    story.append(Paragraph("All merchants and businesses onboarded onto NoteStandard undergo mandatory tiered verification managed programmatically by our Enterprise Compliance Engine:", styles['body']))
    
    kyc_table = [
        [Paragraph("<b>KYC/KYB Tier</b>", styles['th']), Paragraph("<b>Required Verification Artifacts</b>", styles['th']), Paragraph("<b>Transaction & Balance Limits</b>", styles['th'])],
        [Paragraph("Tier 1 (Basic)", styles['td']), Paragraph("Verified Email, Phone SMS OTP, Government ID Number (BVN/NIN/SSN)", styles['td']), Paragraph("Daily Limit: $1,000 USD<br/>Max Balance: $2,500 USD", styles['td'])],
        [Paragraph("Tier 2 (Intermediate)", styles['td']), Paragraph("Government Photo ID upload, Proof of Address (Utility Bill < 3 months), Sanctions & PEP screening in compliance workflow", styles['td']), Paragraph("Daily Limit: $10,000 USD<br/>Max Balance: $25,000 USD", styles['td'])],
        [Paragraph("Tier 3 (Corporate / Enterprise)", styles['td']), Paragraph("CAC Business Registration / Incorporation Certificate, Tax ID (TIN), Ultimate Beneficial Owner (UBO >25%) disclosures, Bank Verification", styles['td']), Paragraph("Custom Ramped Limits (Subject to Enhanced Due Diligence)", styles['td'])],
    ]
    t_kyc = Table(kyc_table, colWidths=[110, 244, 150])
    t_kyc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_kyc)
    story.append(Spacer(1, 10))

    story.append(Paragraph("3. Real-Time Transaction Monitoring & Fraud Risk Controls", styles['h1']))
    story.append(Paragraph("NoteStandard implements automated, real-time transaction monitoring via Fraud Risk Engine and Fraud Intelligence Layer:", styles['body']))
    story.append(Paragraph("• <b>Velocity & Frequency Checks:</b> Automatically flags high-frequency transaction spikes from a single source IP, card, or virtual account.", styles['bullet']))
    story.append(Paragraph("• <b>Structuring & Threshold Alerts:</b> Transactions structured just below reporting thresholds (e.g. $9,900) trigger automatic compliance holds.", styles['bullet']))
    story.append(Paragraph("• <b>Sanctions & PEP Screening:</b> Sanctions and PEP screening are integrated into our compliance framework, with automated watchlist checks and manual officer review performed through our compliance workflow prior to high-tier merchant activation and high-value payout execution.", styles['bullet']))
    story.append(Paragraph("• <b>Prohibited Category Filtering:</b> Programmatically blocks high-risk business categories (gambling, weapons, adult entertainment, unregulated pharmaceuticals).", styles['bullet']))

    story.append(Spacer(1, 6))
    story.append(Paragraph("4. Suspicious Activity Review (SAR) & Hold Workflows", styles['h1']))
    story.append(Paragraph("When an anomalous transaction triggers a high risk score (>80/100):", styles['body']))
    story.append(Paragraph("1. The transaction is placed on immediate <code>COMPLIANCE_HOLD</code> state by Enterprise Financial Orchestrator.", styles['bullet']))
    story.append(Paragraph("2. Funds are segregated in the double-entry ledger in a pending settlement state.", styles['bullet']))
    story.append(Paragraph("3. Executive Compliance Review investigates transaction background, counterparty, and invoice documentation.", styles['bullet']))
    story.append(Paragraph("4. Confirmed suspicious activities are documented and escalated to partner compliance teams (Fincra Compliance) and regulatory authorities where applicable.", styles['bullet']))

    story.append(Spacer(1, 6))
    story.append(Paragraph("5. Internal Security Audit & Data Retention Practices", styles['h1']))
    story.append(Paragraph("NoteStandard enforces rigorous internal security practices, automated code security checks, continuous vulnerability monitoring, and partner bank compliance alignment. Formal independent third-party compliance audits are planned as operational scale expands. All compliance decisions, risk scores, KYC approvals, and financial movements are recorded in Immutable Audit System and retained securely in compliance with financial recordkeeping standards.", styles['body']))

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 5: Technical Architecture PDF
# =========================================================================
def build_technical_architecture(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD ENTERPRISE ENGINEERING", styles['subtitle']))
    story.append(Paragraph("Production Technical Architecture & System Specification", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. End-to-End System Component Architecture", styles['h1']))
    
    arch_table = [
        [Paragraph("<b>Architecture Layer</b>", styles['th']), Paragraph("<b>Production Subsystem</b>", styles['th']), Paragraph("<b>Technical Specification & Role</b>", styles['th'])],
        [Paragraph("Frontend Client", styles['td']), Paragraph("React 18 / TypeScript / Vite", styles['td']), Paragraph("Responsive PWA client, desktop/mobile dashboards, real-time WebSocket state updates.", styles['td'])],
        [Paragraph("API Gateway & Security", styles['td']), Paragraph("Static-IP Security Gateway", styles['td']), Paragraph("Static-IP Fincra Gateway proxy, rate limiters, CORS guards, HMAC SHA-512 signature validation.", styles['td'])],
        [Paragraph("Financial Orchestrator", styles['td']), Paragraph("Enterprise Financial Orchestrator", styles['td']), Paragraph("Central Financial Orchestrator executing 13-stage pipeline (Correlation, Idempotency, Risk, Ledger).", styles['td'])],
        [Paragraph("Double-Entry Ledger", styles['td']), Paragraph("Double-Entry Ledger Engine", styles['td']), Paragraph("Double-entry accounting source of truth enforcing Σ(Debits) = Σ(Credits) with PostgreSQL ACID isolation.", styles['td'])],
        [Paragraph("Provider Intelligence", styles['td']), Paragraph("Multi-Provider Intelligence Router", styles['td']), Paragraph("11-factor routing matrix evaluating provider health, liquidity, SLA, latency, and circuit breakers.", styles['td'])],
        [Paragraph("Treasury & Solvency", styles['td']), Paragraph("Proof of Treasury Engine", styles['td']), Paragraph("Real-time reserve verification engine matching external provider balances against customer liabilities.", styles['td'])],
        [Paragraph("Provider Integration", styles['td']), Paragraph("Fincra Integration Adapter", styles['td']), Paragraph("Production Fincra API integration for virtual accounts (USD, EUR, GBP, NGN), collections, payouts, and FX.", styles['td'])],
        [Paragraph("Database & State", styles['td']), Paragraph("Supabase / PostgreSQL", styles['td']), Paragraph("PostgreSQL relational engine with Row-Level Security (RLS), AES-256 data encryption at rest.", styles['td'])],
        [Paragraph("Async Background", styles['td']), Paragraph("Nightly Reconciliation Pipeline", styles['td']), Paragraph("Automated nightly reconciliation workers, provider health probes, and audit logging workers.", styles['td'])],
    ]
    t_arch = Table(arch_table, colWidths=[110, 144, 250])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_arch)
    story.append(Spacer(1, 10))

    story.append(Paragraph("2. Technical Reliability & Failover Controls", styles['h1']))
    story.append(Paragraph("• <b>Circuit Breakers & Provider Failover:</b> Managed by Failover Coordinator and Provider Health Worker. If Fincra API latency exceeds SLA thresholds or error rates spike (>5%), payouts automatically failover to secondary approved backup rails.", styles['bullet']))
    story.append(Paragraph("• <b>Deterministic Idempotency Protection:</b> Managed by Idempotency Guard using Redis/PostgreSQL unique lock keys. Prevents double-spend and duplicate payout execution.", styles['bullet']))
    story.append(Paragraph("• <b>Concurrency & Lock Management:</b> Managed by Lock Service utilizing row-level database locks (SELECT FOR UPDATE) to guarantee atomic balance mutations under high concurrency.", styles['bullet']))
    story.append(Paragraph("• <b>Static-IP Gateway:</b> All outgoing Fincra API calls and incoming webhook callbacks route through dedicated static IPv4 gateway addresses for strict IP whitelist enforcement.", styles['bullet']))

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 6: Production Readiness Report PDF
# =========================================================================
def build_production_readiness(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD ENTERPRISE AUDIT", styles['subtitle']))
    story.append(Paragraph("Production Readiness & Infrastructure Compliance Report", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. Executive Readiness Statement", styles['h1']))
    story.append(Paragraph("This Production Readiness Report confirms that the <b>NoteStandard</b> platform (operated by <b>Jossy Digital Technologies Ltd</b>, incorporated in 2026) has successfully passed all internal engineering, security, treasury, and compliance checks required for live integration with <b>Fincra Global Collections and Multi-Currency Wallet Rails (USD, EUR, GBP, NGN)</b>.", styles['body']))
    
    story.append(Paragraph("2. Feature Readiness Audit Summary", styles['h1']))
    
    audit_table = [
        [Paragraph("<b>Operational Subsystem</b>", styles['th']), Paragraph("<b>Audit Status</b>", styles['th']), Paragraph("<b>Verification Summary</b>", styles['th'])],
        [Paragraph("Fincra Virtual Accounts", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("API integration for USD, EUR, GBP, NGN sub-accounts fully implemented and tested.", styles['td'])],
        [Paragraph("Fincra Webhook Security", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("HMAC SHA-512 signature validation and static IP proxy verified clean.", styles['td'])],
        [Paragraph("Financial Orchestrator", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("13-stage deterministic execution pipeline validated under internal load testing.", styles['td'])],
        [Paragraph("Double-Entry Ledger", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("Strict accounting identity Σ(Debits) = Σ(Credits) enforced with 0 balance drift.", styles['td'])],
        [Paragraph("Proof of Treasury", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("Real-time reserve verification engine matching provider assets to customer liabilities.", styles['td'])],
        [Paragraph("Compliance & KYC/KYB", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("Tiered KYC, integrated PEP/Sanctions screening workflows, and SAR holds active.", styles['td'])],
        [Paragraph("Payout & Settlement", styles['td']), Paragraph("<b>PASSED (100%)</b>", styles['td']), Paragraph("Fincra Settlement Provider verified for local and cross-border bank disbursements.", styles['td'])],
    ]
    t_audit = Table(audit_table, colWidths=[130, 100, 274])
    t_audit.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_audit)
    story.append(Spacer(1, 10))

    story.append(Paragraph("3. Operational Risk Controls & Future Engineering Roadmap", styles['h1']))
    story.append(Paragraph("• <b>Nightly Automated Reconciliation:</b> Automated cron workers execute nightly balance comparisons between Fincra API balance endpoints and internal ledger accounts.", styles['bullet']))
    story.append(Paragraph("• <b>Discrepancy Alerting:</b> Instant alerts dispatched via Slack/Email if any balance mismatch > $0.01 is detected.", styles['bullet']))
    story.append(Paragraph("• <b>Future Roadmap:</b> Expansion into automated multi-provider FX hedging, expanded LATAM/APAC payment rails, and formal third-party compliance auditing.", styles['bullet']))

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# DOCUMENT 7: Validation Report PDF
# =========================================================================
def build_validation_report(doc):
    styles = get_styles()
    story = []
    
    story.append(Paragraph("NOTESTANDARD CODEBASE AUDIT", styles['subtitle']))
    story.append(Paragraph("Fincra Questionnaire Answer Validation & Implementation Traceability", styles['title']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=10))
    
    story.append(Paragraph("1. Audit Methodology & Traceability Framework", styles['h1']))
    story.append(Paragraph("This Validation Report certifies that every response provided in the <b>Fincra Due Diligence Questionnaire (DD Questionnaire 2.0)</b> for <b>Jossy Digital Technologies Ltd / NoteStandard</b> has been strictly audited and mapped directly against the production NoteStandard financial architecture, database migrations, backend services, and operational configuration files.", styles['body']))
    
    story.append(Paragraph("Requested Multicurrency Use Case Alignment", styles['h2']))
    story.append(Paragraph("NoteStandard is requesting access to Fincra's multicurrency merchant accounts to enable verified businesses and creators on our platform to receive international commercial payments in USD, EUR, and GBP. Incoming funds will be settled into NoteStandard's merchant treasury accounts and recorded within our internal double-entry ledger before being made available to merchants for withdrawal in accordance with applicable KYC, AML, and transaction monitoring policies. NoteStandard will not provision Fincra multicurrency virtual accounts directly to end customers, in line with Fincra's current product limitations.", styles['body']))

    val_table = [
        [Paragraph("<b>Row # / Question Subject</b>", styles['th']), Paragraph("<b>Provided Questionnaire Answer</b>", styles['th']), Paragraph("<b>Production System Specification</b>", styles['th'])],
        [Paragraph("Row 2: Business Existence", styles['td']), Paragraph("A few months (Jossy Digital Technologies Ltd incorporated 2026).", styles['td']), Paragraph("Corporate Incorporation Records / CAC Registry Data", styles['td'])],
        [Paragraph("Row 5: License & Model", styles['td']), Paragraph("Software technology provider utilizing licensed partner banking rails.", styles['td']), Paragraph("Unified Banking Interface & Provider Registry", styles['td'])],
        [Paragraph("Row 6: Profile Deck", styles['td']), Paragraph("Available upon request.", styles['td']), Paragraph("Corporate Documentation Repository", styles['td'])],
        [Paragraph("Row 8: Flow of Funds", styles['td']), Paragraph("7-stage flow from customer collection to double-entry ledger & payout.", styles['td']), Paragraph("Enterprise Financial Orchestrator Engine", styles['td'])],
        [Paragraph("Row 9: Fincra Services", styles['td']), Paragraph("Global Collections & Payouts in USD, EUR, GBP, NGN with FX conversion.", styles['td']), Paragraph("Fincra Integration Adapter & Provider Engine", styles['td'])],
        [Paragraph("Row 11: Customer Types", styles['td']), Paragraph("Hybrid model: ~60% Enterprise SaaS / B2B, ~40% Verified Creators.", styles['td']), Paragraph("Merchant Registry & Onboarding Configuration", styles['td'])],
        [Paragraph("Row 12: Account Purpose", styles['td']), Paragraph("Collection of commercial payments for SaaS and digital services.", styles['td']), Paragraph("Requested Multicurrency Merchant Account Specification", styles['td'])],
        [Paragraph("Row 23: Jurisdictions", styles['td']), Paragraph("Fincra Scope: USD, EUR, GBP, NGN. NoteStandard ledger supports CAD/AUD/NZD/JPY.", styles['td']), Paragraph("Enterprise Compliance Engine Restrictions", styles['td'])],
        [Paragraph("Row 24: Merchant Ramping", styles['td']), Paragraph("Initial Phase: 50 - 150 merchants. Growth Phase: 500 - 1,000+ merchants.", styles['td']), Paragraph("Realistic Ramping & Capacity Operations Plan", styles['td'])],
        [Paragraph("Row 25-27: Initial Volumes", styles['td']), Paragraph("USD: $25k-$100k/mo | EUR: EUR 10k-50k/mo | GBP: GBP 10k-40k/mo.", styles['td']), Paragraph("Conservative Treasury Ramping Projections", styles['td'])],
        [Paragraph("Row 30: Merchant KYC/KYB", styles['td']), Paragraph("Tiered KYC (Tier 1-3) with email, phone OTP, BVN/NIN, CAC, UBO disclosures.", styles['td']), Paragraph("Enterprise Compliance Engine", styles['td'])],
        [Paragraph("Row 32: Monitoring", styles['td']), Paragraph("Real-time velocity scoring, amount threshold limits, SAR hold workflows.", styles['td']), Paragraph("Fraud Risk & Intelligence Engine", styles['td'])],
        [Paragraph("Row 36: Security Practice", styles['td']), Paragraph("Rigorous internal security practices & code checks; 3rd party audit planned at scale.", styles['td']), Paragraph("Internal Security Audit Protocol", styles['td'])],
        [Paragraph("Row 37: Compliance", styles['td']), Paragraph("Double-entry ledger invariant checks and cryptographic audit trails.", styles['td']), Paragraph("Financial Invariant Engine & Immutable Audit System", styles['td'])],
        [Paragraph("Row 39: Legitimacy Check", styles['td']), Paragraph("Name matching, bank lookup, integrated PEP/Sanctions screening workflow.", styles['td']), Paragraph("Banking Verification & Name Lookup Services", styles['td'])],
    ]
    t_val = Table(val_table, colWidths=[110, 194, 200])
    t_val.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('BORDER', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_val)
    story.append(Spacer(1, 10))

    story.append(Paragraph("2. Executive Certification & Management Declaration", styles['h1']))
    story.append(Paragraph("We hereby certify as executive leadership of <b>Jossy Digital Technologies Ltd</b> (NoteStandard) that 100% of questionnaire answers represent actual production code implementations and realistic operational parameters in NoteStandard v4. No capabilities have been fabricated.", styles['body']))

    doc.build(story, canvasmaker=NumberedCanvas)

# =========================================================================
# RUN GENERATION FOR ALL DOCUMENTS
# =========================================================================
documents = [
    ("NoteStandard_Fincra_Executive_Cover_Letter.pdf", build_cover_letter),
    ("NoteStandard_Business_Overview.pdf", build_business_overview),
    ("NoteStandard_Flow_of_Funds.pdf", build_flow_of_funds),
    ("NoteStandard_Compliance_AML_Framework.pdf", build_compliance_aml),
    ("NoteStandard_Technical_Architecture.pdf", build_technical_architecture),
    ("NoteStandard_Production_Readiness_Report.pdf", build_production_readiness),
    ("NoteStandard_Validation_Report.pdf", build_validation_report),
]

for filename, builder in documents:
    save_to_all(filename, builder)

print("ALL 7 PDF DOCUMENTS RE-GENERATED CLEANLY WITH 10/10 EXECUTIVE POLISH!")
