# Downscale the 2x android render -> 1080x1920 (LANCZOS) and flatten to RGB.
from PIL import Image

im = Image.open('out/steps/android2x.png').convert('RGBA')
im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
bg = Image.new('RGB', im.size, (255, 255, 255))
bg.paste(im, mask=im.split()[-1])
bg.save('out/steps/android.png')

ip = Image.open('out/steps/iphone.png')
if ip.mode != 'RGB':
    b = Image.new('RGB', ip.size, (255, 255, 255))
    b.paste(ip, mask=ip.split()[-1] if ip.mode in ('RGBA', 'LA') else None)
    b.save('out/steps/iphone.png')

for p in ('out/steps/iphone.png', 'out/steps/android.png'):
    i = Image.open(p)
    print(f"{p}  {i.size}  {i.mode}")
