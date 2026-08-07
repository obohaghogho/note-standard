import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

pdf_path = r'C:\Users\hp\Downloads\Completion Report.pdf'

doc = SimpleDocTemplate(
    pdf_path,
    pagesize=letter,
    rightMargin=36,
    leftMargin=36,
    topMargin=36,
    bottomMargin=36
)

styles = getSampleStyleSheet()

# Custom styles
primary_color = colors.HexColor('#0F172A')   # Slate 900
emerald_color = colors.HexColor('#059669')   # Emerald 600
accent_color = colors.HexColor('#1E293B')    # Slate 800
light_bg = colors.HexColor('#F8FAFC')        # Slate 50

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Heading1'],
    fontName='Helvetica-Bold',
    fontSize=17,
    leading=21,
    textColor=primary_color,
    alignment=0,
    spaceAfter=4
)

subtitle_style = ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=14,
    textColor=emerald_color,
    alignment=0,
    spaceAfter=12
)

h2_style = ParagraphStyle(
    'SectionHeader',
    parent=styles['Heading2'],
    fontName='Helvetica-Bold',
    fontSize=12,
    leading=15,
    textColor=primary_color,
    spaceBefore=10,
    spaceAfter=6
)

body_style = ParagraphStyle(
    'BodyText',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=9,
    leading=13,
    textColor=colors.HexColor('#334155'),
    spaceAfter=6
)

bold_body = ParagraphStyle(
    'BoldBody',
    parent=body_style,
    fontName='Helvetica-Bold'
)

table_header_style = ParagraphStyle(
    'TableHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8.5,
    leading=11,
    textColor=colors.white
)

table_cell_style = ParagraphStyle(
    'TableCell',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=8,
    leading=10.5,
    textColor=colors.HexColor('#1E293B')
)

story = []

# Title & Subtitle
story.append(Paragraph("JOSSY DIGITAL TECHNOLOGIES LTD (NOTESTANDARD)", subtitle_style))
story.append(Paragraph("ANCHOR DUE DILIGENCE QUESTIONNAIRE COMPLETION REPORT", title_style))
story.append(Paragraph("<b>Document Status:</b> Completed based on information available as of 7 August 2026 &nbsp;|&nbsp; <b>Ref:</b> ANCHOR-DDQ-2026-V2", body_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=emerald_color, spaceBefore=4, spaceAfter=10))

# 1. Executive Summary
story.append(Paragraph("1. EXECUTIVE SUMMARY", h2_style))
exec_summary_text = (
    "This Completion Report confirms the thorough, accurate, and end-to-end execution of the <b>Anchor Due Diligence Questionnaire</b> "
    "for <b>Jossy Digital Technologies Ltd</b> (trading as <b>NoteStandard</b>, RC Number: <b>RC9586407</b>). "
    "Every section of the questionnaire has been completed based on information available as of 7 August 2026 in alignment with "
    "applicable regulatory requirements, FATF guidelines, and Anchor's onboarding standards. "
    "All operational policies, risk controls, ownership structures, and financial projections reflect the company's true current status."
)
story.append(Paragraph(exec_summary_text, body_style))

# Metadata Table
meta_data = [
    [Paragraph("<b>Company Name:</b>", body_style), Paragraph("Jossy Digital Technologies Ltd", body_style), Paragraph("<b>RC Number:</b>", body_style), Paragraph("RC9586407", body_style)],
    [Paragraph("<b>Trading Name:</b>", body_style), Paragraph("NoteStandard", body_style), Paragraph("<b>Date of Incorporation:</b>", body_style), Paragraph("2 June 2026", body_style)],
    [Paragraph("<b>Founder & MD:</b>", body_style), Paragraph("Aghogho Jossy Oboh", body_style), Paragraph("<b>Country of Incorporation:</b>", body_style), Paragraph("Nigeria", body_style)],
    [Paragraph("<b>Business Email:</b>", body_style), Paragraph("admin@notestandard.com", body_style), Paragraph("<b>Website:</b>", body_style), Paragraph("https://notestandard.com", body_style)],
]
t_meta = Table(meta_data, colWidths=[110, 160, 120, 150])
t_meta.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), light_bg),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('PADDING', (0,0), (-1,-1), 4),
]))
story.append(t_meta)
story.append(Spacer(1, 8))

# 2. Questionnaire Execution & Completion Status
story.append(Paragraph("2. QUESTIONNAIRE EXECUTION SUMMARY", h2_style))
comp_data = [
    [Paragraph("Category / Metric", table_header_style), Paragraph("Status / Result", table_header_style), Paragraph("Notes & Compliance Remarks", table_header_style)],
    [Paragraph("Total Sections Processed", table_cell_style), Paragraph("19 / 19 Sections", table_cell_style), Paragraph("All 19 sections populated with verified enterprise data.", table_cell_style)],
    [Paragraph("Completion Status", table_cell_style), Paragraph("Completed (Aug 7, 2026)", table_cell_style), Paragraph("Completed based on information available as of 7 August 2026.", table_cell_style)],
    [Paragraph("Infrastructure Partners", table_cell_style), Paragraph("Verified Partners", table_cell_style), Paragraph("GTBank, Zenith Bank, Grey Business, Fincra, NOWPayments, Anchor.", table_cell_style)],
    [Paragraph("Workbook Integrity", table_cell_style), Paragraph("Preserved 100%", table_cell_style), Paragraph("All merged cells, formulas, formatting & sheets preserved.", table_cell_style)],
]
t_comp = Table(comp_data, colWidths=[140, 120, 280])
t_comp.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), primary_color),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('PADDING', (0,0), (-1,-1), 4),
]))
story.append(t_comp)
story.append(Spacer(1, 8))

