from PIL import Image

sig_path = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\temp_anchor_source\extracted_signature.png"
img = Image.open(sig_path).convert("RGBA")

datas = img.getdata()
newData = []

for item in datas:
    # item is (R, G, B, A)
    r, g, b, a = item
    # If pixel is near white/light grey (paper background), make transparent
    if r > 180 and g > 180 and b > 180:
        newData.append((255, 255, 255, 0))
    else:
        # Keep original blue ink pixel
        newData.append(item)

img.putdata(newData)
transparent_sig_path = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\temp_anchor_source\signature_transparent.png"
img.save(transparent_sig_path, "PNG")
print(f"Clean transparent signature saved to {transparent_sig_path}")

# Do the same for seal
seal_path = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\temp_anchor_source\extracted_seal.png"
img_seal = Image.open(seal_path).convert("RGBA")
datas_seal = img_seal.getdata()
newData_seal = []

for item in datas_seal:
    r, g, b, a = item
    if r > 180 and g > 180 and b > 180:
        newData_seal.append((255, 255, 255, 0))
    else:
        newData_seal.append(item)

img_seal.putdata(newData_seal)
transparent_seal_path = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\temp_anchor_source\seal_transparent.png"
img_seal.save(transparent_seal_path, "PNG")
print(f"Clean transparent seal saved to {transparent_seal_path}")
