from PIL import Image
import sys

def process_2x2_to_1x4(input_file, output_file):
    print(f"Processing {input_file}...")
    try:
        img = Image.open(input_file).convert('RGBA')
    except Exception as e:
        print(f"Could not open {input_file}: {e}")
        return
        
    # Remove white background and light gray anti-aliasing
    datas = img.getdata()
    newData = []
    for item in datas:
        if item[0] > 200 and item[1] > 200 and item[2] > 200:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    
    # The image is a 2x2 grid. We crop slightly inwards to avoid AI grid lines (black borders)
    w, h = img.size
    half_w = w // 2
    half_h = h // 2
    
    margin = 8 # Crop 8 pixels from the edge of each quadrant to remove grid lines
    
    frames = [
        img.crop((margin, margin, half_w - margin, half_h - margin)),
        img.crop((half_w + margin, margin, w - margin, half_h - margin)),
        img.crop((margin, half_h + margin, half_w - margin, h - margin)),
        img.crop((half_w + margin, half_h + margin, w - margin, h - margin))
    ]
    
    # Create 1x4 horizontal strip
    # New frame width and height
    fw = half_w - 2 * margin
    fh = half_h - 2 * margin
    
    new_w = fw * 4
    new_img = Image.new('RGBA', (new_w, fh))
    
    for i, frame in enumerate(frames):
        new_img.paste(frame, (i * fw, 0))
        
    # Scale down cleanly to 128x128 per frame
    target_frame_size = 128
    new_img = new_img.resize((target_frame_size * 4, target_frame_size), Image.Resampling.LANCZOS)
    
    new_img.save(output_file, 'PNG')
    print(f"Saved {output_file} successfully!")

if __name__ == '__main__':
    process_2x2_to_1x4('hero_punch_raw.png', 'hero_punch_sheet.png')
    process_2x2_to_1x4('thug_run_raw.png', 'thug_run_sheet.png')
    process_2x2_to_1x4('thug_punch_raw.png', 'thug_punch_sheet.png')
