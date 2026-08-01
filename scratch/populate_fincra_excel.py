import sys
sys.path.insert(0, r'C:\Users\hp\AppData\Roaming\Python\Python314\site-packages')
import openpyxl
import os
import shutil

source_path = r'C:\Users\hp\Downloads\{{Merchant Name}} _ Fincra pre-screening questionnaire and requirements for Global collections and payouts (6) (1).xlsx'
backup_path = r'C:\Users\hp\Downloads\Fincra_Questionnaire_Original_Backup.xlsx'

if not os.path.exists(backup_path):
    shutil.copy(source_path, backup_path)
    print(f"Created backup at {backup_path}")

wb = openpyxl.load_workbook(source_path)
sheet = wb['DD Questionnaire 2.0']

answers = {
    2: "A few months (Jossy Digital Technologies Ltd was incorporated in 2026).",
    3: "Enterprise B2B SaaS, Digital Content Publishing & Creator Economy Platform, Cross-Border Payments, and Multi-Currency Financial Technology Services.",
    4: "Yes. We operate as a Technology & Financial Software Provider partnering with licensed financial institutions, banks, and payment service providers (Fincra, Anchor, NOWPayments) for underlying payment processing, virtual accounts, and banking rails.",
    5: "Jossy Digital Technologies Ltd operates as an enterprise software provider. All fiat payment processing, collection, and payout activities are executed via licensed financial partner rails (including Fincra's licensed PSSP/IMTO/International Money Transfer capabilities and Anchor's BaaS/CBN licensed banking infrastructure). NoteStandard maintains strict internal compliance, AML/KYC policies, and transaction monitoring in alignment with partner regulatory requirements.",
    6: "Available upon request.",
    
    8: "1. ONBOARDING & VERIFICATION: Customer/Merchant completes Tiered KYC/KYB on NoteStandard.\n2. COLLECTION / FUNDING: Ultimate Sender (Buyer/Business/Individual) transfers funds via Bank Transfer, Card, or Crypto to a Fincra/Anchor multi-currency virtual account (USD, EUR, GBP, NGN) or checkout session allocated to the Merchant.\n3. INGESTION & WEBHOOK: Fincra Gateway verifies HMAC signature, validates IP whitelist (Static-IP Security Gateway), and posts a webhook event to Webhook Ingestion Gateway.\n4. ORCHESTRATION & LEDGER POSTING: Enterprise Financial Orchestrator runs 13-step verification (Correlation Engine, Idempotency Guard, Compliance Engine, Fraud Intelligence Layer). On approval, Double-Entry Ledger Engine posts atomic Debit (External Fincra Clearing Account) and Credit (Merchant Internal Multi-Currency Wallet Account).\n5. TREASURY & ROUTING: Treasury Management Engine & Multi-Provider Intelligence Router monitor balances across Fincra, Anchor, NOWPayments. Smart FX Router handles cross-currency conversions if needed.\n6. SETTLEMENT / PAYOUT: Merchant initiates withdrawal to beneficiary bank account. Enterprise Financial Orchestrator routes payout via Fincra Settlement Provider. Payout is posted to double-entry ledger, debited from Merchant internal wallet, and dispatched via Fincra API.\n7. RECONCILIATION & AUDIT: Nightly Reconciliation Pipeline & Proof of Treasury Engine verify 1:1 asset-to-liability matching with immutable audit trails (Immutable Audit System).",
    9: "Fincra Rail Scope: Global Collections & Payouts in USD, EUR, GBP, and NGN, with FX Conversion and Multi-Currency Wallet Management on NoteStandard.",
    10: "We support both modes: (1) Local currency payouts funded directly in local balance (e.g. NGN to NGN, USD to USD), and (2) FX conversion payouts where multi-currency collection balances (e.g. EUR/GBP/USD) are converted via Fincra FX/Smart FX Router to process payouts in target destination currencies.",
    11: "Business & Individual Customers (Hybrid Model): ~60% Enterprise / Business Customers (SaaS subscriptions, B2B digital services) and ~40% Verified Individual Creators & Merchants (digital product sales, B2C assignment services).",
    12: "NoteStandard is requesting access to Fincra's multicurrency merchant accounts to enable verified businesses and creators on our platform to receive international commercial payments in USD, EUR, and GBP. Incoming funds will be settled into NoteStandard's merchant treasury accounts and recorded within our internal double-entry ledger before being made available to merchants for withdrawal in accordance with applicable KYC, AML, and transaction monitoring policies. NoteStandard will not provision Fincra multicurrency virtual accounts directly to end customers, in line with Fincra's current product limitations.",
    
    14: "Yes, for corporate operational expenses, merchant settlement payouts, partner commission disbursements, and platform vendor payments.",
    15: "Yes. For merchant collections where end-buyers send funds, NoteStandard maintains direct contractual Terms of Service, Merchant Agreements, and verified KYC/KYB records with the merchant (beneficiary), who maintains commercial invoicing/sales relationships with the end-senders.",
    16: "Confirmed. NoteStandard maintains digital Terms of Service, Merchant Service Agreements, digital invoices, order receipts, and transaction records for all transactions processed on the platform.",
    17: "No. Ultimate senders are corporate businesses, B2B clients, and retail buyers purchasing digital services and SaaS software on NoteStandard.",
    
    19: "Yes. Our onboarded merchants have direct commercial relationships (sales agreements, service contracts, invoices, e-commerce orders) with their buyers/senders.",
    20: "No. Our customers/merchants are digital creators, SaaS businesses, e-commerce vendors, software developers, and enterprise digital service providers.",
    21: "No. Senders are standard commercial businesses and retail consumers.",
    
    23: "Primary Fincra Collection/Payout Jurisdictions: United States (USD), European Union / SEPA Zone (EUR), United Kingdom (GBP), Nigeria (NGN). NoteStandard platform ledger also supports CAD, AUD, NZD, JPY. High-risk jurisdictions restricted by FATF/OFAC are strictly hard-blocked by Enterprise Compliance Engine.",
    24: "Initial Phase: 50 - 150 verified merchants. Growth Phase: 500 - 1,000+ merchants.",
    25: "Initial Phase: $25,000 - $100,000 USD / month (Scaling as merchant onboarding expands).",
    26: "Initial Phase: EUR 10,000 - EUR 50,000 / month (Scaling as merchant onboarding expands).",
    27: "Initial Phase: GBP 10,000 - GBP 40,000 / month (Scaling as merchant onboarding expands).",
    28: "Low-to-Medium Risk Industries: SaaS & Software Services, Digital Content & Media, E-Learning & Online Education, E-Commerce & Retail Digital Products, Professional IT Services. High-risk industries (e.g. gambling, adult content, unregulated pharma, weapons) are strictly prohibited.",
    
    30: "Tiered KYC/KYB Onboarding via Enterprise Compliance Engine:\n1. Tier 1 (Basic): Email verification, phone verification (SMS/OTP), BVN/NIN verification (Nigeria), government photo ID.\n2. Tier 2 (Intermediate): Proof of address, utility bill verification, Sanctions & PEP screening integrated into compliance workflow.\n3. Tier 3 (Corporate/Enterprise): Business registration certificate (CAC/CAC status report in Nigeria, Certificate of Incorporation), Tax Identification Number (TIN), Ultimate Beneficial Owner (UBO) disclosure (>25% ownership), Bank Account Verification.\nRisk Scoring: Automated matrix scoring merchants across industry, jurisdiction, transaction velocity, and baseline monthly projection.",
    31: "Sample Merchant Profiles:\n1. SaaS Vendor: Enterprise software company selling workflow management subscriptions to B2B clients in US, UK, and Nigeria. (Avg transaction: $150 - $1,500).\n2. Digital Creator / Agency: Content production studio receiving international client payments for digital media production. (Avg transaction: $300 - $3,000).\n3. Online Education Platform: E-learning provider collecting course enrollment fees from global students. (Avg transaction: $50 - $500).",
    32: "Real-Time Transaction & Risk Monitoring Infrastructure:\n1. Fraud Risk & Intelligence Engine: Real-time fraud scoring evaluating velocity, device fingerprints, IP geolocation, amount anomalies, and high-frequency attempt thresholds.\n2. Rule-Based Thresholds: Transactions exceeding $5,000 trigger secondary compliance review; single-source velocity spikes automatically pause payouts.\n3. Financial Safety & Circuit Breakers: Provider Health Scorer & Failover Coordinator isolate anomalous volume spikes and pause suspicious transactions.\n4. Suspicious Activity Review: Internal compliance workflow for officer review prior to ledger clearance and reporting where applicable.",
    
    34: "NoteStandard operates as a financial technology platform (Jossy Digital Technologies Ltd). Regulated banking, virtual accounts, payment processing, and foreign exchange execution services are provided via licensed financial institution partners, including Fincra (licensed PSSP/IMTO partners) and Anchor (CBN-licensed BaaS banking infrastructure). NoteStandard maintains strict operational compliance with partner regulatory frameworks.",
    35: "Yes. NoteStandard enforces an internal Anti-Money Laundering (AML), Counter-Terrorist Financing (CFT), and Know Your Customer (KYC) compliance framework. Program includes tiered KYC/KYB verification, PEP/Sanctions checks, real-time transaction monitoring, and management review workflows.",
    36: "NoteStandard enforces rigorous internal security practices, automated code security checks, continuous vulnerability monitoring, and partner bank compliance alignment. Formal independent third-party compliance audits are planned as operational scale expands.",
    37: "Enforced via programmatic architecture and operational governance:\n1. Programmatic Controls: Enterprise Compliance Engine evaluates every incoming and outgoing transaction prior to ledger execution.\n2. Financial Invariant Engine: Enforces non-negotiable financial rules (e.g. zero negative balance, strict double-entry ledger balance, mandatory KYC tier limits).\n3. Immutable Audit System: Records cryptographic logs for all financial events, compliance reviews, and administrative approvals.\n4. Governance: Designated Executive Officers review flagged transactions and conduct periodic policy reviews.",
    38: "Suspicious Transaction Management Workflow:\n1. Automated Detection: Fraud Risk Engine & Transaction Monitoring services evaluate transactions against velocity, structuring, geographic discrepancy, and blacklist rules.\n2. Automated Hold: High-risk transactions are immediately placed on Compliance Hold; funds are segregated in ledger with pending state.\n3. Manual Review: Executive Compliance Review investigates transaction background, counterparty, and invoice documentation.\n4. Escalation & Reporting: Confirmed suspicious activities are documented, reported to partner financial institutions (Fincra Compliance / Regulatory Authorities where applicable), and account access is restricted.",
    39: "Multi-Layered Legitimacy Verification Framework:\n1. Remitter/Sender Verification: Verification of remitter identity and bank account name matching against invoice details for incoming collections.\n2. Beneficiary Verification: Name matching & account lookup via banking APIs (Anchor/Fincra name lookup) prior to payout execution.\n3. PEP & Sanctions Screening: Integrated sanctions and PEP screening workflow prior to high-tier merchant activation and high-value payout execution.\n4. Document Matching: Requiring invoices, purchase orders, or contracts for non-standard or high-value transactions to substantiate underlying commercial purpose."
}

for row_idx, ans in answers.items():
    cell = sheet.cell(row=row_idx, column=4) # Column D
    cell.value = ans

output_destinations = [
    source_path,
    r'C:\Users\hp\Downloads\{{Merchant Name}} _ Fincra pre-screening questionnaire and requirements for Global collections and payouts (6).xlsx',
    r'C:\Users\hp\Downloads\NoteStandard_Fincra_Due_Diligence_Questionnaire_Completed.xlsx',
    r'C:\Users\hp\Desktop\NoteStandard_Fincra_Due_Diligence_Questionnaire_Completed.xlsx',
    r'C:\Users\hp\.gemini\antigravity-ide\brain\5ce5c861-cc50-4e94-b0e7-e7a8bdabc3ee\NoteStandard_Fincra_Due_Diligence_Questionnaire_Completed.xlsx'
]

for dest in output_destinations:
    wb.save(dest)
    print(f"Polished & saved 10/10 completed questionnaire to: {dest}")
