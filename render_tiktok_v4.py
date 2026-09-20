import os
import cv2
import numpy as np
import subprocess
from PIL import Image, ImageDraw, ImageFont

# Project & Asset Paths
root_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social"
screens_dir = os.path.join(root_dir, "assets", "screens")
audio_dir = os.path.join(root_dir, "audio")
exports_dir = os.path.join(root_dir, "exports")
thumbs_dir = os.path.join(root_dir, "thumbnails")

os.makedirs(exports_dir, exist_ok=True)
os.makedirs(thumbs_dir, exist_ok=True)

# Locate FFmpeg binary
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\node_modules\ffmpeg-static\ffmpeg.exe"

print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load REAL NoteStandard Screens
def load_screen(filename):
    path = os.path.join(screens_dir, filename)
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    raise FileNotFoundError(f"Required real screen {filename} not found at {path}!")

screen_overview = load_screen("v4_wallet_overview.png")
screen_ngn      = load_screen("v4_ngn_wallet.png")
screen_usd      = load_screen("v4_usd_wallet.png")
screen_ghs      = load_screen("v4_ghs_wallet.png")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 10.5
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 315 frames

# Load TrueType Fonts safely
font_dir = r"C:\Windows\Fonts"
try:
    font_hero = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 52)
    font_sub = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 38)
    font_small = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 30)
except Exception:
    font_hero = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 52)
    font_sub = ImageFont.truetype(os.path.join(font_dir, "arial.ttf"), 38)
    font_small = ImageFont.truetype(os.path.join(font_dir, "arial.ttf"), 30)

# Draw Top Progress Bar
def draw_progress_bar(draw, frame_idx):
    prog = frame_idx / float(TOTAL_FRAMES)
    bar_w = int(WIDTH * prog)
    draw.rectangle([(0, 0), (bar_w, 12)], fill=(16, 185, 129, 255))

