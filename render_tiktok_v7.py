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

# Load REAL NoteStandard Video 7 Screens
def load_screen(filename):
    path = os.path.join(screens_dir, filename)
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    raise FileNotFoundError(f"Required real screen {filename} not found at {path}!")

screen_overview = load_screen("v6_wallet_overview.png")
screen_ngn      = load_screen("v6_ngn_wallet.png")
screen_usd      = load_screen("v6_usd_wallet.png")
screen_ghs      = load_screen("v6_ghs_wallet.png")

# Video 7 Specifications (Retention Experiment)
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 9.5
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 285 frames

# TrueType Fonts
font_dir = r"C:\Windows\Fonts"
try:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 52)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 40)
    font_cta   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 56)
except Exception:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 64)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 52)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 40)
    font_cta   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 56)

def draw_sparkle_icon(size=(46, 46)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size[0] // 2, size[1] // 2
    d.polygon([(cx, 2), (cx+6, cy-6), (size[0]-2, cy), (cx+6, cy+6), (cx, size[1]-2), (cx-6, cy+6), (2, cy), (cx-6, cy-6)], fill=(250, 204, 21, 255))
    return img

sparkle_icon_img = draw_sparkle_icon()

# Clean Text Banner positioned strictly in TikTok SAFE ZONE (y_center=1650)
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

def draw_stacked_text_banners(draw, base_canvas, text_line1, text_line2, y_center=1650, font=font_cta, bg_color=(15, 23, 42, 250), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255)):
    draw_clean_text_banner(draw, base_canvas, text_line1, y_center=y_center-54, font=font, bg_color=bg_color, border_color=border_color, text_color=text_color)
    draw_clean_text_banner(draw, base_canvas, text_line2, y_center=y_center+54, font=font_sub, bg_color=bg_color, border_color=(16, 185, 129, 255), text_color=(52, 211, 153, 255))

# Paste Real Screen Screenshot
def paste_real_screen(base_canvas, screen_img, scale=0.85, center_x=540, center_y=900, offset_x=0):
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

# User Tap Indicator Pulse
def draw_tap_indicator(draw, center_x, center_y, radius=32, alpha=180):
    draw.ellipse([(center_x - radius, center_y - radius), (center_x + radius, center_y + radius)], fill=(99, 102, 241, alpha), outline=(255, 255, 255, alpha), width=3)

