import os
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

root_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social"
screens_dir = os.path.join(root_dir, "assets", "screens")
audio_dir = os.path.join(root_dir, "audio")
exports_dir = os.path.join(root_dir, "exports")

os.makedirs(exports_dir, exist_ok=True)

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
print(f"Using FFmpeg binary: {ffmpeg_exe}")

# Load REAL NoteStandard Video 5 Screens
def load_screen(filename):
    path = os.path.join(screens_dir, filename)
    if os.path.exists(path):
        return Image.open(path).convert("RGBA")
    raise FileNotFoundError(f"Required real screen {filename} not found at {path}!")

screen_overview = load_screen("v5_wallet_overview.png")
screen_ngn      = load_screen("v5_ngn_wallet.png")
screen_usd      = load_screen("v5_usd_wallet.png")
screen_ghs      = load_screen("v5_ghs_wallet.png")

# Video Constants
WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SEC = 8.3
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 249 frames

# Load TrueType Fonts safely
font_dir = r"C:\Windows\Fonts"
try:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 62)
    font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 38)
except Exception:
    font_hero  = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 62)
    font_title = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 48)
    font_sub   = ImageFont.truetype(os.path.join(font_dir, "arialbd.ttf"), 38)

# Crisp Vector Flag & Icon Generators (ZERO missing glyph squares / □)
def draw_flag_ngn(size=(50, 34)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(22, 163, 74, 255))
    w = size[0] // 3
    d.rectangle([(w, 0), (2*w, size[1])], fill=(255, 255, 255, 255))
    return img

def draw_flag_usd(size=(50, 34)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(220, 38, 38, 255))
    for i in range(1, 5, 2):
        y1 = int(i * size[1] / 5)
        y2 = int((i+1) * size[1] / 5)
        d.rectangle([(0, y1), (size[0], y2)], fill=(255, 255, 255, 255))
    d.rectangle([(0, 0), (int(size[0]*0.45), int(size[1]*0.55))], fill=(30, 58, 138, 255))
    return img

def draw_flag_ghs(size=(50, 34)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([(0, 0), (size[0]-1, size[1]-1)], radius=5, fill=(220, 38, 38, 255))
    h = size[1] / 3
    d.rectangle([(0, int(h)), (size[0], int(2*h))], fill=(234, 179, 8, 255))
    d.rectangle([(0, int(2*h)), (size[0], size[1])], fill=(22, 163, 74, 255))
    cx, cy = size[0] / 2, size[1] / 2
    d.ellipse([(cx-3, cy-3), (cx+3, cy+3)], fill=(15, 23, 42, 255))
    return img

def draw_eye_emoji(size=(46, 32)):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([(2, 4), (20, 28)], fill=(255, 255, 255, 255), outline=(15, 23, 42, 255), width=2)
    d.ellipse([(8, 10), (17, 22)], fill=(15, 23, 42, 255))
    d.ellipse([(12, 12), (15, 15)], fill=(255, 255, 255, 255))
    d.ellipse([(24, 4), (42, 28)], fill=(255, 255, 255, 255), outline=(15, 23, 42, 255), width=2)
    d.ellipse([(30, 10), (39, 22)], fill=(15, 23, 42, 255))
    d.ellipse([(34, 12), (37, 15)], fill=(255, 255, 255, 255))
    return img

flag_ngn_img = draw_flag_ngn()
flag_usd_img = draw_flag_usd()
flag_ghs_img = draw_flag_ghs()
eye_icon_img = draw_eye_emoji()

# Clean Text Banner Renderer
def draw_clean_text_banner(draw, base_canvas, text, y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255), icon=None):
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