# Draw Text Banner (Modern, High-Contrast Glassmorphic Card for TikTok readability)
def draw_text_banner(draw, text, y_center, font, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255)):
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px, py = 45, 22
    x1, y1 = (WIDTH - tw) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + tw) // 2 + px, y_center + th // 2 + py
    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=24, fill=bg_color, outline=border_color, width=4)
    draw.text(((WIDTH - tw) // 2, y_center - th // 2 - 4), text, fill=text_color, font=font)

# Helper: Paste Real Screen Screenshot inside a phone mock frame with shadow
def paste_real_screen(base_canvas, screen_img, scale=0.82, center_x=540, center_y=1080):
    w, h = screen_img.size
    nw, nh = int(w * scale), int(h * scale)
    resized = screen_img.resize((nw, nh), Image.Resampling.LANCZOS)
    x = center_x - nw // 2
    y = center_y - nh // 2

    # Drop shadow box
    shadow_box = Image.new("RGBA", (nw + 36, nh + 36), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_box)
    sdraw.rounded_rectangle([(18, 18), (nw + 18, nh + 18)], radius=36, fill=(0, 0, 0, 180))
    base_canvas.paste(shadow_box, (x - 18, y - 9), shadow_box)

    # Screen container border
    frame_box = Image.new("RGBA", (nw + 12, nh + 12), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(frame_box)
    fdraw.rounded_rectangle([(0, 0), (nw + 11, nh + 11)], radius=32, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=3)
    base_canvas.paste(frame_box, (x - 6, y - 6), frame_box)

    base_canvas.paste(resized, (x, y), resized)

# Core Video Frame Generator
def generate_raw_video(output_raw_mp4="raw_tiktok4.mp4"):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_raw_mp4, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Generating TikTok Video #4 frames ({TOTAL_FRAMES} frames @ {FPS} FPS)...")

    # Second-by-second frame thresholds matching specs exactly:
    # 0.00 - 0.70s: Frames 0 to 21  (HOOK: "3 CURRENCIES.")
    # 0.70 - 1.80s: Frames 21 to 54 (REVEAL: "ONE WALLET." with zoom)
    # 1.80 - 3.30s: Frames 54 to 99 (NGN: "NGN 🇳🇬")
    # 3.30 - 4.80s: Frames 99 to 144 (USD: "USD 🇺🇸")
    # 4.80 - 6.30s: Frames 144 to 189 (GHS: "GHS 🇬🇭")
    # 6.30 - 8.00s: Frames 189 to 240 (THE PAYOFF: "NO MORE SWITCHING.")
    # 8.00 - 9.50s: Frames 240 to 285 (BRAND: "THIS IS NOTESTANDARD.")
    # 9.50 - 10.50s: Frames 285 to 315 (CTA: "Would you use it? 👀")

    f_hook   = int(FPS * 0.70) # 21
    f_reveal = int(FPS * 1.80) # 54
    f_ngn    = int(FPS * 3.30) # 99
    f_usd    = int(FPS * 4.80) # 144
    f_ghs    = int(FPS * 6.30) # 189
    f_payoff = int(FPS * 8.00) # 240
    f_brand  = int(FPS * 9.50) # 285

    for f_idx in range(TOTAL_FRAMES):
        # Dark clean background (#0b0f19)
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)
        draw_progress_bar(draw, f_idx)

        # ---------------------------------------------------------------------
        # 0.00s – 0.70s (Frames 0 to 21): HOOK ("3 CURRENCIES.")
        # REAL APP VISIBLE IN THE VERY FIRST FRAME! NO BLACK INTRO!
        # ---------------------------------------------------------------------
        if f_idx < f_hook:
            paste_real_screen(canvas, screen_overview, scale=0.82, center_x=540, center_y=1080)
            draw_text_banner(draw, "3 CURRENCIES.", 280, font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255))

        # ---------------------------------------------------------------------
        # 0.70s – 1.80s (Frames 21 to 54): REVEAL ("ONE WALLET.")
        # Fast smooth zoom toward wallet section
        # ---------------------------------------------------------------------
        elif f_idx < f_reveal:
            zoom_prog = (f_idx - f_hook) / float(f_reveal - f_hook)
            current_scale = 0.82 + (0.08 * zoom_prog) # Smooth zoom from 0.82 to 0.90
            paste_real_screen(canvas, screen_overview, scale=current_scale, center_x=540, center_y=1080)
            draw_text_banner(draw, "ONE WALLET.", 280, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # 1.80s – 3.30s (Frames 54 to 99): NGN WALLET ("NGN 🇳🇬")
        # ---------------------------------------------------------------------
        elif f_idx < f_ngn:
            paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "NGN 🇳🇬", 280, font_hero, bg_color=(30, 27, 75, 245), border_color=(99, 102, 241, 255))

        # ---------------------------------------------------------------------
        # 3.30s – 4.80s (Frames 99 to 144): USD WALLET ("USD 🇺🇸")
        # ---------------------------------------------------------------------
        elif f_idx < f_usd:
            paste_real_screen(canvas, screen_usd, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "USD 🇺🇸", 280, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # 4.80s – 6.30s (Frames 144 to 189): GHS WALLET ("GHS 🇬🇭")
        # ---------------------------------------------------------------------
        elif f_idx < f_ghs:
            paste_real_screen(canvas, screen_ghs, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "GHS 🇬🇭", 280, font_hero, bg_color=(66, 32, 6, 245), border_color=(234, 179, 8, 255))

        # ---------------------------------------------------------------------
        # 6.30s – 8.00s (Frames 189 to 240): THE PAYOFF ("NO MORE SWITCHING.")
        # Return to multi-currency wallet overview
        # ---------------------------------------------------------------------
        elif f_idx < f_payoff:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "NO MORE SWITCHING.", 280, font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # 8.00s – 9.50s (Frames 240 to 285): BRAND ("THIS IS NOTESTANDARD.")
        # ---------------------------------------------------------------------
        elif f_idx < f_brand:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "THIS IS NOTESTANDARD.", 280, font_hero, bg_color=(30, 58, 138, 245), border_color=(59, 130, 246, 255))

        # ---------------------------------------------------------------------
        # 9.50s – 10.50s (Frames 285 to 315): CTA ("Would you use it? 👀")
        # ---------------------------------------------------------------------
        else:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=1080)
            draw_text_banner(draw, "Would you use it? 👀", 280, font_hero, bg_color=(15, 23, 42, 245), border_color=(234, 179, 8, 255))
            draw_text_banner(draw, "Tell us below. 👇", 1540, font_sub, bg_color=(15, 23, 42, 230), border_color=(100, 116, 139, 255))

        # Write frame
        pil_rgb = canvas.convert("RGB")
        frame_np = cv2.cvtColor(np.array(pil_rgb), cv2.COLOR_RGB2BGR)
        out.write(frame_np)

    out.release()
    print("Raw Video #4 frames rendered and saved to raw_tiktok4.mp4 successfully!")

# Finalize Video with Audio track
def finalize_video():
    raw_mp4 = "raw_tiktok4.mp4"
    audio_wav = os.path.join(audio_dir, "vo_tiktok4_full.wav")
    final_output_mp4 = os.path.join(exports_dir, "notestandard_tiktok_video_4.mp4")
    root_output_mp4  = os.path.join(root_dir, "NoteStandard_TikTok_Video4.mp4")
    proj_output_mp4  = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video4.mp4"

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

    print(f"Encoding final TikTok Video #4 with audio: {final_output_mp4}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"[SUCCESS] TikTok Video #4 saved to: {final_output_mp4}")
        # Copy to project root locations for easy access
        import shutil
        shutil.copyfile(final_output_mp4, proj_output_mp4)
        print(f"[SUCCESS] Copied final video to project root: {proj_output_mp4}")
    else:
        print("FFmpeg error:", res.stderr.decode("utf-8"))

if __name__ == "__main__":
    generate_raw_video()
    finalize_video()
