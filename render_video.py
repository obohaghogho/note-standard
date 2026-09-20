import os
import cv2
import numpy as np
import subprocess
from PIL import Image, ImageDraw, ImageFont

# Project Paths
root_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social"
screens_dir = os.path.join(root_dir, "assets", "screens")
audio_dir = os.path.join(root_dir, "audio")
exports_dir = os.path.join(root_dir, "exports")
thumbs_dir = os.path.join(root_dir, "thumbnails")

os.makedirs(exports_dir, exist_ok=True)
os.makedirs(thumbs_dir, exist_ok=True)

# Path to FFmpeg binary from imageio_ffmpeg
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load Wallet Screens
usd_screen = Image.open(os.path.join(screens_dir, "usd_wallet.png")).convert("RGBA")
ngn_screen = Image.open(os.path.join(screens_dir, "ngn_wallet.png")).convert("RGBA")
ghs_screen = Image.open(os.path.join(screens_dir, "ghs_wallet.png")).convert("RGBA")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 18.5
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 555 frames

# Fonts
try:
    font_hero = ImageFont.truetype("arialbd.ttf", 64)
    font_title = ImageFont.truetype("arialbd.ttf", 52)
    font_sub = ImageFont.truetype("arialbd.ttf", 38)
    font_body = ImageFont.truetype("arial.ttf", 32)
except Exception:
    font_hero = ImageFont.load_default()
    font_title = font_hero
    font_sub = font_hero
    font_body = font_hero

# Create Animated Background Frame with Radial Particles Glow
def draw_background(draw, frame_idx):
    # Dark navy radial background
    # Add subtle floating glow particles
    t = frame_idx / FPS
    cx1 = int(540 + 150 * np.sin(t * 1.5))
    cy1 = int(700 + 100 * np.cos(t * 1.2))
    cx2 = int(540 + 200 * np.cos(t * 1.8))
    cy2 = int(1200 + 150 * np.sin(t * 1.4))

    # Glow dots
    draw.ellipse([(cx1 - 250, cy1 - 250), (cx1 + 250, cy1 + 250)], fill=(37, 99, 235, 15)) # Blue glow
    draw.ellipse([(cx2 - 300, cy2 - 300), (cx2 + 300, cy2 + 300)], fill=(124, 58, 237, 12)) # Purple glow

# Helper: Draw Text with Shadow (High Legibility & Safe Area Protected)
def draw_text_with_shadow(draw, text, x, y, font, text_color=(255, 255, 255, 255), shadow_color=(0, 0, 0, 220), offset=4):
    draw.text((x + offset, y + offset), text, fill=shadow_color, font=font)
    draw.text((x, y), text, fill=text_color, font=font)

