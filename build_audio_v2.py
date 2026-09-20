import os
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

# Full continuous narration script for 19s high-retention video
full_script = "Watch crypto become Naira. Crypto... Swap... Get Naira... Send it to your bank. One wallet. That's the idea. NoteStandard."

scripts = {
    "vo_tiktok2_full.mp3": full_script,
    "vo_tiktok2_sec1.mp3": "Watch crypto become Naira.",
    "vo_tiktok2_sec2.mp3": "Crypto.",
    "vo_tiktok2_sec3.mp3": "Swap.",
    "vo_tiktok2_sec4.mp3": "Get Naira.",
    "vo_tiktok2_sec5.mp3": "Send it to your bank.",
    "vo_tiktok2_sec6.mp3": "One wallet. That's the idea. NoteStandard."
}

for filename, text in scripts.items():
    path = os.path.join(audio_dir, filename)
    tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
    tts.save(path)
    print(f"Saved {filename}")

print("Audio generation for TikTok Video #2 complete!")

