import os
import zipfile

caches_dir = r"C:\Users\hp\.gradle\caches"
print("=== Patching all React-Android AARs and Prefab transforms (api & ndk) ===")

transforms_dir = os.path.join(caches_dir, "8.14.3", "transforms")
json_count = 0
for root, dirs, files in os.walk(transforms_dir):
    for f in files:
        if f == "abi.json":
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8') as jf:
                    txt = jf.read()
                modified = False
                if '"ndk": 27' in txt:
                    txt = txt.replace('"ndk": 27', '"ndk": 26')
                    modified = True
                if '"api": 21' in txt:
                    txt = txt.replace('"api": 21', '"api": 24')
                    modified = True
                if modified:
                    with open(p, 'w', encoding='utf-8') as jf:
                        jf.write(txt)
                    json_count += 1
                    print(f"Patched transform abi.json: {p}")
            except Exception as e:
                pass

print(f"Patched {json_count} abi.json file(s) in transforms.")

aar_count = 0
for root, dirs, files in os.walk(os.path.join(caches_dir, "modules-2")):
    for f in files:
        if f.endswith(".aar") and ("react-android" in f or "hermes" in f or "fbjni" in f):
            aar_path = os.path.join(root, f)
            temp_aar = aar_path + ".temp"
            inner_patched = 0
            try:
                with zipfile.ZipFile(aar_path, 'r') as zin, zipfile.ZipFile(temp_aar, 'w', zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        buf = zin.read(item.filename)
                        if item.filename.endswith("abi.json"):
                            orig_buf = buf
                            if b'"ndk": 27' in buf:
                                buf = buf.replace(b'"ndk": 27', b'"ndk": 26')
                            if b'"api": 21' in buf:
                                buf = buf.replace(b'"api": 21', b'"api": 24')
                            if buf != orig_buf:
                                inner_patched += 1
                        zout.writestr(item, buf)
                if inner_patched > 0:
                    os.replace(temp_aar, aar_path)
                    aar_count += 1
                    print(f"Successfully updated AAR {f} with {inner_patched} patched manifest(s)!")
                else:
                    if os.path.exists(temp_aar):
                        os.remove(temp_aar)
            except Exception as e:
                pass

print(f"Done! Updated {aar_count} source AAR(s).")