# Helper: Draw Banner Card for On-Screen Text
def draw_text_banner(draw, text, y_center, font, bg_color=(15, 23, 42, 230), border_color=(59, 130, 246, 255)):
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px, py = 40, 20
    x1, y1 = (WIDTH - tw) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + tw) // 2 + px, y_center + th // 2 + py
    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=20, fill=bg_color, outline=border_color, width=2)
    draw.text(((WIDTH - tw) // 2, y_center - th // 2 - 4), text, fill=(255, 255, 255, 255), font=font)

# Helper: Render Screen Image with Scale, Rotation, Opacity, Offset
def paste_screen(base_canvas, screen_img, scale=0.45, center_x=540, center_y=960, alpha=1.0, shadow=True):
    w, h = screen_img.size
    nw, nh = int(w * scale), int(h * scale)
    resized = screen_img.resize((nw, nh), Image.Resampling.LANCZOS)
    
    if alpha < 1.0:
        r, g, b, a = resized.split()
        a = a.point(lambda p: int(p * alpha))
        resized = Image.merge("RGBA", (r, g, b, a))

    x = center_x - nw // 2
    y = center_y - nh // 2

    if shadow and alpha > 0.3:
        shadow_box = Image.new("RGBA", (nw + 20, nh + 20), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_box)
        sdraw.rounded_rectangle([(10, 10), (nw + 10, nh + 10)], radius=24, fill=(0, 0, 0, 120))
        base_canvas.paste(shadow_box, (x - 10, y - 5), shadow_box)

    base_canvas.paste(resized, (x, y), resized)

# Core Video Frame Rendering Engine
def generate_raw_video(hook_type="master", output_raw_mp4="raw_temp.mp4"):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_raw_mp4, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Generating frames for hook: {hook_type} ({TOTAL_FRAMES} frames)...")

    for f_idx in range(TOTAL_FRAMES):
        t = f_idx / FPS

        # Create canvas
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (6, 7, 19, 255))
        draw = ImageDraw.Draw(canvas)
        draw_background(draw, f_idx)

        # ---------------------------------------------------------------------
        # SCENE 1 (0.00s - 2.00s | Frames 0 to 60): Immediate USD Wallet Hook
        # ---------------------------------------------------------------------
        if f_idx < 60:
            progress = f_idx / 60.0
            scale = 0.42 + 0.05 * progress # Subtle cinematic zoom
            paste_screen(canvas, usd_screen, scale=scale, center_x=540, center_y=940, shadow=True)

            # On-Screen Hook Text Banner
            if hook_type == "master":
                hook_text = "I BUILT A FINTECH APP."
            elif hook_type == "hook_a":
                hook_text = "WHY USE 3 DIFFERENT WALLETS?"
            elif hook_type == "hook_b":
                hook_text = "ONE WALLET FOR NGN, USD & GHS?"
            else:
                hook_text = "BUILT FOR MULTI-CURRENCY USERS."

            # Top Header (Safe Area y=280)
            draw_text_banner(draw, hook_text, 280, font_hero, bg_color=(15, 23, 42, 240), border_color=(59, 130, 246, 255))
            
            # Product Badge Subtitle (Safe Area y=1660)
            draw_text_banner(draw, "REAL NOTESTANDARD PRODUCT DEMO", 1660, font_sub, bg_color=(16, 22, 38, 220), border_color=(16, 185, 129, 200))

        # ---------------------------------------------------------------------
        # SCENE 2 (2.00s - 4.00s | Frames 60 to 120): NGN Wallet Screen
        # ---------------------------------------------------------------------
        elif f_idx < 120:
            progress = (f_idx - 60) / 60.0
            # Slide in from right
            cx = int(1400 - 860 * progress) if progress < 0.2 else 540
            paste_screen(canvas, ngn_screen, scale=0.45, center_x=cx, center_y=940, shadow=True)

            draw_text_banner(draw, "NGN 🇳🇬", 280, font_hero, bg_color=(6, 78, 59, 230), border_color=(16, 185, 129, 255))
            draw_text_banner(draw, "NIGERIAN NAIRA WALLET", 1660, font_sub, bg_color=(15, 23, 42, 220), border_color=(16, 185, 129, 200))

        # ---------------------------------------------------------------------
        # SCENE 3 (4.00s - 6.00s | Frames 120 to 180): USD Wallet Screen
        # ---------------------------------------------------------------------
        elif f_idx < 180:
            progress = (f_idx - 120) / 60.0
            # Slide in up
            cy = int(1400 - 460 * progress) if progress < 0.2 else 940
            paste_screen(canvas, usd_screen, scale=0.45, center_x=540, center_y=cy, shadow=True)

            draw_text_banner(draw, "USD 🇺🇸", 280, font_hero, bg_color=(30, 58, 138, 230), border_color=(59, 130, 246, 255))
            draw_text_banner(draw, "US DOLLAR WALLET", 1660, font_sub, bg_color=(15, 23, 42, 220), border_color=(59, 130, 246, 200))

        # ---------------------------------------------------------------------
        # SCENE 4 (6.00s - 8.00s | Frames 180 to 240): GHS Wallet Screen
        # ---------------------------------------------------------------------
        elif f_idx < 240:
            progress = (f_idx - 180) / 60.0
            # Slide in from left
            cx = int(-300 + 840 * progress) if progress < 0.2 else 540
            paste_screen(canvas, ghs_screen, scale=0.45, center_x=cx, center_y=940, shadow=True)

            draw_text_banner(draw, "GHS 🇬🇭", 280, font_hero, bg_color=(20, 83, 45, 230), border_color=(34, 197, 94, 255))
            draw_text_banner(draw, "GHANAIAN CEDI WALLET", 1660, font_sub, bg_color=(15, 23, 42, 220), border_color=(34, 197, 94, 200))

        # ---------------------------------------------------------------------
        # SCENE 5 (8.00s - 11.00s | Frames 240 to 330): 3D Parallax Montage
        # ---------------------------------------------------------------------
        elif f_idx < 330:
            progress = (f_idx - 240) / 90.0
            osc = np.sin(progress * np.pi * 2) * 20

            # Card 1: NGN (Left/Back)
            paste_screen(canvas, ngn_screen, scale=0.35, center_x=int(280 + osc), center_y=int(940 - osc), shadow=True)
            # Card 3: GHS (Right/Back)
            paste_screen(canvas, ghs_screen, scale=0.35, center_x=int(800 - osc), center_y=int(940 + osc), shadow=True)
            # Card 2: USD (Center/Front)
            paste_screen(canvas, usd_screen, scale=0.40, center_x=540, center_y=940, shadow=True)

            draw_text_banner(draw, "THREE CURRENCIES.", 280, font_hero, bg_color=(15, 23, 42, 240), border_color=(59, 130, 246, 255))
            draw_text_banner(draw, "NGN 🇳🇬 • USD 🇺🇸 • GHS 🇬🇭", 1660, font_sub, bg_color=(16, 22, 38, 220), border_color=(16, 185, 129, 200))

        # ---------------------------------------------------------------------
        # SCENE 6 (11.00s - 14.00s | Frames 330 to 420): Real Wallet Action Focus
        # ---------------------------------------------------------------------
        elif f_idx < 420:
            sub_step = f_idx - 330
            paste_screen(canvas, usd_screen, scale=0.45, center_x=540, center_y=940, shadow=True)

            # Action button highlights (0.75s each: 22.5 frames)
            if sub_step < 22:
                act_label = "1. DEPOSIT"
                highlight_rect = [(320, 1020), (520, 1100)] # Deposit button focus
            elif sub_step < 45:
                act_label = "2. WITHDRAW"
                highlight_rect = [(560, 1020), (760, 1100)] # Withdraw button focus
            elif sub_step < 67:
                act_label = "3. SEND"
                highlight_rect = [(320, 1120), (520, 1200)] # Send button focus
            else:
                act_label = "4. CONVERT"
                highlight_rect = [(560, 1120), (760, 1200)] # Convert button focus

            # Pulsing cyan highlight ring over active action button
            draw.rectangle(highlight_rect, outline=(34, 211, 238, 255), width=6)

            draw_text_banner(draw, "DEPOSIT • WITHDRAW • SEND • CONVERT", 280, font_hero, bg_color=(15, 23, 42, 240), border_color=(34, 211, 238, 255))
            draw_text_banner(draw, f"ACTIVE FEATURE: {act_label}", 1660, font_sub, bg_color=(16, 22, 38, 220), border_color=(34, 211, 238, 200))

        # ---------------------------------------------------------------------
        # SCENE 7 (14.00s - 17.00s | Frames 420 to 510): Composition & Transition
        # ---------------------------------------------------------------------
        elif f_idx < 510:
            sub_step = f_idx - 420
            paste_screen(canvas, ngn_screen, scale=0.36, center_x=340, center_y=920, shadow=True)
            paste_screen(canvas, ghs_screen, scale=0.36, center_x=740, center_y=920, shadow=True)
            paste_screen(canvas, usd_screen, scale=0.40, center_x=540, center_y=960, shadow=True)

            txt = "ONE WALLET." if sub_step < 45 else "THREE CURRENCIES."
            draw_text_banner(draw, txt, 280, font_hero, bg_color=(15, 23, 42, 240), border_color=(59, 130, 246, 255))
            draw_text_banner(draw, "ALL IN ONE DIGITAL WALLET", 1660, font_sub, bg_color=(16, 22, 38, 220), border_color=(16, 185, 129, 200))

        # ---------------------------------------------------------------------
        # SCENE 8 (17.00s - 18.50s | Frames 510 to 555): NoteStandard Brand Reveal & CTA
        # ---------------------------------------------------------------------
        else:
            # Background product backdrop
            paste_screen(canvas, usd_screen, scale=0.35, center_x=540, center_y=940, alpha=0.35, shadow=False)

            # Central Brand Reveal Card
            draw.rounded_rectangle([(100, 480), (980, 1440)], radius=36, fill=(15, 23, 42, 245), outline=(59, 130, 246, 255), width=4)

            # Logo & Brand Name
            draw_text_with_shadow(draw, "NoteStandard", 290, 560, font_hero, text_color=(255, 255, 255, 255))
            draw.line([(240, 670), (840, 670)], fill=(59, 130, 246, 200), width=3)

            # Tagline
            draw_text_with_shadow(draw, "ONE WALLET. THREE CURRENCIES.", 160, 720, font_sub, text_color=(59, 130, 246, 255))
            draw_text_with_shadow(draw, "🇳🇬 NGN   🇺🇸 USD   🇬🇭 GHS", 270, 800, font_title, text_color=(16, 185, 129, 255))

            # Website Link
            draw.rounded_rectangle([(180, 920), (900, 1040)], radius=24, fill=(30, 58, 138, 255), outline=(96, 165, 250, 255), width=3)
            draw_text_with_shadow(draw, "www.notestandard.com", 240, 955, font_title, text_color=(255, 255, 255, 255))

            # Call To Action (CTA)
            draw_text_banner(draw, "WOULD YOU USE IT? 👇", 1200, font_hero, bg_color=(6, 78, 59, 240), border_color=(16, 185, 129, 255))

            # Secondary CTA
            draw_text_with_shadow(draw, "Follow the journey • Link in bio", 310, 1330, font_body, text_color=(180, 195, 215, 255))

        # Convert PIL RGBA to OpenCV BGR
        frame_bgr = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGBA2BGR)
        out.write(frame_bgr)

    out.release()
    print(f"Raw video generated successfully: {output_raw_mp4}")

