import os
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

root_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social"
screens_dir = os.path.join(root_dir, "assets", "screens")
audio_dir = os.path.join(root_dir, "audio")
exports_dir = os.path.join(root_dir, "exports")
thumbnails_dir = os.path.join(root_dir, "thumbnails")

os.makedirs(exports_dir, exist_ok=True)
os.makedirs(thumbnails_dir, exist_ok=True)

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load REAL NoteStandard Video 6 Screens
def load_screen(filename):
    path = os.path.join(screens_dir, filename)
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    raise FileNotFoundError(f"Required real screen {filename} not found at {path}!")

screen_overview = load_screen("v6_wallet_overview.png")
screen_ngn      = load_screen("v6_ngn_wallet.png")
screen_usd      = load_screen("v6_usd_wallet.png")
screen_ghs      = load_screen("v6_ghs_wallet.png")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 13.5
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 405 frames

# Load TrueType Fonts safely
font_dir = r"C:\Windows\Fonts"
try:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 38)
    font_cta   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 52)
except Exception:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 38)
    font_cta   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 52)

# Vector Icon Generators
def draw_sparkle_icon(size=(46, 46)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size[0] // 2, size[1] // 2
    d.polygon([(cx, 2), (cx+6, cy-6), (size[0]-2, cy), (cx+6, cy+6), (cx, size[1]-2), (cx-6, cy+6), (2, cy), (cx-6, cy-6)], fill=(250, 204, 21, 255))
    return img

sparkle_icon_img = draw_sparkle_icon()

# Clean Text Banner Renderer positioned strictly in SAFE ZONE (y=1650)
def draw_clean_text_banner(draw, base_canvas, text, y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255), icon=None):
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    
    icon_w = icon.width + 16 if icon else 0
    total_w = tw + icon_w

    px, py = 45, 22
    x1, y1 = (WIDTH - total_w) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + total_w) // 2 + px, y_center + th // 2 + py

    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=24, fill=bg_color, outline=border_color, width=4)
    
    text_x = (WIDTH - total_w) // 2
    text_y = y_center - th // 2 - 4
    draw.text((text_x, text_y), text, fill=text_color, font=font)

    if icon:
        icon_x = text_x + tw + 14
        icon_y = y_center - icon.height // 2
        base_canvas.paste(icon, (icon_x, icon_y), icon)

# Multi-line / Dual Banner Helper
def draw_stacked_text_banners(draw, base_canvas, text_line1, text_line2, y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255)):
    draw_clean_text_banner(draw, base_canvas, text_line1, y_center=y_center-50, font=font, bg_color=bg_color, border_color=border_color, text_color=text_color)
    draw_clean_text_banner(draw, base_canvas, text_line2, y_center=y_center+50, font=font, bg_color=bg_color, border_color=border_color, text_color=text_color)

# Helper: Paste Real Screen Screenshot
def paste_real_screen(base_canvas, screen_img, scale=0.84, center_x=540, center_y=920, offset_x=0):
    w, h = screen_img.size
    nw, nh = int(w * scale), int(h * scale)
    resized = screen_img.resize((nw, nh), Image.Resampling.LANCZOS)
    
    x = center_x - nw // 2 + offset_x
    y = center_y - nh // 2

    shadow_box = Image.new("RGBA", (nw + 32, nh + 32), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_box)
    sdraw.rounded_rectangle([(16, 16), (nw + 16, nh + 16)], radius=34, fill=(0, 0, 0, 180))
    base_canvas.paste(shadow_box, (x - 16, y - 8), shadow_box)

    frame_box = Image.new("RGBA", (nw + 12, nh + 12), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(frame_box)
    fdraw.rounded_rectangle([(0, 0), (nw + 11, nh + 11)], radius=32, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=3)
    base_canvas.paste(frame_box, (x - 6, y - 6), frame_box)

    base_canvas.paste(resized, (x, y), resized)

# Helper: Draw User Tap Indicator Pulse
def draw_tap_indicator(draw, center_x, center_y, radius=32, alpha=180):
    draw.ellipse([(center_x - radius, center_y - radius), (center_x + radius, center_y + radius)], fill=(99, 102, 241, alpha), outline=(255, 255, 255, alpha), width=3)

# Generate Cover Image separately
def generate_thumbnail():
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
    draw = ImageDraw.Draw(canvas)
    
    paste_real_screen(canvas, screen_overview, scale=0.85, center_x=540, center_y=900)
    
    draw_clean_text_banner(draw, canvas, "3 currencies. One app.", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255), icon=sparkle_icon_img)
    
    root_cover = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video6_Cover.png"
    export_cover = os.path.join(thumbnails_dir, "NoteStandard_TikTok_Video6_Cover.png")
    
    canvas.save(root_cover)
    canvas.save(export_cover)
    print(f"Saved Cover Thumbnail to:\n - {root_cover}\n - {export_cover}")