# Draw Currency Badges Banner ("NGN  USD  GHS")
def draw_currencies_banner(draw, base_canvas, y_center=1500):
    text_ngn, text_usd, text_ghs = "NGN", "USD", "GHS"
    f = font_hero
    
    w_ngn = f.getbbox(text_ngn)[2] - f.getbbox(text_ngn)[0]
    w_usd = f.getbbox(text_usd)[2] - f.getbbox(text_usd)[0]
    w_ghs = f.getbbox(text_ghs)[2] - f.getbbox(text_ghs)[0]
    
    fw = flag_ngn_img.width
    sec_gap = 48

    total_w = (w_ngn + 12 + fw) + sec_gap + (w_usd + 12 + fw) + sec_gap + (w_ghs + 12 + fw)
    
    px, py = 40, 22
    th = f.getbbox("NGN")[3] - f.getbbox("NGN")[1]
    x1, y1 = (WIDTH - total_w) // 2 - px, y_center - th // 2 - py
    x2, y2 = (WIDTH + total_w) // 2 + px, y_center + th // 2 + py

    draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=24, fill=(15, 23, 42, 245), outline=(99, 102, 241, 255), width=4)

    curr_x = (WIDTH - total_w) // 2
    ty = y_center - th // 2 - 4

    draw.text((curr_x, ty), text_ngn, fill=(255, 255, 255, 255), font=f)
    curr_x += w_ngn + 12
    base_canvas.paste(flag_ngn_img, (curr_x, y_center - flag_ngn_img.height//2), flag_ngn_img)
    curr_x += fw + sec_gap

    draw.text((curr_x, ty), text_usd, fill=(255, 255, 255, 255), font=f)
    curr_x += w_usd + 12
    base_canvas.paste(flag_usd_img, (curr_x, y_center - flag_usd_img.height//2), flag_usd_img)
    curr_x += fw + sec_gap

    draw.text((curr_x, ty), text_ghs, fill=(255, 255, 255, 255), font=f)
    curr_x += w_ghs + 12
    base_canvas.paste(flag_ghs_img, (curr_x, y_center - flag_ghs_img.height//2), flag_ghs_img)

# Helper: Paste Real Screen Screenshot
def paste_real_screen(base_canvas, screen_img, scale=0.84, center_x=540, center_y=940, offset_x=0):
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

# Render Direct Pipe to FFmpeg
def render_video_direct_pipe():
    audio_file = os.path.join(audio_dir, "vo_tiktok5_full.wav")
    out_root = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\NoteStandard_TikTok_Video5.mp4"
    out_export = os.path.join(exports_dir, "NoteStandard_TikTok_Video5.mp4")

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

    f_hook = int(FPS * 1.0) # 30
    f_rev  = int(FPS * 2.2) # 66
    f_ngn  = int(FPS * 3.0) # 90
    f_usd  = int(FPS * 3.9) # 117
    f_ghs  = int(FPS * 4.8) # 144
    f_pay  = int(FPS * 6.3) # 189
    f_brd  = int(FPS * 7.5) # 225

    for f_idx in range(TOTAL_FRAMES):
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (11, 15, 25, 255))
        draw = ImageDraw.Draw(canvas)

        # 0.0s – 1.0s: STOP-SCROLL HOOK ("STILL USING 3 APPS?")
        if f_idx < f_hook:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "STILL USING 3 APPS?", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(239, 68, 68, 255), text_color=(255, 255, 255, 255))

        # 1.0s – 2.2s: REVEAL ("FOR DIFFERENT CURRENCIES?")
        elif f_idx < f_rev:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_currencies_banner(draw, canvas, y_center=1420)
            draw_clean_text_banner(draw, canvas, "FOR DIFFERENT CURRENCIES?", y_center=1540, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255))

        # 2.2s – 3.0s: NGN WALLET
        elif f_idx < f_ngn:
            paste_real_screen(canvas, screen_ngn, scale=0.84, center_x=540, center_y=940)
            tap_prog = (f_idx - f_rev) / float(f_ngn - f_rev)
            pulse_radius = int(24 + (16 * tap_prog))
            pulse_alpha = max(0, int(180 * (1.0 - tap_prog)))
            draw_tap_indicator(draw, 540, 520, radius=pulse_radius, alpha=pulse_alpha)
            draw_clean_text_banner(draw, canvas, "NGN 🇳🇬", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(22, 163, 74, 255), text_color=(255, 255, 255, 255))

        # 3.0s – 3.9s: USD WALLET
        elif f_idx < f_usd:
            paste_real_screen(canvas, screen_usd, scale=0.84, center_x=540, center_y=940)
            tap_prog = (f_idx - f_ngn) / float(f_usd - f_ngn)
            pulse_radius = int(24 + (16 * tap_prog))
            pulse_alpha = max(0, int(180 * (1.0 - tap_prog)))
            draw_tap_indicator(draw, 540, 520, radius=pulse_radius, alpha=pulse_alpha)
            draw_clean_text_banner(draw, canvas, "USD 🇺🇸", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(255, 255, 255, 255))

        # 3.9s – 4.8s: GHS WALLET
        elif f_idx < f_ghs:
            paste_real_screen(canvas, screen_ghs, scale=0.84, center_x=540, center_y=940)
            tap_prog = (f_idx - f_usd) / float(f_ghs - f_usd)
            pulse_radius = int(24 + (16 * tap_prog))
            pulse_alpha = max(0, int(180 * (1.0 - tap_prog)))
            draw_tap_indicator(draw, 540, 520, radius=pulse_radius, alpha=pulse_alpha)
            draw_clean_text_banner(draw, canvas, "GHS 🇬🇭", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(234, 179, 8, 255), text_color=(255, 255, 255, 255))

        # 4.8s – 6.3s: PAYOFF ("ONE PLACE.")
        elif f_idx < f_pay:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "ONE PLACE.", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(16, 185, 129, 255), text_color=(52, 211, 153, 255))

        # 6.3s – 7.5s: BRAND ("NOTESTANDARD 👀")
        elif f_idx < f_brd:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "NOTESTANDARD", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(99, 102, 241, 255), text_color=(255, 255, 255, 255), icon=eye_icon_img)

        # 7.5s – 8.3s: COMMENT HOOK ("WOULD YOU USE THIS?")
        else:
            paste_real_screen(canvas, screen_overview, scale=0.84, center_x=540, center_y=940)
            draw_clean_text_banner(draw, canvas, "WOULD YOU USE THIS?", y_center=1500, font=font_hero, bg_color=(15, 23, 42, 245), border_color=(234, 179, 8, 255), text_color=(250, 204, 21, 255), icon=eye_icon_img)

        proc.stdin.write(canvas.tobytes())

    proc.stdin.close()
    stdout_data, stderr_data = proc.communicate()

    if proc.returncode == 0:
        print(f"SUCCESS! Rendered final TikTok Video 5 to {out_export}")
        import shutil
        shutil.copyfile(out_export, out_root)
        print(f"Copied final video to root workspace: {out_root}")
        print(f"Output File Size: {os.path.getsize(out_root)} bytes")
    else:
        print("Error rendering video:", stderr_data.decode("utf-8"))

if __name__ == "__main__":
    render_video_direct_pipe()
