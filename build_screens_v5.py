import os
from PIL import Image, ImageDraw, ImageFont

root_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social"
screens_dir = os.path.join(root_dir, "assets", "screens")
os.makedirs(screens_dir, exist_ok=True)

width, height = 1080, 2160

# Load TrueType Fonts
font_dir = r"C:\Windows\Fonts"
try:
    font_hero = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 68)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 52)
    font_bold = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 44)
    font_mid = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 38)
    font_small = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 32)
    font_xs = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 28)
    font_balance = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 80)
    font_btn = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 38)
except Exception:
    font_hero = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 68)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 52)
    font_bold = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 44)
    font_mid = ImageFont.truetype(os.path.join(font_dir, "arial.ttf"), 38)
    font_small = ImageFont.truetype(os.path.join(font_dir, "arial.ttf"), 32)
    font_xs = ImageFont.truetype(os.path.join(font_dir, "arial.ttf"), 28)
    font_balance = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 80)
    font_btn = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 38)

# Crisp Flag Drawer functions
def draw_flag_ngn(size=(60, 40)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=6, fill=(22, 163, 74, 255))
    w = size[0] // 3
    d.rectangle([(w, 0), (2*w, size[1])], fill=(255, 255, 255, 255))
    return img

def draw_flag_usd(size=(60, 40)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=6, fill=(220, 38, 38, 255))
    for i in range(1, 5, 2):
        y1 = int(i * size[1] / 5)
        y2 = int((i+1) * size[1] / 5)
        d.rectangle([(0, y1), (size[0], y2)], fill=(255, 255, 255, 255))
    d.rectangle([(0, 0), (int(size[0]*0.45), int(size[1]*0.55))], fill=(30, 58, 138, 255))
    return img

def draw_flag_ghs(size=(60, 40)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=6, fill=(220, 38, 38, 255))
    h = size[1] / 3
    d.rectangle([(0, int(h)), (size[0], int(2*h))], fill=(234, 179, 8, 255))
    d.rectangle([(0, int(2*h)), (size[0], size[1])], fill=(22, 163, 74, 255))
    cx, cy = size[0] / 2, size[1] / 2
    d.ellipse([(cx-4, cy-4), (cx+4, cy+4)], fill=(15, 23, 42, 255))
    return img

flag_ngn = draw_flag_ngn()
flag_usd = draw_flag_usd()
flag_ghs = draw_flag_ghs()

def draw_header(draw, title="NoteStandard"):
    # Phone Status Bar
    draw.text((60, 45), "9:41", fill=(240, 243, 248, 255), font=font_small)
    draw.text((870, 45), "5G  100%", fill=(240, 243, 248, 255), font=font_small)
    
    # Navigation bar menu icon
    draw.line([(60, 140), (110, 140)], fill=(255, 255, 255, 240), width=5)
    draw.line([(60, 156), (110, 156)], fill=(255, 255, 255, 240), width=5)
    draw.line([(60, 172), (110, 172)], fill=(255, 255, 255, 240), width=5)

    # Title
    draw.text((360, 132), title, fill=(255, 255, 255, 255), font=font_bold)

    # User Profile avatar
    draw.ellipse([(930, 118), (1010, 198)], fill=(99, 102, 241, 255), outline=(129, 140, 248, 255), width=3)
    draw.text((950, 134), "NS", fill=(255, 255, 255, 255), font=font_btn)