# Combine Video + Audio using FFmpeg
def finalize_video_with_audio(raw_mp4, audio_mp3, final_mp4):
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", raw_mp4,
        "-i", audio_mp3,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        final_mp4
    ]
    print(f"Muxing video & audio to {final_mp4}...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"SUCCESS: Created final MP4 -> {final_mp4}")
    else:
        print(f"FFmpeg error: {res.stderr.decode('utf-8', errors='ignore')}")

# Render 1080x1920 Cover Thumbnail
def create_cover_thumbnail():
    thumb_path = os.path.join(thumbs_dir, "notestandard-video-01-cover.png")
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (6, 7, 19, 255))
    draw = ImageDraw.Draw(canvas)
    draw_background(draw, 0)

    # 3-Wallet composition
    paste_screen(canvas, ngn_screen, scale=0.38, center_x=300, center_y=980, shadow=True)
    paste_screen(canvas, ghs_screen, scale=0.38, center_x=780, center_y=980, shadow=True)
    paste_screen(canvas, usd_screen, scale=0.44, center_x=540, center_y=1040, shadow=True)

    # Title Banner
    draw_text_banner(draw, "ONE WALLET.", 240, font_hero, bg_color=(15, 23, 42, 240), border_color=(59, 130, 246, 255))
    draw_text_banner(draw, "THREE CURRENCIES.", 340, font_hero, bg_color=(15, 23, 42, 240), border_color=(59, 130, 246, 255))

    # Subheading
    draw_text_banner(draw, "NGN 🇳🇬 • USD 🇺🇸 • GHS 🇬🇭", 1540, font_sub, bg_color=(16, 22, 38, 230), border_color=(16, 185, 129, 255))

    # Website
    draw_text_banner(draw, "www.notestandard.com", 1680, font_title, bg_color=(30, 58, 138, 240), border_color=(96, 165, 250, 255))

    canvas.save(thumb_path)
    print(f"Cover thumbnail saved -> {thumb_path}")

