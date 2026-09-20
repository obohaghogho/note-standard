import os
import time
import subprocess

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

segments = {
    "vo_v6_rev_s1.mp3": "3 currencies. One app.",
    "vo_v6_rev_s2.mp3": "Naira, Dollar, Cedi.",
    "vo_v6_rev_s3.mp3": "All in one place.",
    "vo_v6_rev_s4.mp3": "NoteStandard. www.notestandard.com"
}

def generate_segment(filename, text):
    path = os.path.join(audio_dir, filename)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f"Segment {filename} already exists, skipping...")
        return
    
    # Try gTTS with tld='com' first
    for attempt in range(3):
        try:
            from gtts import gTTS
            print(f"Generating {filename} (Attempt {attempt+1})...")
            tts = gTTS(text=text, lang='en', tld='com', slow=False)
            tts.save(path)
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                print(f"Successfully saved {filename} via gTTS")
                return
        except Exception as e:
            print(f"gTTS attempt {attempt+1} failed: {e}")
            time.sleep(2)
            
    # Fallback to SAPI5 via pyttsx3 or powershell if gTTS fails
    print(f"Falling back to Windows SAPI5 TTS for {filename}...")
    try:
        import pyttsx3
        engine = pyttsx3.init()
        wav_path = path.replace(".mp3", ".wav")
        engine.save_to_file(text, wav_path)
        engine.runAndWait()
        # Convert to mp3 via ffmpeg
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run([ffmpeg_exe, "-y", "-i", wav_path, path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Saved {filename} via SAPI5")
    except Exception as ex:
        print(f"SAPI5 fallback failed for {filename}: {ex}")

for filename, text in segments.items():
    generate_segment(filename, text)

try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    ffmpeg_exe = "ffmpeg"

s1 = os.path.join(audio_dir, "vo_v6_rev_s1.mp3")
s2 = os.path.join(audio_dir, "vo_v6_rev_s2.mp3")
s3 = os.path.join(audio_dir, "vo_v6_rev_s3.mp3")
s4 = os.path.join(audio_dir, "vo_v6_rev_s4.mp3")

out_master_wav = os.path.join(audio_dir, "vo_tiktok6_full.wav")

cmd = [
    ffmpeg_exe,
    "-y",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-i", s1,
    "-i", s2,
    "-i", s3,
    "-i", s4,
    "-filter_complex",
    "[0:a]atrim=end=13.5[a0];"
    "[1:a]adelay=50|50[a1];"
    "[2:a]adelay=1200|1200[a2];"
    "[3:a]adelay=9500|9500[a3];"
    "[4:a]adelay=11500|11500[a4];"
    "[a0][a1][a2][a3][a4]amix=inputs=5:duration=first[aout]",
    "-map", "[aout]",
    "-c:a", "pcm_s16le",
    out_master_wav
]

print("Building master audio track for TikTok Video 6...")
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if res.returncode == 0:
    print(f"Master audio generated successfully at: {out_master_wav}")
else:
    print("Error generating audio:", res.stderr.decode("utf-8"))

