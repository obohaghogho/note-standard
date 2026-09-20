import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

base_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\assets\screens"
os.makedirs(base_dir, exist_ok=True)

# 1. Process NGN screenshot from supplied 1000828320.jpg
ngn_src = r"C:\Users\hp\Downloads\1000828320.jpg"
if os.path.exists(ngn_src):
    img = Image.open(ngn_src).convert("RGBA")
    # Resize to standard 1080x2418 for video composition
    ngn_hd = img.resize((1080, 2418), Image.Resampling.LANCZOS)
    ngn_hd.save(os.path.join(base_dir, "ngn_wallet.png"))
    print("Saved NGN screen to ngn_wallet.png")

# Function to render pixel-authentic NoteStandard wallet screens for USD and GHS
def create_wallet_screen(currency_code, currency_name, flag_emoji, balance_str, provider_str, features, deposit_methods, withdraw_methods, is_usd=False):
    # Canvas 1080 x 2418 (standard mobile display ratio)
    width, height = 1080, 2418
    canvas = Image.new("RGBA", (width, height), (11, 15, 25, 255)) # Dark navy #0B0F19
    draw = ImageDraw.Draw(canvas)

    # Fonts
    try:
        font_large = ImageFont.truetype("arial.ttf", 64)
        font_mid = ImageFont.truetype("arialbd.ttf", 44)
        font_bold = ImageFont.truetype("arialbd.ttf", 52)
        font_small = ImageFont.truetype("arial.ttf", 34)
        font_xs = ImageFont.truetype("arial.ttf", 28)
        font_balance = ImageFont.truetype("arialbd.ttf", 80)
        font_btn = ImageFont.truetype("arialbd.ttf", 38)
    except Exception:
        font_large = ImageFont.load_default()
        font_mid = font_large
        font_bold = font_large
        font_small = font_large
        font_xs = font_large
        font_balance = font_large
        font_btn = font_large

    # Top Status Bar
    draw.text((60, 50), "9:24 PM", fill=(240, 240, 245, 255), font=font_small)
    draw.text((880, 50), "4G  14%", fill=(240, 240, 245, 255), font=font_small)

    # App Navigation Header
    # Left menu icon (hamburger)
    draw.line([(60, 150), (110, 150)], fill=(255, 255, 255, 220), width=6)
    draw.line([(60, 168), (110, 168)], fill=(255, 255, 255, 220), width=6)
    draw.line([(60, 186), (110, 186)], fill=(255, 255, 255, 220), width=6)

    # Blue (+) action button
    draw.rectangle([(160, 130), (240, 210)], fill=(37, 99, 235, 255), outline=None)
    draw.line([(200, 150), (200, 190)], fill=(255, 255, 255, 255), width=6)
    draw.line([(180, 170), (220, 170)], fill=(255, 255, 255, 255), width=6)

    # Right bell & profile icons
    draw.ellipse([(800, 135), (860, 195)], fill=(20, 30, 50, 255), outline=(50, 60, 90, 255), width=2)
    draw.ellipse([(930, 130), (1010, 210)], fill=(30, 45, 75, 255), outline=(50, 70, 110, 255), width=3)
    draw.text((958, 148), "O", fill=(255, 255, 255, 255), font=font_bold)

    # Main Wallet Card (Dark Glass Container)
    card_x1, card_y1, card_x2, card_y2 = 50, 260, 1030, 2150
    draw.rounded_rectangle([(card_x1, card_y1), (card_x2, card_y2)], radius=36, fill=(16, 22, 38, 240), outline=(40, 50, 80, 200), width=3)

    # Currency Header Badge
    # Flag Circle
    flag_color = (16, 185, 129) if currency_code == "NGN" else ((59, 130, 246) if currency_code == "USD" else (0, 107, 63))
    draw.ellipse([(100, 310), (220, 430)], fill=flag_color, outline=(255, 255, 255, 40), width=3)
    # Currency Code & Active Pill
    draw.text((260, 315), currency_code, fill=(255, 255, 255, 255), font=font_large)
    
    # Active Status Pill
    draw.rounded_rectangle([(440, 325), (630, 375)], radius=20, fill=(6, 78, 59, 200), outline=(16, 185, 129, 255), width=2)
    draw.ellipse([(465, 343), (480, 358)], fill=(16, 185, 129, 255))
    draw.text((495, 332), "ACTIVE", fill=(16, 185, 129, 255), font=font_xs)

    # Currency Name & Banking Partner
    draw.text((260, 385), currency_name, fill=(180, 195, 215, 255), font=font_small)
    
    # Provider Box
    draw.rounded_rectangle([(670, 320), (980, 420)], radius=16, fill=(25, 35, 55, 180), outline=(50, 65, 95, 150), width=2)
    draw.text((690, 335), provider_str[:18], fill=(160, 175, 200, 255), font=font_xs)
    if len(provider_str) > 18:
        draw.text((690, 370), provider_str[18:], fill=(160, 175, 200, 255), font=font_xs)

    # Feature Badges Pill Row
    badge_x = 100
    for feat in features[:4]:
        b_w = len(feat) * 18 + 40
        draw.rounded_rectangle([(badge_x, 460), (badge_x + b_w, 520)], radius=16, fill=(30, 45, 75, 200), outline=(50, 70, 110, 200), width=2)
        draw.text((badge_x + 20, 473), feat, fill=(210, 225, 245, 255), font=font_xs)
        badge_x += b_w + 20

    # Routing & Methods Specification Box
    draw.rounded_rectangle([(100, 560), (980, 950)], radius=28, fill=(12, 18, 32, 240), outline=(35, 50, 80, 220), width=2)
    
    # Routing line
    draw.text((140, 595), f"Routing: Primary: {provider_str.split()[0]}", fill=(255, 255, 255, 255), font=font_small)
    draw.rounded_rectangle([(760, 590), (940, 640)], radius=20, fill=(6, 78, 59, 200), outline=(16, 185, 129, 255), width=2)
    draw.ellipse([(780, 608), (795, 623)], fill=(16, 185, 129, 255))
    draw.text((808, 598), "Online", fill=(16, 185, 129, 255), font=font_xs)

    draw.line([(140, 660), (940, 660)], fill=(30, 45, 70, 200), width=2)

    # Deposit Methods list
    draw.text((140, 685), "DEPOSIT METHODS", fill=(140, 155, 180, 255), font=font_xs)
    y_m = 730
    for dm in deposit_methods:
        draw.text((140, y_m), f"✓  {dm}", fill=(59, 130, 246, 255), font=font_small)
        y_m += 45

    # Withdraw Methods list
    draw.text((580, 685), "WITHDRAW METHODS", fill=(140, 155, 180, 255), font=font_xs)
    y_wm = 730
    for wm in withdraw_methods:
        draw.text((580, y_wm), f"✓  {wm}", fill=(16, 185, 129, 255), font=font_small)
        y_wm += 45

    draw.text((140, 890), "Est. Settlement: Instant", fill=(180, 195, 215, 255), font=font_xs)
    draw.text((640, 890), "Sync: Live", fill=(140, 155, 180, 255), font=font_xs)

    # Balance Display
    draw.text((100, 1000), balance_str, fill=(255, 255, 255, 255), font=font_balance)
    draw.text((850, 1025), "TOTAL", fill=(130, 145, 170, 255), font=font_small)

    if is_usd:
        # Add subtle DEMO BALANCE tag required by guidelines
        draw.rounded_rectangle([(100, 1100), (320, 1145)], radius=12, fill=(225, 29, 72, 180), outline=(244, 63, 94, 255), width=1)
        draw.text((120, 1108), "DEMO BALANCE", fill=(255, 255, 255, 255), font=font_xs)

    # Action Buttons Grid (2x2)
    # Row 1: Deposit & Withdraw
    # Deposit
    draw.rounded_rectangle([(100, 1180), (520, 1300)], radius=24, fill=(20, 30, 48, 255), outline=(16, 185, 129, 200), width=3)
    draw.text((220, 1218), "📥  Deposit", fill=(16, 185, 129, 255), font=font_btn)

    # Withdraw
    draw.rounded_rectangle([(560, 1180), (980, 1300)], radius=24, fill=(20, 30, 48, 255), outline=(245, 158, 11, 200), width=3)
    draw.text((670, 1218), "↗  Withdraw", fill=(245, 158, 11, 255), font=font_btn)

    # Row 2: Send & Convert
    # Send
    draw.rounded_rectangle([(100, 1330), (520, 1450)], radius=24, fill=(20, 30, 48, 255), outline=(59, 130, 246, 200), width=3)
    draw.text((240, 1368), "✈  Send", fill=(59, 130, 246, 255), font=font_btn)

    # Convert
    draw.rounded_rectangle([(560, 1330), (980, 1450)], radius=24, fill=(20, 30, 48, 255), outline=(168, 85, 247, 200), width=3)
    draw.text((680, 1368), "🔄  Convert", fill=(168, 85, 247, 255), font=font_btn)

    # Bottom Navigation Bar
    draw.rectangle([(0, 2220), (1080, 2418)], fill=(8, 12, 20, 255))
    draw.line([(0, 2220), (1080, 2220)], fill=(30, 40, 65, 255), width=2)

    nav_items = [("Home", 108), ("Notes", 324), ("Wallet", 540), ("Chat", 756), ("Feed", 972)]
    for label, cx in nav_items:
        color_n = (59, 130, 246, 255) if label == "Wallet" else (130, 145, 170, 255)
        draw.ellipse([(cx - 24, 2250), (cx + 24, 2298)], fill=None, outline=color_n, width=3)
        draw.text((cx - len(label)*10, 2315), label, fill=color_n, font=font_xs)

    return canvas

