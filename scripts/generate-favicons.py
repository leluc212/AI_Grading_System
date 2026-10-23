import os
import base64
from PIL import Image, ImageDraw, ImageFont
import numpy as np

src_path = 'apps/web-submitter/public/logo-aws-fcaj.png'
if not os.path.exists(src_path):
    raise FileNotFoundError(f"Missing {src_path}")

src = Image.open(src_path)
aws_crop = src.crop((0, 82, 2820, 1769))
arr = np.array(aws_crop)

# Mask smile
smile_mask = np.zeros(arr.shape[:2], dtype=bool)
smile_mask[1050:, :] = arr[1050:, :, 3] > 10

colored_arr = arr.copy()
colored_arr[smile_mask, 0] = 255
colored_arr[smile_mask, 1] = 153
colored_arr[smile_mask, 2] = 0
aws_colored = Image.fromarray(colored_arr)

size = 512
bg_color = (19, 25, 33, 255) # AWS Dark #131921

base_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(base_img)
draw.rounded_rectangle([12, 12, size - 12, size - 12], radius=100, fill=bg_color)

# AWS Logo
target_w = int(size * 0.74)
target_h = int(aws_crop.height * target_w / aws_crop.width)
aws_resized = aws_colored.resize((target_w, target_h), Image.Resampling.LANCZOS)
base_img.paste(aws_resized, ((size - target_w) // 2, 48), aws_resized)

# FCAJ badge
try:
    font = ImageFont.truetype('arialbd.ttf', 76)
except Exception:
    font = ImageFont.load_default()

badge_w = 270
badge_h = 80
bx = (size - badge_w) // 2
by = 48 + target_h + 28
draw.rounded_rectangle([bx, by, bx + badge_w, by + badge_h], radius=24, fill=(255, 153, 0, 255))
draw.text((size // 2, by + badge_h // 2 - 2), 'FCAJ', fill=(19, 25, 33, 255), font=font, anchor='mm')

dirs = ['apps/web-submitter/public', 'apps/web-admin/public']
for d in dirs:
    os.makedirs(d, exist_ok=True)
    # 512x512
    base_img.save(os.path.join(d, 'favicon.png'), format='PNG')
    # 180x180 (apple touch)
    apple = base_img.resize((180, 180), Image.Resampling.LANCZOS)
    apple.save(os.path.join(d, 'apple-touch-icon.png'), format='PNG')
    # 32x32
    s32 = base_img.resize((32, 32), Image.Resampling.LANCZOS)
    s32.save(os.path.join(d, 'favicon-32x32.png'), format='PNG')
    # 16x16
    s16 = base_img.resize((16, 16), Image.Resampling.LANCZOS)
    s16.save(os.path.join(d, 'favicon-16x16.png'), format='PNG')
    # favicon.ico
    base_img.save(os.path.join(d, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

    # SVG favicon
    with open(os.path.join(d, 'favicon.png'), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image href="data:image/png;base64,{b64}" width="512" height="512"/>
</svg>'''
    with open(os.path.join(d, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f'Successfully generated icons in {d}')
