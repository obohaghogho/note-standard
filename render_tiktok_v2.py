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
    ffmpeg_exe = "ffmpeg"

print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load Screens
hook_screen = Image.open(os.path.join(screens_dir, "hook_crypto.png")).convert("RGBA")
swap_screen = Image.open(os.path.join(screens_dir, "swap_anim.png")).convert("RGBA")
ngn_screen = Image.open(os.path.join(screens_dir, "ngn_credited.png")).convert("RGBA")
bank_screen = Image.open(os.path.join(screens_dir, "bank_transfer.png")).convert("RGBA")
brand_screen = Image.open(os.path.join(screens_dir, "ending_idea.png")).convert("RGBA")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 19.0
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 570 frames

# Fonts
try:
    font_hero = ImageFont.truetype("arialbd.ttf", 56)
    font_title = ImageFont.truetype("arialbd.ttf", 48)
    font_sub = ImageFont.truetype("arialbd.ttf", 36)
    font_body = ImageFont.truetype("arial.ttf", 30)
except Exception:
    font_hero = ImageFont.load_default()
    font_title = font_hero
    font_sub = font_hero
    font_body = font_hero

# Create Animated Background with Dynamic Particle Glow
def draw_background(draw, frame_idx):
    t = frame_idx / FPS
    cx1 = int(540 + 180 * np.sin(t * 1.6))
    cy1 = int(600 + 120 * np.cos(t * 1.3))
    cx2 = int(540 + 220 * np.cos(t * 1.9))
    cy2 = int(1300 + 160 * np.sin(t * 1.5))

    # Glow dots
    draw.ellipse([(cx1 - 280, cy1 - 280), (cx1 + 280, cy1 + 280)], fill=(37, 99, 235, 20)) # Blue glow
    draw.ellipse([(cx2 - 320, cy2 - 320), (cx2 + 320, cy2 + 320)], fill=(168, 85, 247, 18)) # Purple glow

    # Top Progress Bar
    prog = frame_idx / float(TOTAL_FRAMES)
    bar_w = int(WIDTH * prog)
    draw.rectangle([(0, 0), (bar_w, 10)], fill=(16, 185, 129, 255))

