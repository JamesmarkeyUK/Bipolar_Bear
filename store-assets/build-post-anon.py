# Post-process the Bipolar Anonymous renders (mirrors build-post.py):
#  - downscale android2x (2160×3840) -> android (1080×1920) with LANCZOS
#  - flatten iphone + ipad to RGB (no alpha) for store compliance
from PIL import Image
import glob, os, shutil

base = 'out/anonymous'
os.makedirs(f'{base}/android', exist_ok=True)

# 1) downscale 2x android renders
for p in sorted(glob.glob(f'{base}/android2x/*.png')):
    im = Image.open(p).convert('RGBA')
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    bg = Image.new('RGB', im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    bg.save(os.path.join(f'{base}/android', os.path.basename(p)))

# 2) flatten iphone + ipad sets to RGB
for p in sorted(glob.glob(f'{base}/iphone/*.png')) + sorted(glob.glob(f'{base}/ipad/*.png')):
    im = Image.open(p)
    if im.mode != 'RGB':
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode in ('RGBA', 'LA') else None)
        bg.save(p)

# 3) cleanup intermediate
shutil.rmtree(f'{base}/android2x', ignore_errors=True)

for p in (sorted(glob.glob(f'{base}/iphone/*.png'))
          + sorted(glob.glob(f'{base}/android/*.png'))
          + sorted(glob.glob(f'{base}/ipad/*.png'))):
    im = Image.open(p)
    print(f"{p}  {im.size}  {im.mode}  {os.path.getsize(p)//1024}KB")
