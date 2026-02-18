"""Enhanced OCR on specific map border regions for coordinate values."""
import os
import re
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract

Image.MAX_IMAGE_PIXELS = None
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

plan_path = os.path.join(
    os.path.dirname(__file__),
    "kfar_chabad_data", "plans", "6256_2", "גז_12_525", "תשריט.jpg"
)

img = Image.open(plan_path)
w, h = img.size
print(f"Image: {w}x{h}")

# Map frame detected at (2875, 1581) → (8694, 4953)
fx, fy, fw, fh = 2875, 1581, 5819, 3372
fx2, fy2 = fx + fw, fy + fh

# Regions to analyze for coordinate labels
regions = {
    # Bottom edge - just below map frame (X-axis labels)
    "bottom_labels": (fx - 200, fy2, fx2 + 200, min(fy2 + 250, h)),
    # Top edge - just above map frame  
    "top_labels": (fx - 200, max(0, fy - 250), fx2 + 200, fy),
    # Left edge - just to the left of map frame (Y-axis labels)
    "left_labels": (max(0, fx - 400), fy - 200, fx, fy2 + 200),
    # Right edge
    "right_labels": (fx2, fy - 200, min(fx2 + 400, w), fy2 + 200),
    # Bottom-left corner (often has scale bar and coordinate reference)
    "bottom_left": (0, int(h * 0.7), int(w * 0.3), h),
    # Top-right corner (often has plan details)
    "top_right": (int(w * 0.6), 0, w, int(h * 0.3)),
    # Bottom strip of entire image
    "full_bottom": (0, h - 500, w, h),
    # Left strip of entire image
    "full_left": (0, 0, 600, h),
}

for name, (x1, y1, x2, y2) in regions.items():
    print(f"\n{'='*50}")
    print(f"Region: {name} ({x1},{y1}) → ({x2},{y2})")
    
    region = img.crop((x1, y1, x2, y2))
    
    # Scale up 3x for better OCR
    rw, rh = region.size
    region_3x = region.resize((rw * 3, rh * 3), Image.LANCZOS)
    
    # Convert to grayscale
    gray = region_3x.convert('L')
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(gray)
    enhanced = enhancer.enhance(2.0)
    
    # Binarize
    arr = np.array(enhanced)
    threshold = np.percentile(arr, 40)  # Find dark text
    binary = ((arr < threshold) * 255).astype(np.uint8)
    binary_img = Image.fromarray(binary)
    
    # Save for debugging
    binary_img.save(f"debug_ocr_{name}.png")
    
    # Run OCR - numbers only
    text_nums = pytesseract.image_to_string(binary_img, 
        config='--psm 6 -c tessedit_char_whitelist=0123456789.,- ').strip()
    
    # Run OCR - full text (for scale detection etc)
    text_full = pytesseract.image_to_string(binary_img, lang='eng',
        config='--psm 6').strip()
    
    if text_nums:
        print(f"  Numbers: {repr(text_nums[:200])}")
    if text_full:
        # Filter out noise
        lines = [l.strip() for l in text_full.split('\n') if l.strip() and len(l.strip()) >= 2]
        if lines:
            print(f"  Text ({len(lines)} lines):")
            for l in lines[:10]:
                print(f"    '{l}'")
    
    # Also try with different PSM modes
    for psm in [11, 12]:  # 11=sparse text, 12=sparse text with OSD
        text2 = pytesseract.image_to_string(binary_img,
            config=f'--psm {psm} -c tessedit_char_whitelist=0123456789').strip()
        # Find coordinate-like numbers
        nums = re.findall(r'\b(\d{3,6})\b', text2)
        if nums:
            print(f"  PSM{psm} numbers: {nums}")
    
    # Try inverted (white text on dark background)
    inv = Image.fromarray(255 - np.array(binary_img))
    text_inv = pytesseract.image_to_string(inv,
        config='--psm 6 -c tessedit_char_whitelist=0123456789., ').strip()
    if text_inv:
        print(f"  Inverted: {repr(text_inv[:200])}")

# Also scan specific small regions along the bottom edge at regular intervals
print(f"\n{'='*50}")
print("Scanning bottom edge for coordinate tick labels:")
for scan_x in range(fx, fx2, 200):
    micro = img.crop((scan_x - 30, fy2 - 20, scan_x + 200, fy2 + 180))
    micro_3x = micro.resize((micro.size[0] * 4, micro.size[1] * 4), Image.LANCZOS)
    gray_m = micro_3x.convert('L')
    arr_m = np.array(gray_m)
    thresh_m = np.percentile(arr_m, 30)
    bin_m = ((arr_m < thresh_m) * 255).astype(np.uint8)
    text_m = pytesseract.image_to_string(Image.fromarray(bin_m),
        config='--psm 7 -c tessedit_char_whitelist=0123456789').strip()
    if text_m and len(text_m) >= 3:
        print(f"  x={scan_x}: '{text_m}'")

print(f"\n{'='*50}")
print("Scanning left edge for coordinate tick labels:")
for scan_y in range(fy, fy2, 200):
    micro = img.crop((fx - 200, scan_y - 30, fx + 20, scan_y + 150))
    micro_3x = micro.resize((micro.size[0] * 4, micro.size[1] * 4), Image.LANCZOS)
    gray_m = micro_3x.convert('L')
    arr_m = np.array(gray_m)
    thresh_m = np.percentile(arr_m, 30)
    bin_m = ((arr_m < thresh_m) * 255).astype(np.uint8)
    text_m = pytesseract.image_to_string(Image.fromarray(bin_m),
        config='--psm 7 -c tessedit_char_whitelist=0123456789').strip()
    if text_m and len(text_m) >= 3:
        print(f"  y={scan_y}: '{text_m}'")

img.close()
