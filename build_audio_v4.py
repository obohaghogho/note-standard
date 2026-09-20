import os
import subprocess
import numpy as np
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

# Generate TTS segments
segments = {
    "vo_v4_sec1.mp3": "3 currencies. One wallet.",
    "vo_v4_sec2.mp3": "Naira.",
    "vo_v4_sec3.mp3": "US Dollar.",
    "vo_v4_sec4.mp3": "Ghanaian Cedi.",
    "vo_v4_sec5.mp3": "No more switching.",
    "vo_v4_sec6.mp3": "This is NoteStandard.",
    "vo_v4_sec7.mp3": "Would you use it?"
}

for filename, text in segments.items():
    path = os.path.join(audio_dir, filename)
    tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
    tts.save(path)
    print(f"Saved {filename}")

# Generate continuous master narration audio with exact timing using FFmpeg filter
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

sec1 = os.path.join(audio_dir, "vo_v4_sec1.mp3")
sec2 = os.path.join(audio_dir, "vo_v4_sec2.mp3")
sec3 = os.path.join(audio_dir, "vo_v4_sec3.mp3")
sec4 = os.path.join(audio_dir, "vo_v4_sec4.mp3")
sec5 = os.path.join(audio_dir, "vo_v4_sec5.mp3")
sec6 = os.path.join(audio_dir, "vo_v4_sec6.mp3")
sec7 = os.path.join(audio_dir, "vo_v4_sec7.mp3")

out_master_wav = os.path.join(audio_dir, "vo_tiktok4_full.wav")

# Use FFmpeg filter graph to position each TTS audio snippet at exact second timestamps:
# 0.0s (sec1), 1.8s (sec2), 3.3s (sec3), 4.8s (sec4), 6.3s (sec5), 8.0s (sec6), 9.5s (sec7)
filter_complex = (
    "[0:a]adelay=0|0[a0];"
    "[1:a]adelay=1800|1800[a1];"
    "[2:a]adelay=3300|3300[a2];"
    "[3:a]adelay=4800|4800[a3];"
    "[4:a]adelay=6300|6300[a4];"
    "[5:a]adelay=8000|8000[a5];"
    "[6:a]adelay=9500|9500[a6];"
    "[a0][a1][a2][a3][a4][a5][a6]amix=inputs=7:duration=first:dropout_transition=0[aout]"
)

# Generate a 10.5 second silence base to mix into
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
    "-filter_complex",
    "[0:a]atrim=end=10.5[a0];"
    "[1:a]adelay=0|0[a1];"
    "[2:a]adelay=1800|1800[a2];"
    "[3:a]adelay=3300|3300[a3];"
    "[4:a]adelay=4800|4800[a4];"
    "[5:a]adelay=6300|6300[a5];"
    "[6:a]adelay=8000|8000[a6];"
    "[7:a]adelay=9500|9500[a7];"
    "[a0][a1][a2][a3][a4][a5][a6][a7]amix=inputs=8:duration=first[aout]",
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    out_master_wav
]

print("Building master audio track for TikTok Video 4...")
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if res.returncode == 0:
    print(f"Master audio generated successfully at: {out_master_wav}")
else:
    print("Error generating audio:", res.stderr.decode("utf-8"))
