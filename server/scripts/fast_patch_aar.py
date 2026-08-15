import os
import sys
import zipfile

aar_path = r"C:\Users\hp\.gradle\caches\modules-2\files-2.1\com.facebook.react\react-android\0.81.5\8de270a2394cba16d10053186f09af98c9cb8308\react-android-0.81.5-release.aar"
temp_aar = aar_path + ".temp"

print("Reading source AAR:", aar_path)
patched_count = 0

if os.path.exists(aar_path):
    with zipfile.ZipFile(aar_path, 'r') as zin, zipfile.ZipFile(temp_aar, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            buffer = zin.read(item.filename)
            if item.filename.endswith("abi.json") and b'"api": 24' in buffer:
                buffer = buffer.replace(b'"api": 24', b'"api": 21')
                patched_count += 1
                print("Patched inner manifest:", item.filename)
            zout.writestr(item, buffer)

    if patched_count > 0:
        os.replace(temp_aar, aar_path)
        print(f"Successfully updated source AAR with {patched_count} patched abi.json manifest(s)!")
    else:
        if os.path.exists(temp_aar):
            os.remove(temp_aar)
        print("Source AAR already patched or no api: 24 found.")
else:
    print("Source AAR path not found.")
