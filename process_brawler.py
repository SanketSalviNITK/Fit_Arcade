from PIL import Image
import sys

def process(input_file, output_file, max_size):
    print(f"Processing {input_file}...")
    img = Image.open(input_file).convert('RGBA')
    
    datas = img.getdata()
    newData = []
    for item in datas:
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    w, h = img.size
    scale = max_size / max(w, h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    img.save(output_file, 'PNG')
    print(f"Saved {output_file}!")

if __name__ == '__main__':
    process('hero_raw.png', 'hero.png', 150)
