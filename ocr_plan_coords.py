"""
Read coordinate grid labels from plan map borders using OCR.
"""
import os
import re
import numpy as np
from PIL import Image
import pytesseract

Image.MAX_IMAGE_PIXELS = None

# Set Tesseract path
TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]
for tp in TESSERACT_PATHS:
    if os.path.exists(tp):
        pytesseract.pytesseract.tesseract_cmd = tp
        break


def extract_numbers_from_region(img_region, name="", psm=7, invert=False):
    """Extract numbers from an image region using OCR."""
    # Convert to grayscale if needed
    if img_region.mode != 'L':
        img_region = img_region.convert('L')
    
    arr = np.array(img_region)
    
    # Enhance contrast
    if invert:
        arr = 255 - arr
    
    # Binary threshold
    threshold = np.mean(arr) - 20
    arr = ((arr < threshold) * 255).astype(np.uint8)
    
    enhanced = Image.fromarray(arr)
    
    # Run OCR with digit-only whitelist
    config = f'--psm {psm} -c tessedit_char_whitelist=0123456789.,'
    try:
        text = pytesseract.image_to_string(enhanced, config=config).strip()
    except:
        text = ""
    
    return text


def analyze_plan_coordinates(image_path):
    """Analyze plan map to extract coordinate grid values."""
    print(f"Loading: {os.path.basename(image_path)}")
    img = Image.open(image_path)
    w, h = img.size
    print(f"  Size: {w}x{h}")
    
    # The map frame was detected at (2875, 1581) → (8694, 4953)
    # Coordinate labels should be just outside these boundaries
    frame_x, frame_y = 2875, 1581
    frame_w, frame_h = 5819, 3372
    frame_x2 = frame_x + frame_w
    frame_y2 = frame_y + frame_h
    
    # Strategy 1: Read bottom border (X-axis coordinate labels)
    print("\n=== Bottom border (X coordinates) ===")
    # Crop a strip just below the map frame
    bottom_strip = img.crop((frame_x, frame_y2, frame_x2, min(frame_y2 + 300, h)))
    bottom_strip.save("debug_bottom_strip.png")
    
    # Also try the very bottom of the image
    bottom_strip2 = img.crop((0, h - 400, w, h))
    bottom_strip2.save("debug_bottom_strip2.png")
    
    # Scan along the bottom border in segments
    segment_width = 500  # pixels
    for start_x in range(frame_x, frame_x2, segment_width):
        end_x = min(start_x + segment_width, frame_x2)
        segment = img.crop((start_x, frame_y2 - 50, end_x, frame_y2 + 200))
        text = extract_numbers_from_region(segment, f"bottom_x{start_x}")
        if text and len(text) >= 3:
            print(f"    x={start_x}: '{text}'")
    
    # Strategy 2: Read left border (Y-axis coordinate labels)
    print("\n=== Left border (Y coordinates) ===")
    left_strip = img.crop((max(0, frame_x - 400), frame_y, frame_x, frame_y2))
    left_strip.save("debug_left_strip.png")
    
    # Scan along the left border
    segment_height = 500
    for start_y in range(frame_y, frame_y2, segment_height):
        end_y = min(start_y + segment_height, frame_y2)
        segment = img.crop((max(0, frame_x - 300), start_y, frame_x + 50, end_y))
        text = extract_numbers_from_region(segment, f"left_y{start_y}")
        if text and len(text) >= 3:
            print(f"    y={start_y}: '{text}'")
    
    # Strategy 3: Read all text in the border regions
    print("\n=== Full border OCR ===")
    
    # Bottom region
    bottom_region = img.crop((0, frame_y2 - 100, w, min(frame_y2 + 400, h)))
    bottom_text = pytesseract.image_to_string(bottom_region, lang='heb+eng',
                                              config='--psm 6')
    print(f"  Bottom text: {repr(bottom_text[:300])}")
    
    # Top region  
    top_region = img.crop((0, 0, w, frame_y + 100))
    top_text = pytesseract.image_to_string(top_region, lang='heb+eng',
                                           config='--psm 6')
    print(f"  Top text: {repr(top_text[:300])}")
    
    # Left region
    left_region = img.crop((0, 0, frame_x + 100, h))
    left_text = pytesseract.image_to_string(left_region, lang='heb+eng',
                                            config='--psm 6')
    print(f"  Left text: {repr(left_text[:300])}")
    
    # Right region
    right_region = img.crop((frame_x2 - 100, 0, w, h))
    right_text = pytesseract.image_to_string(right_region, lang='heb+eng',
                                             config='--psm 6')
    print(f"  Right text: {repr(right_text[:300])}")
    
    # Strategy 4: Look for numbers that could be coordinates
    # Israeli grid coordinates are typically 6-digit numbers (e.g., 186500, 655500)
    print("\n=== Coordinate-like numbers found ===")
    all_text = bottom_text + ' ' + top_text + ' ' + left_text + ' ' + right_text
    
    # Find 5-6 digit numbers
    numbers = re.findall(r'\b(\d{5,6})\b', all_text)
    if numbers:
        print(f"  5-6 digit numbers: {numbers}")
    
    # Find numbers with dots/commas (like 186.500 or 186,500)
    formatted_nums = re.findall(r'\b(\d{2,3}[.,]\d{3})\b', all_text)
    if formatted_nums:
        print(f"  Formatted numbers: {formatted_nums}")
    
    # Find 3-digit numbers (abbreviated coordinates like 186, 655)
    short_nums = re.findall(r'\b(\d{3})\b', all_text)
    if short_nums:
        # Filter to likely coordinate values
        coord_like = [n for n in short_nums if 130 <= int(n) <= 250 or 600 <= int(n) <= 700]
        if coord_like:
            print(f"  Possible coordinate values (3-digit): {coord_like}")
    
    # Try with individual number detection in specific regions
    print("\n=== Individual number detection along borders ===")
    
    # Detect number boxes using OCR data output
    try:
        # Use image_to_data for positioned text
        for region_name, region in [
            ("bottom", img.crop((frame_x, frame_y2 - 50, frame_x2, min(frame_y2 + 300, h)))),
            ("left", img.crop((max(0, frame_x - 400), frame_y, frame_x + 50, frame_y2))),
        ]:
            data = pytesseract.image_to_data(region, config='--psm 6 -c tessedit_char_whitelist=0123456789.',
                                              output_type=pytesseract.Output.DICT)
            print(f"\n  {region_name} border numbers:")
            for i in range(len(data['text'])):
                text = data['text'][i].strip()
                conf = int(data['conf'][i])
                if text and conf > 30 and len(text) >= 2:
                    x = data['left'][i]
                    y = data['top'][i]
                    print(f"    '{text}' at ({x},{y}) conf={conf}%")
    except Exception as e:
        print(f"  Error: {e}")
    
    # Strategy 5: Look for scale text
    print("\n=== Scale detection ===")
    # Scale is often at the bottom of the map
    scale_region = img.crop((0, int(h * 0.85), w, h))
    scale_text = pytesseract.image_to_string(scale_region, lang='heb+eng',
                                              config='--psm 6')
    
    # Look for scale patterns
    scale_matches = re.findall(r'1\s*:\s*(\d+)', scale_text)
    if scale_matches:
        print(f"  Scale found: 1:{scale_matches[0]}")
    else:
        print(f"  Scale text: {repr(scale_text[:200])}")
    
    img.close()


if __name__ == "__main__":
    plan_path = os.path.join(
        os.path.dirname(__file__),
        "kfar_chabad_data", "plans", "6256_2", "גז_12_525", "תשריט.jpg"
    )
    analyze_plan_coordinates(plan_path)
