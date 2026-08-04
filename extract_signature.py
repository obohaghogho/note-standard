import os
from PIL import Image

IMG_PATH = r"C:\Users\hp\.gemini\antigravity-ide\brain\9dcf5e68-2e23-4de5-b4f4-6c8d4f23ca90\media__1785797587412.png"
OUTPUT_DIR = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\temp_anchor_source"

img = Image.open(IMG_PATH).convert("RGBA")
width, height = img.size

# Crop signature (bottom left above AGHOGHO OBOH line)
# In 682x1024, the signature is located around x: 60..280, y: 840..950
sig_box = (60, 850, 270, 940)
sig_crop = img.crop(sig_box)
sig_path = os.path.join(OUTPUT_DIR, "extracted_signature.png")
sig_crop.save(sig_path)

# Crop seal (bottom middle)
seal_box = (270, 840, 430, 950)
seal_crop = img.crop(seal_box)
seal_path = os.path.join(OUTPUT_DIR, "extracted_seal.png")
seal_crop.save(seal_path)

print(f"Extracted signature saved to {sig_path} ({sig_crop.size})")
print(f"Extracted seal saved to {seal_path} ({seal_crop.size})")