# -----------------------------------------------------------------------------
# SCREEN 1: MULTI-CURRENCY OVERVIEW (NGN + USD + GHS in One Wallet)
# -----------------------------------------------------------------------------
def build_v5_overview():
    canvas = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "NoteStandard Wallet")

    # Main Container Box
    draw.rounded_rectangle([(40, 230), (1040, 2080)], radius=36, fill=(30, 41, 59, 240), outline=(51, 65, 85, 255), width=2)

    # Total Balance Header Card
    draw.rounded_rectangle([(80, 270), (1000, 480)], radius=28, fill=(15, 23, 42, 255), outline=(99, 102, 241, 200), width=2)
    draw.text((120, 305), "TOTAL MULTI-CURRENCY BALANCE", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 350), "$ 3,850.00", fill=(255, 255, 255, 255), font=font_balance)
    draw.text((120, 435), "≈ ₦ 5,775,000.00 • 3 Active Currencies", fill=(16, 185, 129, 255), font=font_small)

    # Section Title
    draw.text((80, 520), "YOUR FIAT WALLETS", fill=(255, 255, 255, 255), font=font_bold)

    # 1. NGN WALLET CARD
    draw.rounded_rectangle([(80, 580), (1000, 880)], radius=28, fill=(24, 34, 56, 255), outline=(99, 102, 241, 255), width=3)
    canvas.paste(flag_ngn, (120, 615), flag_ngn)
    draw.text((195, 615), "Nigerian Naira (NGN)", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 675), "₦ 1,850,000.00", fill=(129, 140, 248, 255), font=font_balance)
    draw.text((120, 780), "Virtual NUBAN: Wema Bank • Active", fill=(148, 163, 184, 255), font=font_small)
    draw.rounded_rectangle([(780, 615), (960, 665)], radius=14, fill=(99, 102, 241, 255))
    draw.text((805, 626), "PRIMARY", fill=(255, 255, 255, 255), font=font_xs)

    # 2. USD WALLET CARD
    draw.rounded_rectangle([(80, 920), (1000, 1220)], radius=28, fill=(18, 48, 38, 255), outline=(16, 185, 129, 255), width=3)
    canvas.paste(flag_usd, (120, 955), flag_usd)
    draw.text((195, 955), "US Dollar (USD)", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1015), "$ 1,200.00", fill=(52, 211, 153, 255), font=font_balance)
    draw.text((120, 1120), "Global USD Account • Active", fill=(148, 163, 184, 255), font=font_small)
    draw.rounded_rectangle([(800, 955), (960, 1005)], radius=14, fill=(16, 185, 129, 255))
    draw.text((830, 966), "GLOBAL", fill=(255, 255, 255, 255), font=font_xs)

    # 3. GHS WALLET CARD
    draw.rounded_rectangle([(80, 1260), (1000, 1560)], radius=28, fill=(48, 40, 18, 255), outline=(234, 179, 8, 255), width=3)
    canvas.paste(flag_ghs, (120, 1295), flag_ghs)
    draw.text((195, 1295), "Ghanaian Cedi (GHS)", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1355), "GH₵ 4,500.00", fill=(250, 204, 21, 255), font=font_balance)
    draw.text((120, 1460), "Mobile Money & Bank • Active", fill=(148, 163, 184, 255), font=font_small)
    draw.rounded_rectangle([(800, 1295), (960, 1345)], radius=14, fill=(234, 179, 8, 255))
    draw.text((835, 1306), "ACTIVE", fill=(15, 23, 42, 255), font=font_xs)

    # Bottom Quick Action Bar
    draw.rounded_rectangle([(80, 1600), (1000, 1720)], radius=24, fill=(99, 102, 241, 255))
    draw.text((320, 1640), "Manage All 3 Currencies", fill=(255, 255, 255, 255), font=font_btn)

    path = os.path.join(screens_dir, "v5_wallet_overview.png")
    canvas.save(path)
    print(f"Saved {path}")

