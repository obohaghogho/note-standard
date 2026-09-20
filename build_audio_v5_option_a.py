import os
import time
import subprocess
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

segments = {
    "vo_opt_a_s1.mp3": "Stop using three apps for this.",
    "vo_opt_a_s2.mp3": "One for Naira, one for Dollars, one for Cedis.",
    "vo_opt_a_s3a.mp3": "Naira Wallet.",
    "vo_opt_a_s3b.mp3": "U S Dollar Wallet.",
    "vo_opt_a_s3c.mp3": "Ghanaian Cedi Wallet.",
    "vo_opt_a_s4.mp3": "All in NoteStandard.",
    "vo_opt_a_s5.mp3": "How many money apps are on your phone right now?"
}

for filename, text in segments.items():
    path = os.path.join(audio_dir, filename)
    success = False
    for attempt in range(3):
        try:
            tts = gTTS(text=text, lang='en', slow=False)
            tts.save(path)
            print(f"Saved {filename}")
            success = True
            break
        except Exception as e:
            print(f"Attempt {attempt+1} failed for {filename}: {e}")
            time.sleep(1)
    if not success:
        print(f"Warning: Could not fetch TTS for {filename}")

try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

s1 = os.path.join(audio_dir, "vo_opt_a_s1.mp3")
s2 = os.path.join(audio_dir, "vo_opt_a_s2.mp3")
s3a = os.path.join(audio_dir, "vo_opt_a_s3a.mp3")
s3b = os.path.join(audio_dir, "vo_opt_a_s3b.mp3")
s3c = os.path.join(audio_dir, "vo_opt_a_s3c.mp3")
s4 = os.path.join(audio_dir, "vo_opt_a_s4.mp3")
s5 = os.path.join(audio_dir, "vo_opt_a_s5.mp3")

out_master_wav = os.path.join(audio_dir, "vo_tiktok5_option_a_full.wav")

cmd = [
    ffmpeg_exe,
    "-y",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-i", s1,
    "-i", s2,
    "-i", s3a,
    "-i", s3b,
    "-i", s3c,
    "-i", s4,
    "-i", s5,
    "-filter_complex",
    "[0:a]atrim=end=8.3[a0];"
    "[1:a]adelay=100|100[a1];"
    "[2:a]adelay=1250|1250[a2];"
    "[3:a]adelay=2500|2500[a3];"
    "[4:a]adelay=3400|3400[a4];"
    "[5:a]adelay=4300|4300[a5];"
    "[6:a]adelay=5200|5200[a6];"
    "[7:a]adelay=6500|6500[a7];"
    "[a0][a1][a2][a3][a4][a5][a6][a7]amix=inputs=8:duration=first[aout]",
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    out_master_wav
]

print("Building master audio track for Option A...")
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if res.returncode == 0:
    print(f"Master audio generated successfully at: {out_master_wav}")
else:
    print("Error generating audio:", res.stderr.decode("utf-8"))
