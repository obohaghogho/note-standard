import os
import zipfile
import shutil

cache_dir = r"C:\Users\hp\.gradle\caches"
print("Scanning Gradle cache for react-android AARs and abi.json files...")

patched_aars = 0
patched_jsons = 0

for root, dirs, files in os.walk(cache_dir):
    for f in files:
        filePath = os.path.join(root, f)
        if f.endswith(".aar") and ("react-android" in f or "hermes" in f):
            try:
                tempPath = filePath + ".temp"
                modified = False
                with zipfile.ZipFile(filePath, 'r') as zin, zipfile.ZipFile(tempPath, 'w', zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        buf = zin.read(item.filename)
                        if item.filename.endswith("abi.json"):
                            if b'"api": 21' in buf:
                                buf = buf.replace(b'"api": 21', b'"api": 24')
                                modified = True
                                print(f"Patched inner AAR abi.json (21->24): {item.filename} in {f}")
                        zout.writestr(item, buf)
                if modified:
                    os.replace(tempPath, filePath)
                    patched_aars += 1
                else:
                    if os.path.exists(tempPath):
                        os.remove(tempPath)
            except Exception as e:
                pass
        elif f == "abi.json":
            try:
                with open(filePath, 'r', encoding='utf-8') as jf:
                    content = jf.read()
                if '"api": 21' in content:
                    content = content.replace('"api": 21', '"api": 24')
                    with open(filePath, 'w', encoding='utf-8') as jf:
                        jf.write(content)
                    patched_jsons += 1
                    print(f"Patched cached abi.json (21->24): {filePath}")
            except Exception as e:
                pass

print(f"Done! Patched {patched_aars} AAR(s) and {patched_jsons} abi.json file(s).")
