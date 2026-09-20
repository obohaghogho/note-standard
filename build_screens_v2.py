import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

base_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\assets\screens"
os.makedirs(base_dir, exist_ok=True)

width, height = 1080, 2418

# Load fonts safely
try:
    font_hero = ImageFont.truetype("arialbd.ttf", 64)
    font_title = ImageFont.truetype("arialbd.ttf", 52)
    font_bold = ImageFont.truetype("arialbd.ttf", 44)
    font_mid = ImageFont.truetype("arialbd.ttf", 38)
    font_small = ImageFont.truetype("arial.ttf", 32)
    font_xs = ImageFont.truetype("arial.ttf", 28)
    font_balance = ImageFont.truetype("arialbd.ttf", 88)
    font_btn = ImageFont.truetype("arialbd.ttf", 40)
except Exception:
    font_hero = ImageFont.load_default()
    font_title = font_hero
    font_bold = font_hero
    font_mid = font_hero
    font_small = font_hero
    font_xs = font_hero
    font_balance = font_hero
    font_btn = font_hero

def draw_header(draw, title="NoteStandard"):
    # Status bar
    draw.text((60, 50), "9:41", fill=(240, 240, 245, 255), font=font_small)
    draw.text((880, 50), "5G  100%", fill=(240, 240, 245, 255), font=font_small)
    
    # Hamburger
    draw.line([(60, 150), (110, 150)], fill=(255, 255, 255, 240), width=6)
    draw.line([(60, 168), (110, 168)], fill=(255, 255, 255, 240), width=6)
    draw.line([(60, 186), (110, 186)], fill=(255, 255, 255, 240), width=6)

    # Title
    draw.text((360, 145), title, fill=(255, 255, 255, 255), font=font_bold)

    # Profile Icon
    draw.ellipse([(930, 130), (1010, 210)], fill=(37, 99, 235, 255), outline=(59, 130, 246, 255), width=3)
    draw.text((955, 145), "NS", fill=(255, 255, 255, 255), font=font_btn)