# -----------------------------------------------------------------------------
# SCREEN 2: NGN WALLET DETAILED VIEW
# -----------------------------------------------------------------------------
def build_v5_ngn():
    canvas = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "Naira Wallet")

    draw.rounded_rectangle([(40, 230), (1040, 2080)], radius=36, fill=(30, 41, 59, 240), outline=(99, 102, 241, 255), width=3)

    # NGN Currency Header Box
    draw.rounded_rectangle([(80, 270), (1000, 680)], radius=28, fill=(24, 34, 56, 255), outline=(99, 102, 241, 255), width=2)
    draw.ellipse([(120, 310), (220, 410)], fill=(99, 102, 241, 255))
    canvas.paste(flag_ngn, (140, 340), flag_ngn)
    draw.text((250, 320), "Nigerian Naira", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((250, 370), "NGN Wallet • Dedicated Virtual NUBAN", fill=(148, 163, 184, 255), font=font_small)

    draw.text((120, 440), "AVAILABLE BALANCE", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 480), "₦ 1,850,000.00", fill=(129, 140, 248, 255), font=font_balance)
    draw.text((120, 585), "Dedicated NUBAN: 9948102341 (Wema Bank)", fill=(16, 185, 129, 255), font=font_small)

    # Action Buttons
    draw.rounded_rectangle([(80, 720), (520, 830)], radius=20, fill=(99, 102, 241, 255))
    draw.text((190, 755), "Deposit NGN", fill=(255, 255, 255, 255), font=font_btn)

    draw.rounded_rectangle([(560, 720), (1000, 830)], radius=20, fill=(51, 65, 85, 255), outline=(99, 102, 241, 255), width=2)
    draw.text((680, 755), "Transfer", fill=(255, 255, 255, 255), font=font_btn)

    # Recent Transactions
    draw.text((80, 880), "RECENT NGN TRANSACTIONS", fill=(255, 255, 255, 255), font=font_bold)

    # Tx 1
    draw.rounded_rectangle([(80, 940), (1000, 1100)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 970), "Inbound NUBAN Deposit", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1020), "Successful • Bank Transfer", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((700, 970), "+ ₦ 500,000.00", fill=(16, 185, 129, 255), font=font_bold)

    # Tx 2
    draw.rounded_rectangle([(80, 1130), (1000, 1290)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 1160), "Local Bank Transfer", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1210), "Completed • Instant Payout", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((720, 1160), "- ₦ 120,000.00", fill=(239, 68, 68, 255), font=font_bold)

    path = os.path.join(screens_dir, "v5_ngn_wallet.png")
    canvas.save(path)
    print(f"Saved {path}")

# -----------------------------------------------------------------------------
# SCREEN 3: USD WALLET DETAILED VIEW
# -----------------------------------------------------------------------------
def build_v5_usd():
    canvas = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "USD Wallet")

    draw.rounded_rectangle([(40, 230), (1040, 2080)], radius=36, fill=(30, 41, 59, 240), outline=(16, 185, 129, 255), width=3)

    # USD Currency Header Box
    draw.rounded_rectangle([(80, 270), (1000, 680)], radius=28, fill=(18, 48, 38, 255), outline=(16, 185, 129, 255), width=2)
    draw.ellipse([(120, 310), (220, 410)], fill=(16, 185, 129, 255))
    canvas.paste(flag_usd, (140, 340), flag_usd)
    draw.text((250, 320), "US Dollar", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((250, 370), "USD Wallet • Global Dollar Account", fill=(148, 163, 184, 255), font=font_small)

    draw.text((120, 440), "AVAILABLE BALANCE", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 480), "$ 1,200.00", fill=(52, 211, 153, 255), font=font_balance)
    draw.text((120, 585), "Global ACH & Wire Deposit Enabled", fill=(16, 185, 129, 255), font=font_small)

    # Action Buttons
    draw.rounded_rectangle([(80, 720), (520, 830)], radius=20, fill=(16, 185, 129, 255))
    draw.text((210, 755), "Fund USD", fill=(255, 255, 255, 255), font=font_btn)

    draw.rounded_rectangle([(560, 720), (1000, 830)], radius=20, fill=(51, 65, 85, 255), outline=(16, 185, 129, 255), width=2)
    draw.text((680, 755), "Send USD", fill=(255, 255, 255, 255), font=font_btn)

    # Recent Transactions
    draw.text((80, 880), "RECENT USD TRANSACTIONS", fill=(255, 255, 255, 255), font=font_bold)

    # Tx 1
    draw.rounded_rectangle([(80, 940), (1000, 1100)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 970), "ACH USD Deposit", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1020), "Completed • Direct Account", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((750, 970), "+ $ 750.00", fill=(16, 185, 129, 255), font=font_bold)

    # Tx 2
    draw.rounded_rectangle([(80, 1130), (1000, 1290)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 1160), "USD Transfer Out", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1210), "Successful • Global Wire", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((760, 1160), "- $ 200.00", fill=(239, 68, 68, 255), font=font_bold)

    path = os.path.join(screens_dir, "v5_usd_wallet.png")
    canvas.save(path)
    print(f"Saved {path}")

