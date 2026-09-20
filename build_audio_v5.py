import os
import subprocess
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

# Generate TTS audio segments for Video 5
segments = {
    "vo_v5_s1.mp3": "Still using three apps?",
    "vo_v5_s2.mp3": "For different currencies?",
    "vo_v5_s3a.mp3": "N G N.",
    "vo_v5_s3b.mp3": "U S Dollar.",
    "vo_v5_s3c.mp3": "Ghanaian Cedi.",
    "vo_v5_s4.mp3": "One place.",
    "vo_v5_s5.mp3": "NoteStandard.",
    "vo_v5_s6.mp3": "Would you use this?"
}

for filename, text in segments.items():
    path = os.path.join(audio_dir, filename)
    tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
    tts.save(path)
    print(f"Saved {filename}")

try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

s1 = os.path.join(audio_dir, "vo_v5_s1.mp3")
s2 = os.path.join(audio_dir, "vo_v5_s2.mp3")
s3a = os.path.join(audio_dir, "vo_v5_s3a.mp3")
s3b = os.path.join(audio_dir, "vo_v5_s3b.mp3")
s3c = os.path.join(audio_dir, "vo_v5_s3c.mp3")
s4 = os.path.join(audio_dir, "vo_v5_s4.mp3")
s5 = os.path.join(audio_dir, "vo_v5_s5.mp3")
s6 = os.path.join(audio_dir, "vo_v5_s6.mp3")

out_master_wav = os.path.join(audio_dir, "vo_tiktok5_full.wav")

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
    "-i", s6,
    "-filter_complex",
    "[0:a]atrim=end=8.3[a0];"
    "[1:a]adelay=100|100[a1];"
    "[2:a]adelay=1050|1050[a2];"
    "[3:a]adelay=2300|2300[a3];"
    "[4:a]adelay=3100|3100[a4];"
    "[5:a]adelay=4000|4000[a5];"
    "[6:a]adelay=4900|4900[a6];"
    "[7:a]adelay=6400|6400[a7];"
    "[8:a]adelay=7500|7500[a8];"
    "[a0][a1][a2][a3][a4][a5][a6][a7][a8]amix=inputs=9:duration=first[aout]",
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    out_master_wav
]

print("Building master audio track for TikTok Video 5...")
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if res.returncode == 0:
    print(f"Master audio generated successfully at: {out_master_wav}")
else:
    print("Error generating audio:", res.stderr.decode("utf-8"))
