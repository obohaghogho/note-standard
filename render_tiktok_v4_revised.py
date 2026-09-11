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

os.makedirs(exports_dir, exist_ok=True)

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
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 60)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 38)
except Exception:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 60)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 38)

# -----------------------------------------------------------------------------
# Crisp Vector Flag & Icon Generators (ZERO missing glyph squares / □)
# -----------------------------------------------------------------------------
def draw_flag_ngn(size=(46, 30)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(22, 163, 74, 255))
    w = size[0] // 3
    d.rectangle([(w, 0), (2*w, size[1])], fill=(255, 255, 255, 255))
    return img

def draw_flag_usd(size=(46, 30)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(220, 38, 38, 255))
    for i in range(1, 5, 2):
        y1 = int(i * size[1] / 5)
        y2 = int((i+1) * size[1] / 5)
        d.rectangle([(0, y1), (size[0], y2)], fill=(255, 255, 255, 255))
    d.rectangle([(0, 0), (int(size[0]*0.45), int(size[1]*0.55))], fill=(30, 58, 138, 255))
    return img

def draw_flag_ghs(size=(46, 30)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(220, 38, 38, 255))
    h = size[1] / 3
    d.rectangle([(0, int(h)), (size[0], int(2*h))], fill=(234, 179, 8, 255))
    d.rectangle([(0, int(2*h)), (size[0], size[1])], fill=(22, 163, 74, 255))
    cx, cy = size[0] / 2, size[1] / 2
    d.ellipse([(cx-3, cy-3), (cx+3, cy+3)], fill=(15, 23, 42, 255))
    return img

def draw_eye_emoji(size=(44, 30)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Left eye
    d.ellipse([(2, 4), (20, 26)], fill=(255, 255, 255, 255), outline=(15, 23, 42, 255), width=2)
    d.ellipse([(8, 9), (17, 20)], fill=(15, 23, 42, 255))
    d.ellipse([(12, 11), (15, 14)], fill=(255, 255, 255, 255))
    # Right eye
    d.ellipse([(24, 4), (42, 26)], fill=(255, 255, 255, 255), outline=(15, 23, 42, 255), width=2)
    d.ellipse([(30, 9), (39, 20)], fill=(15, 23, 42, 255))
    d.ellipse([(34, 11), (37, 14)], fill=(255, 255, 255, 255))
    return img

flag_ngn_img = draw_flag_ngn()
flag_usd_img = draw_flag_usd()
flag_ghs_img = draw_flag_ghs()
eye_icon_img = draw_eye_emoji()

# -----------------------------------------------------------------------------
# Clean Text Banner Renderer (Positioned safely away from App Header & Controls)
# -----------------------------------------------------------------------------
def draw_clean_text_banner(draw, base_canvas, text, y_center=1520, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255), icon=None):
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