# Render Video 7 with Direct FFmpeg Piping
def render_video_7():
    out_root = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video7.mp4"
    out_export = os.path.join(exports_dir, "NoteStandard_TikTok_Video7.mp4")

    # Standard stereo silent audio source filter to ensure standard MP4 AAC audio compliance
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgba",
        "-r", str(FPS),
        "-i", "-",  # Video frames piped via stdin
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",  # Clean silent audio track
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_export
    ]

    print(f"Piping {TOTAL_FRAMES} frames ({DURATION_SEC}s @ {FPS}FPS) to FFmpeg: {out_export}")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Keyframe indices (30 FPS)
    # 0.0 - 0.8s  (frames 0..23)   : HOOK - "Still switching between apps?" + immediate UI movement
    # 0.8 - 2.8s  (frames 24..83)  : PROOF - "NGN • USD • GHS" rapid wallet cuts
    # 2.8 - 5.2s  (frames 84..155) : DIFFERENCE - "All in one place."
    # 5.2 - 7.2s  (frames 156..215): PAYOFF - "Less app-hopping."
    # 7.2 - 9.5s  (frames 216..284): BRAND ENDING - NoteStandard / www.notestandard.com

    f_hook     = int(FPS * 0.8)  # 24
    f_proof    = int(FPS * 2.8)  # 84
    f_diff     = int(FPS * 5.2)  # 156
    f_payoff   = int(FPS * 7.2)  # 216
    f_brand    = TOTAL_FRAMES    # 285

    cover_frame_saved = False

    for f_idx in range(TOTAL_FRAMES):
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # -------------------------------------------------------------
        # 0.0 - 0.8s: INTERRUPT THE SCROLL (Frame 0 product UI + Tap)
        # -------------------------------------------------------------
        if f_idx < f_hook:
            # Immediate movement: Frame 0 starts on Wallet Overview, Tap on NGN card at frame 3
            if f_idx < 6:
                paste_real_screen(canvas, screen_overview, scale=0.85, center_x=540, center_y=900)
                tap_p = f_idx / 6.0
                draw_tap_indicator(draw, 540, 680, radius=int(20 + 18 * tap_p), alpha=max(0, int(220 * (1.0 - tap_p))))
            elif f_idx < 15:
                # Fast slide/zoom into NGN wallet
                offset_x = int((1.0 - (f_idx - 6) / 9.0) * 350)
                paste_real_screen(canvas, screen_ngn, scale=0.85, center_x=540, center_y=900, offset_x=offset_x)
            else:
                paste_real_screen(canvas, screen_ngn, scale=0.85, center_x=540, center_y=900)

            draw_clean_text_banner(draw, canvas, "Still switching between apps?", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        # -------------------------------------------------------------
        # 0.8 - 2.8s: IMMEDIATE PRODUCT PROOF (NGN -> USD -> GHS)
        # -------------------------------------------------------------
        elif f_idx < f_proof:
            rel_f = f_idx - f_hook # 0 to 59
            
            # 0.8 - 1.4s (rel 0..19): NGN Wallet
            if rel_f < 20:
                paste_real_screen(canvas, screen_ngn, scale=0.85, center_x=540, center_y=900)
                if rel_f >= 4 and rel_f <= 14:
                    tap_p = (rel_f - 4) / 10.0
                    draw_tap_indicator(draw, 540, 560, radius=int(20 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))
            
            # 1.4 - 2.1s (rel 20..39): USD Wallet
            elif rel_f < 40:
                paste_real_screen(canvas, screen_usd, scale=0.85, center_x=540, center_y=900)
                if rel_f >= 24 and rel_f <= 34:
                    tap_p = (rel_f - 24) / 10.0
                    draw_tap_indicator(draw, 540, 560, radius=int(20 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))
            
            # 2.1 - 2.8s (rel 40..59): GHS Wallet
            else:
                paste_real_screen(canvas, screen_ghs, scale=0.85, center_x=540, center_y=900)
                if rel_f >= 44 and rel_f <= 54:
                    tap_p = (rel_f - 44) / 10.0
                    draw_tap_indicator(draw, 540, 560, radius=int(20 + 16 * tap_p), alpha=max(0, int(180 * (1.0 - tap_p))))

            draw_clean_text_banner(draw, canvas, "NGN • USD • GHS", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255), icon=sparkle_icon_img)

        # -------------------------------------------------------------
        # 2.8 - 5.2s: SHOW THE DIFFERENCE ("All in one place.")
        # -------------------------------------------------------------
        elif f_idx < f_diff:
            rel_f = f_idx - f_proof # 0 to 71
            # Rapid movement back to overview showing all 3 currencies
            if rel_f < 12:
                offset_x = int(((rel_f) / 12.0) * -350)
                paste_real_screen(canvas, screen_ghs, scale=0.85, center_x=540, center_y=900, offset_x=offset_x)
            else:
                paste_real_screen(canvas, screen_overview, scale=0.85, center_x=540, center_y=900)
                # Tap highlight cycling across currency cards
                card_step = (rel_f - 12) % 36
                if card_step < 12:
                    draw_tap_indicator(draw, 540, 680, radius=32, alpha=150)
                elif card_step < 24:
                    draw_tap_indicator(draw, 540, 960, radius=32, alpha=150)
                else:
                    draw_tap_indicator(draw, 540, 1240, radius=32, alpha=150)

            draw_clean_text_banner(draw, canvas, "All in one place.", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

            # Save frame inside video as cover image (e.g. frame 120 at t=4.0s)
            if f_idx == 120 and not cover_frame_saved:
                root_cover = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video7_Cover.png"
                export_cover = os.path.join(thumbnails_dir, "NoteStandard_TikTok_Video7_Cover.png")
                canvas.save(root_cover)
                canvas.save(export_cover)
                print(f"Extracted Cover Thumbnail from Frame 120 (4.0s):\n - {root_cover}\n - {export_cover}")
                cover_frame_saved = True

        # -------------------------------------------------------------
        # 5.2 - 7.2s: ONE HUMAN-RELEVANT PAYOFF ("Less app-hopping.")
        # -------------------------------------------------------------
        elif f_idx < f_payoff:
            paste_real_screen(canvas, screen_overview, scale=0.85, center_x=540, center_y=900)

            draw_clean_text_banner(draw, canvas, "Less app-hopping.", y_center=1650, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(52, 211, 153, 255))

        # -------------------------------------------------------------
        # 7.2 - 9.5s: END BEFORE ATTENTION DROPS (Brand Ending)
        # -------------------------------------------------------------
        else:
            rel_f = f_idx - f_payoff # 0 to 68
            paste_real_screen(canvas, screen_overview, scale=0.85, center_x=540, center_y=900)

            if rel_f < 34:
                # 7.2 - 8.3s: "NoteStandard"
                draw_clean_text_banner(draw, canvas, "NoteStandard", y_center=1650, font=font_cta, bg_color=(15, 23, 42, 250), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))
            else:
                # 8.3 - 9.5s: Dual stacked CTA
                draw_stacked_text_banners(draw, canvas, "NoteStandard", "www.notestandard.com", y_center=1650, font=font_cta, bg_color=(15, 23, 42, 250), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        proc.stdin.write(canvas.tobytes())

    proc.stdin.close()
    stdout_data, stderr_data = proc.communicate()

    if proc.returncode == 0:
        print(f"SUCCESS! Rendered final TikTok Video 7 to {out_export}")
        import shutil
        shutil.copyfile(out_export, out_root)
        print(f"Copied final video to root workspace: {out_root}")
        print(f"Output File Size: {os.path.getsize(out_root)} bytes")
    else:
        print("Error rendering video:", stderr_data.decode("utf-8"))

if __name__ == "__main__":
    render_video_7()