# Render Direct Pipe to FFmpeg
def render_video_direct_pipe():
    audio_file = os.path.join(audio_dir, "vo_tiktok6_full.wav")
    out_root = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video6.mp4"
    out_export = os.path.join(exports_dir, "NoteStandard_TikTok_Video6.mp4")

    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgba",
        "-r", str(FPS),
        "-i", "-",  # Pipe input
        "-i", audio_file,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_export
    ]

    print(f"Piping frames to FFmpeg to generate final output: {out_export}")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Frame demarcations (30 FPS, 13.5s = 405 frames total)
    # 0.00 - 1.00s: 0 - 29 (First second: 3 currencies. One app. + immediate interaction)
    # 1.00 - 3.50s: 30 - 104 (1.00-1.80s NGN, 1.80-2.60s USD, 2.60-3.50s GHS)
    # 3.50 - 6.50s: 105 - 194 (Overview showing NGN • USD • GHS together)
    # 6.50 - 9.50s: 195 - 284 (Multi-currency management feature interaction)
    # 9.50 - 11.50s: 285 - 344 (Visual payoff: All in one place.)
    # 11.50 - 13.50s: 345 - 404 (Brand ending: NOTE STANDARD / www.notestandard.com)
    
    f_hook    = int(FPS * 1.0)  # 30
    f_reveal  = int(FPS * 3.5)  # 105
    f_cards   = int(FPS * 6.5)  # 195
    f_feat    = int(FPS * 9.5)  # 285
    f_payoff  = int(FPS * 11.5) # 345
    f_brand   = int(FPS * 13.5) # 405

    for f_idx in range(TOTAL_FRAMES):
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # 0.00–1.00s: FIRST SECOND (IMMEDIATE PRODUCT ACTION + "3 currencies. One app.")
        if f_idx < f_hook:
            # 0.00-0.30s (frames 0-8): NoteStandard wallet overview screen
            # 0.30-0.80s (frames 9-23): Immediate fast tap & transition into NGN wallet
            # 0.80-1.00s (frames 24-29): NGN wallet shown clearly
            if f_idx < 9:
                paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)
            elif f_idx < 24:
                # Fast interaction: Tap indicator on NGN card + smooth zoom/cut
                prog = (f_idx - 9) / 15.0
                if f_idx < 15:
                    paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)
                    tap_prog = (f_idx - 9) / 6.0
                    radius = int(24 + 20 * tap_prog)
                    alpha = max(0, int(220 * (1.0 - tap_prog)))
                    draw_tap_indicator(draw, 540, 680, radius=radius, alpha=alpha)
                else:
                    # Rapid slide-in from overview to NGN screen
                    offset_x = int((1.0 - (f_idx - 15) / 9.0) * 400)
                    paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=920, offset_x=offset_x)
            else:
                paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=920)

            # CRITICAL CHANGE #2: New Immediate Hook in Safe Zone
            draw_clean_text_banner(draw, canvas, "3 currencies. One app.", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255), icon=sparkle_icon_img)

        # 1.00–3.50s: RAPID REVEAL (NGN -> USD -> GHS)
        elif f_idx < f_reveal:
            rel_f = f_idx - f_hook # 0 to 74
            
            # 1.00 - 1.80s (rel 0-23): NGN Wallet
            if rel_f < 24:
                paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=920)
                if rel_f >= 6 and rel_f <= 18:
                    tap_p = (rel_f - 6) / 12.0
                    draw_tap_indicator(draw, 540, 560, radius=int(24 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))
                draw_clean_text_banner(draw, canvas, "Naira Wallet + Virtual NUBAN 🇳🇬", y_center=1650, font=font_title, bg_color=(15, 23, 42, 245), border_color=(22, 163, 74, 255), text_color=(255, 255, 255, 255))
            
            # 1.80 - 2.60s (rel 24-47): USD Wallet
            elif rel_f < 48:
                paste_real_screen(canvas, screen_usd, scale=0.84, center_x=540, center_y=920)
                if rel_f >= 30 and rel_f <= 42:
                    tap_p = (rel_f - 30) / 12.0
                    draw_tap_indicator(draw, 540, 560, radius=int(24 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))
                draw_clean_text_banner(draw, canvas, "Global USD Account 🇺🇸", y_center=1650, font=font_title, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255))
            
            # 2.60 - 3.50s (rel 48-74): GHS Wallet
            else:
                paste_real_screen(canvas, screen_ghs, scale=0.84, center_x=540, center_y=920)
                if rel_f >= 54 and rel_f <= 66:
                    tap_p = (rel_f - 54) / 12.0
                    draw_tap_indicator(draw, 540, 560, radius=int(24 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))
                draw_clean_text_banner(draw, canvas, "Ghanaian Cedi Mobile Money 🇬🇭", y_center=1650, font=font_title, bg_color=(15, 23, 42, 245), border_color=(234, 179, 8, 255), text_color=(255, 255, 255, 255))

        # 3.50–6.50s: THREE WALLETS TOGETHER OVERVIEW
        elif f_idx < f_cards:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)
            
            # Pulse highlight across cards
            rel_f = f_idx - f_reveal # 0 to 89
            if rel_f < 30:
                draw_tap_indicator(draw, 540, 680, radius=36, alpha=140)
            elif rel_f < 60:
                draw_tap_indicator(draw, 540, 960, radius=36, alpha=140)
            else:
                draw_tap_indicator(draw, 540, 1240, radius=36, alpha=140)

            draw_clean_text_banner(draw, canvas, "NGN • USD • GHS", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        # 6.50–9.50s: REAL NOTESTANDARD MULTI-CURRENCY FEATURE INTERACTION
        elif f_idx < f_feat:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)
            
            rel_f = (f_idx - f_cards) % 30
            tap_p = rel_f / 30.0
            draw_tap_indicator(draw, 540, 1420, radius=int(24 + 20 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))

            draw_clean_text_banner(draw, canvas, "Instant Multi-Currency Access", y_center=1650, font=font_title, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(52, 211, 153, 255))

        # 9.50–11.50s: VISUAL PAYOFF (OVERVIEW DASHBOARD)
        elif f_idx < f_payoff:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)

            draw_clean_text_banner(draw, canvas, "All in one place.", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        # 11.50–13.50s: SHORT BRAND ENDING (NOTE STANDARD + WEBSITE)
        else:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=920)

            draw_stacked_text_banners(draw, canvas, "NOTE STANDARD", "www.notestandard.com", y_center=1650, font=font_cta, bg_color=(15, 23, 42, 250), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        proc.stdin.write(canvas.tobytes())

    proc.stdin.close()
    stdout_data, stderr_data = proc.communicate()

    if proc.returncode == 0:
        print(f"SUCCESS! Rendered final TikTok Video 6 to {out_export}")
        import shutil
        shutil.copyfile(out_export, out_root)
        print(f"Copied final video to root workspace: {out_root}")
        print(f"Output File Size: {os.path.getsize(out_root)} bytes")
    else:
        print("Error rendering video:", stderr_data.decode("utf-8"))

if __name__ == "__main__":
    generate_thumbnail()
    render_video_direct_pipe()