# Draw Opening 3-Currency Badge Header Banner ("NGN  USD  GHS")
def draw_opening_currencies_banner(draw, base_canvas, y_center=1520):
    text_ngn, text_usd, text_ghs = "NGN", "USD", "GHS"
    f = font_hero
    
    w_ngn = f.getbbox(text_ngn)[2] - f.getbbox(text_ngn)[0]
    w_usd = f.getbbox(text_usd)[2] - f.getbbox(text_usd)[0]
    w_ghs = f.getbbox(text_ghs)[2] - f.getbbox(text_ghs)[0]
    
    fw = flag_ngn_img.width
    gap = 28
    sec_gap = 48

    total_w = (w_ngn + 12 + fw) + sec_gap + (w_usd + 12 + fw) + sec_gap + (w_ghs + 12 + fw)
    
    px, py = 40, 22
    th = f.getbbox("NGN")[3] - f.getbbox("NGN")[1]
    x1, y1 = (WIDTH - total_w) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + total_w) // 2 + px, y_center + th // 2 + py

    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=24, fill=(15, 23, 42, 245), outline=(99, 102, 241, 255), width=4)

    curr_x = (WIDTH - total_w) // 2
    ty = y_center - th // 2 - 4

    # 1. NGN + Flag
    draw.text((curr_x, ty), text_ngn, fill=(255, 255, 255, 255), font=f)
    curr_x += w_ngn + 12
    base_canvas.paste(flag_ngn_img, (curr_x, y_center - flag_ngn_img.height//2), flag_ngn_img)
    curr_x += fw + sec_gap

    # 2. USD + Flag
    draw.text((curr_x, ty), text_usd, fill=(255, 255, 255, 255), font=f)
    curr_x += w_usd + 12
    base_canvas.paste(flag_usd_img, (curr_x, y_center - flag_usd_img.height//2), flag_usd_img)
    curr_x += fw + sec_gap

    # 3. GHS + Flag
    draw.text((curr_x, ty), text_ghs, fill=(255, 255, 255, 255), font=f)
    curr_x += w_ghs + 12
    base_canvas.paste(flag_ghs_img, (curr_x, y_center - flag_ghs_img.height//2), flag_ghs_img)

# Helper: Paste Real Screen Screenshot (Consistent Scale, No Zoom on Balances)
def paste_real_screen(base_canvas, screen_img, scale=0.84, center_x=540, center_y=940, offset_x=0):
    w, h = screen_img.size
    nw, nh = int(w * scale), int(h * scale)
    resized = screen_img.resize((nw, nh), Image.Resampling.LANCZOS)
    
    x = center_x - nw // 2 + offset_x
    y = center_y - nh // 2

    # Drop shadow
    shadow_box = Image.new("RGBA", (nw + 32, nh + 32), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_box)
    sdraw.rounded_rectangle([(16, 16), (nw + 16, nh + 16)], radius=34, fill=(0, 0, 0, 180))
    base_canvas.paste(shadow_box, (x - 16, y - 8), shadow_box)

    # Frame border
    frame_box = Image.new("RGBA", (nw + 12, nh + 12), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(frame_box)
    fdraw.rounded_rectangle([(0, 0), (nw + 11, nh + 11)], radius=32, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=3)
    base_canvas.paste(frame_box, (x - 6, y - 6), frame_box)

    base_canvas.paste(resized, (x, y), resized)

# Helper: Draw User Tap Circle Pulse (Natural Interaction feeling)
def draw_tap_indicator(draw, center_x, center_y, radius=32, alpha=180):
    draw.ellipse([(center_x - radius, center_y - radius), (center_x + radius, center_y + radius)], fill=(99, 102, 241, alpha), outline=(255, 255, 255, alpha), width=3)

# -----------------------------------------------------------------------------
# Core Video Frame Generator
# -----------------------------------------------------------------------------
def generate_raw_video(output_raw_mp4="raw_tiktok4_revised.mp4"):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_raw_mp4, fourcc, FPS, (WIDTH, HEIGHT))

    print(f"Generating Revised TikTok Video #4 frames ({TOTAL_FRAMES} frames @ {FPS} FPS)...")

    # Frame Schedule:
    # 0.0s  - 0.8s  (Frames 0  to 24) : OPENING ("NGN USD GHS") - REAL WALLET FIRST FRAME! NO INTRO! NO GREEN BAR!
    # 0.8s  - 1.6s  (Frames 24 to 48) : REVEAL ("ONE WALLET.") + Tap Pulse on NGN Card
    # 1.6s  - 2.8s  (Frames 48 to 84) : NGN WALLET ("NGN") + Flag
    # 2.8s  - 4.0s  (Frames 84 to 120): USD WALLET ("USD") + Flag
    # 4.0s  - 5.2s  (Frames 120 to 156): GHS WALLET ("GHS") + Flag
    # 5.2s  - 6.5s  (Frames 156 to 195): Transition Back to Overview
    # 6.5s  - 8.0s  (Frames 195 to 240): PAYOFF ("ALL 3. ONE PLACE.")
    # 8.0s  - 9.5s  (Frames 240 to 285): BRAND ("THIS IS NOTESTANDARD.")
    # 9.5s  - 10.5s (Frames 285 to 315): CTA ("WOULD YOU USE IT? 👀")

    f_op1 = int(FPS * 0.8) # 24
    f_op2 = int(FPS * 1.6) # 48
    f_ngn = int(FPS * 2.8) # 84
    f_usd = int(FPS * 4.0) # 120
    f_ghs = int(FPS * 5.2) # 156
    f_back= int(FPS * 6.5) # 195
    f_pay = int(FPS * 8.0) # 240
    f_brd = int(FPS * 9.5) # 285

    for f_idx in range(TOTAL_FRAMES):
        # Dark clean background (#0b0f19) - NO TOP GREEN BAR!
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # ---------------------------------------------------------------------
        # 0.0s – 0.8s (Frames 0 to 24): FIRST FRAME - REAL WALLET + "NGN  USD  GHS"
        # ---------------------------------------------------------------------
        if f_idx < f_op1:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_opening_currencies_banner(draw, canvas, y_center=1540)

        # ---------------------------------------------------------------------
        # 0.8s – 1.6s (Frames 24 to 48): "ONE WALLET." + Tap Pulse on NGN Card
        # ---------------------------------------------------------------------
        elif f_idx < f_op2:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            
            # Subtle user tap animation on NGN card area
            tap_prog = (f_idx - f_op1) / float(f_op2 - f_op1)
            pulse_radius = int(24 + (20 * tap_prog))
            pulse_alpha = max(0, int(200 * (1.0 - tap_prog)))
            draw_tap_indicator(draw, 540, 720, radius=pulse_radius, alpha=pulse_alpha)

            draw_clean_text_banner(draw, canvas, "ONE WALLET.", y_center=1540, font=font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # 1.6s – 2.8s (Frames 48 to 84): NGN WALLET DEMONSTRATION ("NGN")
        # Smooth Screen Slide transition from overview to NGN
        # ---------------------------------------------------------------------
        elif f_idx < f_ngn:
            trans_len = 10
            if (f_idx - f_op2) < trans_len:
                p = (f_idx - f_op2) / float(trans_len)
                offset_x = int((1.0 - p) * 600)
            else:
                offset_x = 0

            paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=940, offset_x=offset_x)
            draw_clean_text_banner(draw, canvas, "NGN", y_center=1540, font=font_hero, bg_color=(30, 27, 75, 245), border_color=(99, 102, 241, 255), icon=flag_ngn_img)

        # ---------------------------------------------------------------------
        # 2.8s – 4.0s (Frames 84 to 120): USD WALLET DEMONSTRATION ("USD")
        # Smooth Screen Slide transition from NGN to USD
        # ---------------------------------------------------------------------
        elif f_idx < f_usd:
            trans_len = 10
            if (f_idx - f_ngn) < trans_len:
                p = (f_idx - f_ngn) / float(trans_len)
                offset_x = int((1.0 - p) * 600)
            else:
                offset_x = 0

            paste_real_screen(canvas, screen_usd, scale=0.84, center_x=540, center_y=940, offset_x=offset_x)
            draw_clean_text_banner(draw, canvas, "USD", y_center=1540, font=font_hero, bg_color=(6, 78, 59, 245), border_color=(16, 185, 129, 255), icon=flag_usd_img)

        # ---------------------------------------------------------------------
        # 4.0s – 5.2s (Frames 120 to 156): GHS WALLET DEMONSTRATION ("GHS")
        # Smooth Screen Slide transition from USD to GHS
        # ---------------------------------------------------------------------
        elif f_idx < f_ghs:
            trans_len = 10
            if (f_idx - f_usd) < trans_len:
                p = (f_idx - f_usd) / float(trans_len)
                offset_x = int((1.0 - p) * 600)
            else:
                offset_x = 0

            paste_real_screen(canvas, screen_ghs, scale=0.84, center_x=540, center_y=940, offset_x=offset_x)
            draw_clean_text_banner(draw, canvas, "GHS", y_center=1540, font=font_hero, bg_color=(66, 32, 6, 245), border_color=(234, 179, 8, 255), icon=flag_ghs_img)

        # ---------------------------------------------------------------------
        # 5.2s – 6.5s (Frames 156 to 195): Transition Back to Overview
        # ---------------------------------------------------------------------
        elif f_idx < f_back:
            trans_len = 12
            if (f_idx - f_ghs) < trans_len:
                p = (f_idx - f_ghs) / float(trans_len)
                offset_x = int((1.0 - p) * -600)
            else:
                offset_x = 0

            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940, offset_x=offset_x)
            draw_clean_text_banner(draw, canvas, "ONE WALLET.", y_center=1540, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255))

        # ---------------------------------------------------------------------
        # 6.5s – 8.0s (Frames 195 to 240): PAYOFF ("ALL 3. ONE PLACE.")
        # ---------------------------------------------------------------------
        elif f_idx < f_pay:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "ALL 3. ONE PLACE.", y_center=1540, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255))

        # ---------------------------------------------------------------------
        # 8.0s – 9.5s (Frames 240 to 285): BRAND ("THIS IS NOTESTANDARD.")
        # ---------------------------------------------------------------------
        elif f_idx < f_brd:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "THIS IS NOTESTANDARD.", y_center=1540, font=font_hero, bg_color=(30, 58, 138, 245), border_color=(59, 130, 246, 255))

        # ---------------------------------------------------------------------
        # 9.5s – 10.5s (Frames 285 to 315): CTA ("WOULD YOU USE IT? 👀")
        # ---------------------------------------------------------------------
        else:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "WOULD YOU USE IT?", y_center=1540, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(234, 179, 8, 255), icon=eye_icon_img)

        # Write frame
        pil_rgb = canvas.convert("RGB")
        frame_np = cv2.cvtColor(np.array(pil_rgb), cv2.COLOR_RGB2BGR)
        out.write(frame_np)

    out.release()
    print("Raw Revised Video #4 frames rendered and saved to raw_tiktok4_revised.mp4 successfully!")

# Finalize Video with Audio track
def finalize_video():
    raw_mp4 = "raw_tiktok4_revised.mp4"
    audio_wav = os.path.join(audio_dir, "vo_tiktok4_revised_full.wav")
    final_output_mp4 = os.path.join(exports_dir, "notestandard_tiktok_video_4_revised.mp4")
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

    print(f"Encoding final revised TikTok Video #4 with audio: {final_output_mp4}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"[SUCCESS] Revised TikTok Video #4 saved to: {final_output_mp4}")
        import shutil
        shutil.copyfile(final_output_mp4, proj_output_mp4)
        print(f"[SUCCESS] Overwrote final project video: {proj_output_mp4}")
    else:
        print("FFmpeg error:", res.stderr.decode("utf-8"))

if __name__ == "__main__":
    generate_raw_video()
    finalize_video()
