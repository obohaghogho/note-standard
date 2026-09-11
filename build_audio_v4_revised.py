import os
import subprocess
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

# Generate revised TTS segments matching exact timings
segments = {
    "vo_v4_r1.mp3": "N G N, U S D, G H S.",
    "vo_v4_r2.mp3": "One wallet.",
    "vo_v4_r3.mp3": "Naira.",
    "vo_v4_r4.mp3": "U S Dollar.",
    "vo_v4_r5.mp3": "Ghanaian Cedi.",
    "vo_v4_r6.mp3": "All three. One place.",
    "vo_v4_r7.mp3": "This is NoteStandard.",
    "vo_v4_r8.mp3": "Would you use it?"
}

for filename, text in segments.items():
    path = os.path.join(audio_dir, filename)
    tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
    tts.save(path)
    print(f"Saved {filename}")

# Generate master audio track
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

sec1 = os.path.join(audio_dir, "vo_v4_r1.mp3")
sec2 = os.path.join(audio_dir, "vo_v4_r2.mp3")
sec3 = os.path.join(audio_dir, "vo_v4_r3.mp3")
sec4 = os.path.join(audio_dir, "vo_v4_r4.mp3")
sec5 = os.path.join(audio_dir, "vo_v4_r5.mp3")
sec6 = os.path.join(audio_dir, "vo_v4_r6.mp3")
sec7 = os.path.join(audio_dir, "vo_v4_r7.mp3")
sec8 = os.path.join(audio_dir, "vo_v4_r8.mp3")

out_master_wav = os.path.join(audio_dir, "vo_tiktok4_revised_full.wav")

cmd = [
    ffmpeg_exe,
    "-y",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-i", sec1,
    "-i", sec2,
    "-i", sec3,
    "-i", sec4,
    "-i", sec5,
    "-i", sec6,
    "-i", sec7,
    "-i", sec8,
    "-filter_complex",
    "[0:a]atrim=end=10.5[a0];"
    "[1:a]adelay=0|0[a1];"
    "[2:a]adelay=800|800[a2];"
    "[3:a]adelay=1600|1600[a3];"
    "[4:a]adelay=2800|2800[a4];"
    "[5:a]adelay=4000|4000[a5];"
    "[6:a]adelay=6500|6500[a6];"
    "[7:a]adelay=8000|8000[a7];"
    "[8:a]adelay=9500|9500[a8];"
    "[a0][a1][a2][a3][a4][a5][a6][a7][a8]amix=inputs=9:duration=first[aout]",
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    out_master_wav
]

print("Building revised master audio track for TikTok Video 4...")
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if res.returncode == 0:
    print(f"Master audio generated successfully at: {out_master_wav}")
else:
    print("Error generating audio:", res.stderr.decode("utf-8"))