# Helper: Draw Text Banner
def draw_text_banner(draw, text, y_center, font, bg_color=(15, 23, 42, 245), border_color=(59, 130, 246, 255), text_color=(255, 255, 255, 255)):
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px, py = 45, 22
    x1, y1 = (WIDTH - tw) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + tw) // 2 + px, y_center + th // 2 + py
    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=24, fill=bg_color, outline=border_color, width=3)
    draw.text(((WIDTH - tw) // 2, y_center - th // 2 - 4), text, fill=text_color, font=font)

# Helper: Paste Screen
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
        shadow_box = Image.new("RGBA", (nw + 24, nh + 24), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_box)
        sdraw.rounded_rectangle([(12, 12), (nw + 12, nh + 12)], radius=28, fill=(0, 0, 0, 140))
        base_canvas.paste(shadow_box, (x - 12, y - 6), shadow_box)

    base_canvas.paste(resized, (x, y), resized)

# Core Video Frame Generator
def generate_raw_video(output_raw_mp4="raw_tiktok2.mp4"):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_raw_mp4, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Generating TikTok Video #2 frames ({TOTAL_FRAMES} frames)...")

    for f_idx in range(TOTAL_FRAMES):
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (6, 7, 19, 255))
        draw = ImageDraw.Draw(canvas)
        draw_background(draw, f_idx)

        # ---------------------------------------------------------------------
        # SCENE 1 (0.00s - 2.50s | Frames 0 to 75): Aggressive Immediate Hook
        # ---------------------------------------------------------------------
        if f_idx < 75:
            progress = f_idx / 75.0
            scale = 0.43 + 0.03 * np.sin(progress * np.pi) # Gentle zoom
            paste_screen(canvas, hook_screen, scale=scale, center_x=540, center_y=960, shadow=True)

            # Hook Banner at 0.0s
            draw_text_banner(draw, "WATCH CRYPTO BECOME NAIRA.", 260, font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))
            draw_text_banner(draw, "CRYPTO", 1680, font_title, bg_color=(88, 28, 135, 230), border_color=(168, 85, 247, 255))

        # ---------------------------------------------------------------------
        # SCENE 2 (2.50s - 5.50s | Frames 75 to 165): Crypto -> Swap
        # ---------------------------------------------------------------------
        elif f_idx < 165:
            progress = (f_idx - 75) / 90.0
            scale = 0.44 + 0.02 * np.sin(progress * np.pi)
            paste_screen(canvas, swap_screen, scale=scale, center_x=540, center_y=960, shadow=True)

            draw_text_banner(draw, "WATCH CRYPTO BECOME NAIRA.", 260, font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))
            draw_text_banner(draw, "SWAP", 1680, font_title, bg_color=(30, 58, 138, 230), border_color=(59, 130, 246, 255))

        # ---------------------------------------------------------------------
        # SCENE 3 (5.50s - 9.50s | Frames 165 to 285): Swap -> NGN Credited
        # ---------------------------------------------------------------------
        elif f_idx < 285:
            progress = (f_idx - 165) / 120.0
            scale = 0.44 + 0.02 * progress
            paste_screen(canvas, ngn_screen, scale=scale, center_x=540, center_y=960, shadow=True)

            draw_text_banner(draw, "GET NAIRA.", 260, font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))
            draw_text_banner(draw, "NGN", 1680, font_title, bg_color=(6, 78, 59, 230), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # SCENE 4 (9.50s - 14.50s | Frames 285 to 435): Send to Bank
        # ---------------------------------------------------------------------
        elif f_idx < 435:
            progress = (f_idx - 285) / 150.0
            scale = 0.44 + 0.02 * np.sin(progress * np.pi)
            paste_screen(canvas, bank_screen, scale=scale, center_x=540, center_y=960, shadow=True)

            draw_text_banner(draw, "SEND IT TO YOUR BANK.", 260, font_hero, bg_color=(120, 53, 15, 245), border_color=(245, 158, 11, 255))
            draw_text_banner(draw, "BANK", 1680, font_title, bg_color=(120, 53, 15, 230), border_color=(245, 158, 11, 255))

        # ---------------------------------------------------------------------
        # SCENE 5 (14.50s - 19.00s | Frames 435 to 570): Ending Brand Idea
        # ---------------------------------------------------------------------
        else:
            progress = (f_idx - 435) / 135.0
            scale = 0.45 + 0.02 * progress
            paste_screen(canvas, brand_screen, scale=scale, center_x=540, center_y=960, shadow=True)

            draw_text_banner(draw, "ONE WALLET. THAT'S THE IDEA.", 260, font_hero, bg_color=(30, 58, 138, 245), border_color=(59, 130, 246, 255))
            draw_text_banner(draw, "NOTESTANDARD", 1680, font_title, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))

        # Save frame to OpenCV VideoWriter format
        pil_rgb = canvas.convert("RGB")
        frame_np = cv2.cvtColor(np.array(pil_rgb), cv2.COLOR_RGB2BGR)
        out.write(frame_np)

        if (f_idx + 1) % 150 == 0 or (f_idx + 1) == TOTAL_FRAMES:
            print(f"Rendered {f_idx + 1}/{TOTAL_FRAMES} frames...")

    out.release()
    print("Raw video generated successfully!")

# Combine Video + Audio using FFmpeg
def finalize_video():
    raw_mp4 = "raw_tiktok2.mp4"
    audio_mp3 = os.path.join(audio_dir, "vo_tiktok2_full.mp3")
    final_output = os.path.join(exports_dir, "notestandard_tiktok_video_2.mp4")

    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", raw_mp4,
        "-i", audio_mp3,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        final_output
    ]

    print("Encoding final production video with H.264 & AAC audio...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"[SUCCESS] Final TikTok Video #2 rendered successfully: {final_output}")
    else:
        print("Error during FFmpeg encoding:", res.stderr.decode("utf-8"))

    # Save separate TikTok cover/thumbnail image frame
    thumb_path = os.path.join(thumbs_dir, "tiktok_video_2_cover.png")
    hook_screen.save(thumb_path)
    print(f"Saved separate TikTok cover frame to: {thumb_path}")

if __name__ == "__main__":
    generate_raw_video()
    finalize_video()