# 1. SCREEN 1: Crypto Asset Balance
def create_hook_screen():
    canvas = Image.new("RGBA", (width, height), (10, 14, 26, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "Digital Assets")

    draw.rounded_rectangle([(50, 260), (1030, 2150)], radius=36, fill=(15, 23, 42, 240), outline=(168, 85, 247, 200), width=3)

    # Crypto Badge
    draw.ellipse([(120, 320), (240, 440)], fill=(168, 85, 247, 255))
    draw.text((160, 345), "₮", fill=(255, 255, 255, 255), font=font_hero)
    draw.text((270, 340), "Tether USDT", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((270, 400), "Crypto Wallet • Active", fill=(148, 163, 184, 255), font=font_small)

    # Balance
    draw.text((120, 500), "CRYPTO BALANCE", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 545), "3,420.00 USDT", fill=(168, 85, 247, 255), font=font_balance)
    draw.text((120, 650), "≈ $3,420.00 USD", fill=(180, 195, 215, 255), font=font_bold)

    # Visual Details
    draw.rounded_rectangle([(100, 750), (980, 1150)], radius=28, fill=(20, 30, 50, 255), outline=(51, 65, 85, 255), width=2)
    draw.text((140, 790), "NETWORK ASSET", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((140, 835), "TRC-20 / ERC-20 Network", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((140, 900), "Status: Wallet Verified", fill=(16, 185, 129, 255), font=font_mid)
    draw.text((140, 960), "Action: Ready to Swap", fill=(59, 130, 246, 255), font=font_mid)

    # Action Button
    draw.rounded_rectangle([(100, 1250), (980, 1400)], radius=24, fill=(168, 85, 247, 255))
    draw.text((380, 1290), "Swap Crypto", fill=(255, 255, 255, 255), font=font_btn)

    path = os.path.join(base_dir, "hook_crypto.png")
    canvas.save(path)
    print(f"Saved {path}")

# 2. SCREEN 2: Swap Conversion
def create_swap_screen():
    canvas = Image.new("RGBA", (width, height), (10, 14, 26, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "Convert Asset")

    draw.rounded_rectangle([(50, 260), (1030, 2150)], radius=36, fill=(15, 23, 42, 240), outline=(59, 130, 246, 200), width=3)

    # FROM
    draw.rounded_rectangle([(100, 330), (980, 630)], radius=28, fill=(20, 30, 50, 255), outline=(168, 85, 247, 200), width=2)
    draw.text((140, 360), "FROM (CRYPTO)", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((140, 410), "1,000.00 USDT", fill=(255, 255, 255, 255), font=font_balance)

    # Arrow
    draw.ellipse([(490, 610), (590, 710)], fill=(59, 130, 246, 255), outline=(255, 255, 255, 255), width=3)
    draw.text((522, 635), "↓", fill=(255, 255, 255, 255), font=font_hero)

    # TO
    draw.rounded_rectangle([(100, 690), (980, 990)], radius=28, fill=(20, 30, 50, 255), outline=(16, 185, 129, 200), width=2)
    draw.text((140, 720), "TO (NAIRA FIAT)", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((140, 770), "₦1,520,000", fill=(16, 185, 129, 255), font=font_balance)
    draw.text((140, 900), "Rate: 1 USDT = ₦1,520.00", fill=(180, 195, 215, 255), font=font_bold)

    # Confirm Button
    draw.rounded_rectangle([(100, 1080), (980, 1230)], radius=24, fill=(16, 185, 129, 255))
    draw.text((380, 1120), "Swap Confirmed", fill=(255, 255, 255, 255), font=font_btn)

    path = os.path.join(base_dir, "swap_anim.png")
    canvas.save(path)
    print(f"Saved {path}")

# 3. SCREEN 3: NGN Balance Credited
def create_ngn_screen():
    canvas = Image.new("RGBA", (width, height), (10, 14, 26, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "Naira Wallet")

    draw.rounded_rectangle([(50, 260), (1030, 2150)], radius=36, fill=(15, 23, 42, 240), outline=(16, 185, 129, 255), width=3)

    # NGN Badge
    draw.ellipse([(120, 320), (240, 440)], fill=(16, 185, 129, 255))
    draw.text((160, 345), "₦", fill=(255, 255, 255, 255), font=font_hero)
    draw.text((270, 340), "Nigerian Naira", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((270, 400), "Virtual NUBAN Active", fill=(16, 185, 129, 255), font=font_small)

    # Balance
    draw.text((120, 500), "NAIRA BALANCE CREDITED", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 545), "₦1,520,000.00", fill=(16, 185, 129, 255), font=font_balance)

    # Success Ring
    draw.ellipse([(430, 720), (650, 940)], fill=(6, 78, 59, 240), outline=(16, 185, 129, 255), width=6)
    draw.text((495, 780), "✓", fill=(16, 185, 129, 255), font=font_balance)

    draw.text((370, 980), "CONVERSION COMPLETE", fill=(16, 185, 129, 255), font=font_bold)

    # Payout Button
    draw.rounded_rectangle([(100, 1100), (980, 1250)], radius=24, fill=(245, 158, 11, 255))
    draw.text((320, 1140), "Send to Local Bank", fill=(255, 255, 255, 255), font=font_btn)

    path = os.path.join(base_dir, "ngn_credited.png")
    canvas.save(path)
    print(f"Saved {path}")

# 4. SCREEN 4: Local Bank Payout Confirmed
def create_bank_screen():
    canvas = Image.new("RGBA", (width, height), (10, 14, 26, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "Bank Transfer")

    draw.rounded_rectangle([(50, 260), (1030, 2150)], radius=36, fill=(15, 23, 42, 240), outline=(245, 158, 11, 255), width=3)

    draw.text((120, 320), "DESTINATION BANK", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 365), "ACCESS BANK PLC", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 425), "Account No: 0123456789", fill=(180, 195, 215, 255), font=font_mid)
    draw.text((120, 485), "Beneficiary: MANUEL OBOH", fill=(16, 185, 129, 255), font=font_mid)

    draw.line([(100, 560), (980, 560)], fill=(51, 65, 85, 255), width=2)

    draw.text((120, 600), "AMOUNT PAID OUT", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 645), "₦1,520,000.00", fill=(16, 185, 129, 255), font=font_balance)

    # Success Ring
    draw.ellipse([(430, 800), (650, 1020)], fill=(6, 78, 59, 240), outline=(16, 185, 129, 255), width=6)
    draw.text((495, 860), "✓", fill=(16, 185, 129, 255), font=font_balance)

    draw.text((340, 1060), "SETTLED IN LOCAL BANK", fill=(16, 185, 129, 255), font=font_bold)
    draw.text((320, 1120), "Direct Bank Withdrawal", fill=(148, 163, 184, 255), font=font_small)

    path = os.path.join(base_dir, "bank_transfer.png")
    canvas.save(path)
    print(f"Saved {path}")

# 5. SCREEN 5: Brand Card
def create_brand_screen():
    canvas = Image.new("RGBA", (width, height), (10, 14, 26, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "NoteStandard")

    draw.rounded_rectangle([(50, 260), (1030, 2150)], radius=36, fill=(15, 23, 42, 240), outline=(59, 130, 246, 255), width=3)

    draw.ellipse([(430, 480), (650, 700)], fill=(37, 99, 235, 255), outline=(59, 130, 246, 255), width=4)
    draw.text((490, 540), "NS", fill=(255, 255, 255, 255), font=font_balance)

    draw.text((340, 740), "NOTESTANDARD", fill=(255, 255, 255, 255), font=font_hero)
    draw.text((310, 820), "Digital Wallet Solution", fill=(148, 163, 184, 255), font=font_mid)

    draw.rounded_rectangle([(100, 960), (980, 1200)], radius=28, fill=(37, 99, 235, 230), outline=(59, 130, 246, 255), width=3)
    draw.text((180, 1010), "ONE WALLET. THAT'S THE IDEA.", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((380, 1100), "www.notestandard.com", fill=(255, 255, 255, 255), font=font_mid)

    path = os.path.join(base_dir, "ending_idea.png")
    canvas.save(path)
    print(f"Saved {path}")

create_hook_screen()
create_swap_screen()
create_ngn_screen()
create_bank_screen()
create_brand_screen()
print("All revised TikTok Video #2 screens created successfully!")