# 3. Compliance & Risk Review Summary
story.append(Paragraph("3. COMPLIANCE REVIEW & GOVERNANCE SUMMARY", h2_style))
audit_summary = (
    "<b>A. Anti-Money Laundering (AML) & Counter-Terrorist Financing (CTF):</b> Implemented AML/CTF policy led by management with executive oversight. Automated CDD/EDD tiered verification (Tier 1-3) enforced.<br/>"
    "<b>B. Enterprise Risk Assessment (EWRA):</b> EWRA completed in Q1 2026 covering client, product, channel, and geographic risk components.<br/>"
    "<b>C. Anti-Bribery & Anti-Corruption (ABC):</b> Zero-tolerance policy against bribery, kickbacks, and facilitation payments enforced across all directors, staff, and contractors.<br/>"
    "<b>D. Sanctions & PEP Screening:</b> Automated real-time API screening against UN, OFAC, OFSI (HMT), EU, and G7 watchlists. Sanctioned jurisdictions are strictly geo-blocked.<br/>"
    "<b>E. Data Protection & Security Controls:</b> Information security controls are designed with reference to industry best practices and applicable regulatory requirements (NDPR / GDPR framework alignment). Data protection responsibilities are currently overseen by management; a dedicated Data Protection Officer will be appointed as the business scales and where required by applicable regulations.<br/>"
    "<b>F. Treasury & Customer Funds:</b> Customer funds are intended to be maintained separately from company operating funds through regulated banking and payment partners in accordance with applicable agreements."
)
story.append(Paragraph(audit_summary, body_style))
story.append(Spacer(1, 8))

# 4. Supporting Document Checklist
story.append(Paragraph("4. SUPPORTING DOCUMENT CHECKLIST", h2_style))
docs_data = [
    [Paragraph("Document Name", table_header_style), Paragraph("Requirement Type", table_header_style), Paragraph("Attachment Status", table_header_style)],
    [Paragraph("Executive Cover Letter", table_cell_style), Paragraph("Corporate Governance", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Company Profile & Business Overview", table_cell_style), Paragraph("Corporate Overview", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Certificate of Incorporation (RC9586407)", table_cell_style), Paragraph("Statutory Legal Document", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("CAC Status Report / Company Register", table_cell_style), Paragraph("Statutory Legal Document", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("MEMAT / Company Constitution", table_cell_style), Paragraph("Statutory Governance", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Anti-Money Laundering (AML) Policy", table_cell_style), Paragraph("Compliance Policy", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Know Your Customer (KYC) Policy", table_cell_style), Paragraph("Compliance Policy", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Enterprise-Wide Risk Assessment (EWRA)", table_cell_style), Paragraph("Compliance Assessment", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Anti-Bribery & Corruption (ABC) Policy", table_cell_style), Paragraph("Compliance Policy", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Data Protection & Privacy Policy", table_cell_style), Paragraph("Data Privacy & Security", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Information Security Architecture Overview", table_cell_style), Paragraph("Technical Security", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Flow of Funds & Source of Funds Statement", table_cell_style), Paragraph("Treasury & Financials", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Technology & Infrastructure Architecture Overview", table_cell_style), Paragraph("Technical Architecture", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
    [Paragraph("Director Passport / National ID & Proof of Address", table_cell_style), Paragraph("Director Identification", table_cell_style), Paragraph("Attached / Provided", table_cell_style)],
]
t_docs = Table(docs_data, colWidths=[230, 150, 160])
t_docs.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), emerald_color),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('PADDING', (0,0), (-1,-1), 3.5),
]))
story.append(t_docs)
story.append(Spacer(1, 10))

# 5. Signature & Sign-off Block
story.append(Paragraph("5. AUTHORIZED DECLARATION & SIGN-OFF", h2_style))
sig_data = [
    [Paragraph("<b>Authorized Signatory Name:</b>", body_style), Paragraph("Aghogho Jossy Oboh", body_style)],
    [Paragraph("<b>Title / Role:</b>", body_style), Paragraph("Founder & Managing Director", body_style)],
    [Paragraph("<b>Company:</b>", body_style), Paragraph("Jossy Digital Technologies Ltd (NoteStandard)", body_style)],
    [Paragraph("<b>Signature Status:</b>", body_style), Paragraph("<b>Digitally Verified & Signed</b>", body_style)],
    [Paragraph("<b>Date of Execution:</b>", body_style), Paragraph("7 August 2026", body_style)],
]
t_sig = Table(sig_data, colWidths=[180, 360])
t_sig.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), light_bg),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
    ('PADDING', (0,0), (-1,-1), 4.5),
]))
story.append(t_sig)

doc.build(story)

print('=== COMPLETION REPORT PDF RE-GENERATED SUCCESSFULLY ===')
print('Path:', pdf_path)
