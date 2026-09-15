# Post-process the localised Android renders (mirrors build-post.py):
#  - downscale out/localized-frames-android2x/<lang>/*.png (2160×3840)
#    -> out/localized-frames-android/<lang>/ (1080×1920) with LANCZOS
#  - flatten to RGB (no alpha) for store compliance
#  - remove the 2× scratch dir
# Run after:  node build-localized.mjs --android  +  node build-hero-localized.mjs --android
# Bipolar Anonymous:  python3 build-post-localized-android.py \
#                       out/localized-frames-anon-android2x out/localized-frames-anon-android
from PIL import Image
import glob, os, shutil, sys

SRC, DST = sys.argv[1:3] if len(sys.argv) > 2 else ('out/localized-frames-android2x', 'out/localized-frames-android')

for p in sorted(glob.glob(f'{SRC}/*/*.png')):
    lang = os.path.basename(os.path.dirname(p))
    os.makedirs(os.path.join(DST, lang), exist_ok=True)
    im = Image.open(p).convert('RGBA')
    assert im.size == (2160, 3840), f'{p} is {im.size}, expected 2160x3840'
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    bg = Image.new('RGB', im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    bg.save(os.path.join(DST, lang, os.path.basename(p)))

shutil.rmtree(SRC, ignore_errors=True)

for p in sorted(glob.glob(f'{DST}/*/*.png')):
    im = Image.open(p)
    print(f"{p}  {im.size}  {im.mode}  {os.path.getsize(p)//1024}KB")
