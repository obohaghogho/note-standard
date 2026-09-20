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

# Path to FFmpeg binary
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\node_modules\ffmpeg-static\ffmpeg.exe"

print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load REAL NoteStandard Screens strictly from assets/screens/
def load_screen(filename):
    path = os.path.join(screens_dir, filename)
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    print(f"Warning: {filename} not found, generating placeholder frame")
    return Image.new("RGBA", (1080, 1920), (13, 18, 29, 255))

screen_hook_wallet = load_screen("hook_wallet.png")
screen_ngn = load_screen("ngn_wallet.png")
screen_usd = load_screen("usd_wallet.png")
screen_ghs = load_screen("ghs_wallet.png")
screen_bank = load_screen("bank_transfer.png")
screen_brand = load_screen("ending_brand.png")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 10.5
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 315 frames

# Fonts
try:
    font_hero = ImageFont.truetype("arialbd.ttf", 64)
    font_title = ImageFont.truetype("arialbd.ttf", 52)
    font_sub = ImageFont.truetype("arialbd.ttf", 40)
except Exception:
    font_hero = ImageFont.load_default()
    font_title = font_hero
    font_sub = font_hero

# Draw Background (Clean, simple dark radial gradient background with subtle progress bar)
def draw_background(draw, frame_idx):
    # Top Progress Bar
    prog = frame_idx / float(TOTAL_FRAMES)
    bar_w = int(WIDTH * prog)
    draw.rectangle([(0, 0), (bar_w, 14)], fill=(16, 185, 129, 255))

# Helper: Draw Text Banner (Large Mobile Typography)
def draw_text_banner(draw, text, y_center, font, bg_color=(0, 0, 0, 240), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255)):
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px, py = 45, 24
    x1, y1 = (WIDTH - tw) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + tw) // 2 + px, y_center + th // 2 + py
    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=28, fill=bg_color, outline=border_color, width=4)
    draw.text(((WIDTH - tw) // 2, y_center - th // 2 - 4), text, fill=text_color, font=font)

# Helper: Paste Real Screen Screenshot
def paste_real_screen(base_canvas, screen_img, scale=0.88, center_x=540, center_y=1120):
    w, h = screen_img.size
    nw, nh = int(w * scale), int(h * scale)
    resized = screen_img.resize((nw, nh), Image.Resampling.LANCZOS)
    x = center_x - nw // 2
    y = center_y - nh // 2

    # Subtle drop shadow
    shadow_box = Image.new("RGBA", (nw + 30, nh + 30), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_box)
    sdraw.rounded_rectangle([(15, 15), (nw + 15, nh + 15)], radius=32, fill=(0, 0, 0, 160))
    base_canvas.paste(shadow_box, (x - 15, y - 8), shadow_box)

    base_canvas.paste(resized, (x, y), resized)

# Core Video Frame Generator
def generate_raw_video(output_raw_mp4="raw_tiktok3.mp4"):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_raw_mp4, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Generating Revised TikTok Video #3 frames ({TOTAL_FRAMES} frames)...")

    # Frame thresholds
    f_hook = int(FPS * 1.2)   # Frame 36
    f_reveal = int(FPS * 2.5) # Frame 75
    f_proof = int(FPS * 4.5)  # Frame 135
    f_place = int(FPS * 7.0)  # Frame 210
    f_brand = int(FPS * 9.0)  # Frame 270

    for f_idx in range(TOTAL_FRAMES):
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (7, 10, 18, 255))
        draw = ImageDraw.Draw(canvas)
        draw_background(draw, f_idx)

        # ---------------------------------------------------------------------
        # 0.0s – 1.2s (Frames 0 to 36): CLEAN HOOK (No fake UI)
        # ---------------------------------------------------------------------
        if f_idx < f_hook:
            draw_text_banner(draw, "WHY USE 3 MONEY APPS?", 960, font_hero, bg_color=(0, 0, 0, 245), border_color=(254, 44, 85, 255))

        # ---------------------------------------------------------------------
        # 1.2s – 2.5s (Frames 36 to 75): REAL NOTE STANDARD WALLET REVEAL
        # ---------------------------------------------------------------------
        elif f_idx < f_reveal:
            draw_text_banner(draw, "ONE WALLET.", 280, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))
            paste_real_screen(canvas, screen_hook_wallet, scale=0.88, center_x=540, center_y=1120)

        # ---------------------------------------------------------------------
        # 2.5s – 4.5s (Frames 75 to 135): REAL CURRENCY PROOF (NGN • USD • GHS)
        # ---------------------------------------------------------------------
        elif f_idx < f_proof:
            draw_text_banner(draw, "NGN 🇳🇬 • USD 🇺🇸 • GHS 🇬🇭", 280, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))
            
            sub_idx = (f_idx - f_reveal) // 20
            if sub_idx == 0:
                paste_real_screen(canvas, screen_ngn, scale=0.88, center_x=540, center_y=1120)
            elif sub_idx == 1:
                paste_real_screen(canvas, screen_usd, scale=0.88, center_x=540, center_y=1120)
            else:
                paste_real_screen(canvas, screen_ghs, scale=0.88, center_x=540, center_y=1120)

        # ---------------------------------------------------------------------
        # 4.5s – 7.0s (Frames 135 to 210): REAL PRODUCT INTERACTION
        # ---------------------------------------------------------------------
        elif f_idx < f_place:
            draw_text_banner(draw, "ALL IN ONE PLACE.", 280, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))
            paste_real_screen(canvas, screen_bank, scale=0.88, center_x=540, center_y=1120)

        # ---------------------------------------------------------------------
        # 7.0s – 9.0s (Frames 210 to 270): BRAND REVEAL
        # ---------------------------------------------------------------------
        elif f_idx < f_brand:
            draw_text_banner(draw, "NOTE STANDARD", 280, font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))
            paste_real_screen(canvas, screen_brand, scale=0.88, center_x=540, center_y=1120)

        # ---------------------------------------------------------------------
        # 9.0s – 10.5s (Frames 270 to 315): CLEAN CTA FINAL FRAME
        # ---------------------------------------------------------------------
        else:
            draw_text_banner(draw, "WOULD YOU USE IT?", 960, font_hero, bg_color=(30, 58, 138, 245), border_color=(59, 130, 246, 255))

        # Save frame
        pil_rgb = canvas.convert("RGB")
        frame_np = cv2.cvtColor(np.array(pil_rgb), cv2.COLOR_RGB2BGR)
        out.write(frame_np)

    out.release()
    print("Raw video 3 generated successfully!")

# Finalize to exports directory with voiceover audio track
def finalize_video():
    raw_mp4 = "raw_tiktok3.mp4"
    audio_wav = os.path.join(audio_dir, "vo_tiktok3_full.wav")
    final_output_mp4 = os.path.join(exports_dir, "notestandard_tiktok_video_3.mp4")

    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", raw_mp4,
        "-i", audio_wav,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        final_output_mp4
    ]

    print(f"Encoding final TikTok Video #3 with Voiceover Audio into exports: {final_output_mp4}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"[SUCCESS] Revised TikTok Video #3 (with Voiceover) saved to: {final_output_mp4}")
    else:
        print("FFmpeg error:", res.stderr.decode("utf-8"))

if __name__ == "__main__":
    generate_raw_video()
    finalize_video()

