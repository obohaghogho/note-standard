import os
from gtts import gTTS

audio_dir = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\notestandard-social\audio"
os.makedirs(audio_dir, exist_ok=True)

scripts = {
    "vo_master.mp3": "I built a fintech app here in Nigeria with NGN, US Dollars and Ghanaian Cedi in one wallet. Three currencies, with tools to deposit, withdraw, send and convert. This is NoteStandard. Would you use it?",
    "vo_hook_a.mp3": "Why use three different wallets? I built a fintech app here in Nigeria with NGN, US Dollars and Ghanaian Cedi in one wallet. Three currencies, with tools to deposit, withdraw, send and convert. This is NoteStandard. Would you use it?",
    "vo_hook_b.mp3": "What if one wallet held NGN, USD and GHS? I built a fintech app here in Nigeria with NGN, US Dollars and Ghanaian Cedi in one wallet. Three currencies, with tools to deposit, withdraw, send and convert. This is NoteStandard. Would you use it?",
    "vo_hook_c.mp3": "I built this for people who use multiple currencies. Here in Nigeria with NGN, US Dollars and Ghanaian Cedi in one wallet. Three currencies, with tools to deposit, withdraw, send and convert. This is NoteStandard. Would you use it?"
}

for filename, text in scripts.items():
    path = os.path.join(audio_dir, filename)
    tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
    tts.save(path)
    print(f"Saved {filename}")

