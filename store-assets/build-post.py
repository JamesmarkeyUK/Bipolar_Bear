# Post-process renders:
#  - downscale android2x (2160×3840) -> android (1080×1920) with LANCZOS
#  - flatten every output to RGB (no alpha) for store compliance
from PIL import Image
import glob, os, shutil

os.makedirs('out/android', exist_ok=True)

# 1) downscale 2x android renders
for p in sorted(glob.glob('out/android2x/*.png')):
    im = Image.open(p).convert('RGBA')
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    bg = Image.new('RGB', im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    bg.save(os.path.join('out/android', os.path.basename(p)))

# 2) flatten iphone set to RGB
for p in sorted(glob.glob('out/iphone/*.png')):
    im = Image.open(p)
    if im.mode != 'RGB':
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode in ('RGBA', 'LA') else None)
        bg.save(p)

# 3) cleanup intermediate
shutil.rmtree('out/android2x', ignore_errors=True)

for p in sorted(glob.glob('out/iphone/*.png')) + sorted(glob.glob('out/android/*.png')):
    im = Image.open(p)
    print(f"{p}  {im.size}  {im.mode}  {os.path.getsize(p)//1024}KB")