# -----------------------------------------------------------------------------
# SCREEN 4: GHS WALLET DETAILED VIEW
# -----------------------------------------------------------------------------
def build_v5_ghs():
    canvas = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, "GHS Wallet")

    draw.rounded_rectangle([(40, 230), (1040, 2080)], radius=36, fill=(30, 41, 59, 240), outline=(234, 179, 8, 255), width=3)

    # GHS Currency Header Box
    draw.rounded_rectangle([(80, 270), (1000, 680)], radius=28, fill=(48, 40, 18, 255), outline=(234, 179, 8, 255), width=2)
    draw.ellipse([(120, 310), (220, 410)], fill=(234, 179, 8, 255))
    canvas.paste(flag_ghs, (140, 340), flag_ghs)
    draw.text((250, 320), "Ghanaian Cedi", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((250, 370), "GHS Wallet • Mobile Money & Bank", fill=(148, 163, 184, 255), font=font_small)

    draw.text((120, 440), "AVAILABLE BALANCE", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((120, 480), "GH₵ 4,500.00", fill=(250, 204, 21, 255), font=font_balance)
    draw.text((120, 585), "MTN MoMo & Local Bank Active", fill=(16, 185, 129, 255), font=font_small)

    # Action Buttons
    draw.rounded_rectangle([(80, 720), (520, 830)], radius=20, fill=(234, 179, 8, 255))
    draw.text((200, 755), "Deposit GHS", fill=(15, 23, 42, 255), font=font_btn)

    draw.rounded_rectangle([(560, 720), (1000, 830)], radius=20, fill=(51, 65, 85, 255), outline=(234, 179, 8, 255), width=2)
    draw.text((680, 755), "Transfer", fill=(255, 255, 255, 255), font=font_btn)

    # Recent Transactions
    draw.text((80, 880), "RECENT GHS TRANSACTIONS", fill=(255, 255, 255, 255), font=font_bold)

    # Tx 1
    draw.rounded_rectangle([(80, 940), (1000, 1100)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 970), "Mobile Money Deposit", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1020), "Completed • MTN MoMo", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((710, 970), "+ GH₵ 2,000.00", fill=(16, 185, 129, 255), font=font_bold)

    # Tx 2
    draw.rounded_rectangle([(80, 1130), (1000, 1290)], radius=20, fill=(15, 23, 42, 255))
    draw.text((120, 1160), "Ghana Bank Payout", fill=(255, 255, 255, 255), font=font_bold)
    draw.text((120, 1210), "Completed • GCB Bank", fill=(148, 163, 184, 255), font=font_xs)
    draw.text((720, 1160), "- GH₵ 500.00", fill=(239, 68, 68, 255), font=font_bold)

    path = os.path.join(screens_dir, "v5_ghs_wallet.png")
    canvas.save(path)
    print(f"Saved {path}")

if __name__ == "__main__":
    build_v5_overview()
    build_v5_ngn()
    build_v5_usd()
    build_v5_ghs()
    print("All Video 5 real NoteStandard screens generated successfully!")