# MAIN RENDER WORKFLOW
if __name__ == "__main__":
    # 1. Thumbnail
    create_cover_thumbnail()

    # 2. Master Video
    raw_master = "temp_master_raw.mp4"
    generate_raw_video(hook_type="master", output_raw_mp4=raw_master)
    finalize_video_with_audio(raw_master, os.path.join(audio_dir, "vo_master.mp3"), os.path.join(exports_dir, "notestandard-video-01-master.mp4"))

    # 3. Hook A Video
    raw_hook_a = "temp_hook_a_raw.mp4"
    generate_raw_video(hook_type="hook_a", output_raw_mp4=raw_hook_a)
    finalize_video_with_audio(raw_hook_a, os.path.join(audio_dir, "vo_hook_a.mp3"), os.path.join(exports_dir, "notestandard-video-01-hook-a.mp4"))

    # 4. Hook B Video
    raw_hook_b = "temp_hook_b_raw.mp4"
    generate_raw_video(hook_type="hook_b", output_raw_mp4=raw_hook_b)
    finalize_video_with_audio(raw_hook_b, os.path.join(audio_dir, "vo_hook_b.mp3"), os.path.join(exports_dir, "notestandard-video-01-hook-b.mp4"))

    # 5. Hook C Video
    raw_hook_c = "temp_hook_c_raw.mp4"
    generate_raw_video(hook_type="hook_c", output_raw_mp4=raw_hook_c)
    finalize_video_with_audio(raw_hook_c, os.path.join(audio_dir, "vo_hook_c.mp3"), os.path.join(exports_dir, "notestandard-video-01-hook-c.mp4"))

    # Cleanup temp raw files
    for temp in [raw_master, raw_hook_a, raw_hook_b, raw_hook_c]:
        if os.path.exists(temp):
            os.remove(temp)

    print("\nALL VIDEO EXPORTS RENDERED SUCCESSFULLY!")