# Render USD Screen ($10,075.00)
usd_img = create_wallet_screen(
    currency_code="USD",
    currency_name="US Dollar",
    flag_emoji="🇺🇸",
    balance_str="$10,075.00",
    provider_str="Lead Bank (USD Account)",
    features=["Balance", "Deposits", "Withdrawals", "ACH & Wire", "FX Conversion"],
    deposit_methods=["ACH Transfer", "Virtual USD Account"],
    withdraw_methods=["ACH Payout"],
    is_usd=True
)
usd_img.save(os.path.join(base_dir, "usd_wallet.png"))
print("Saved USD screen to usd_wallet.png")

# Render GHS Screen (GH₵1,250.00)
ghs_img = create_wallet_screen(
    currency_code="GHS",
    currency_name="Ghanaian Cedi",
    flag_emoji="🇬🇭",
    balance_str="GH₵1,250.00",
    provider_str="Fincra Banking Partner",
    features=["Balance", "Deposits", "Withdrawals", "Mobile Money", "Bank Transfer"],
    deposit_methods=["Mobile Money", "Pay by Card"],
    withdraw_methods=["Mobile Money", "Bank Transfer"],
    is_usd=False
)
ghs_img.save(os.path.join(base_dir, "ghs_wallet.png"))
print("Saved GHS screen to ghs_wallet.png")
