import sys
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def process():
    print("Processing climber_raw.png...")
    img = Image.open('climber_raw.png').convert('RGBA')
    w, h = img.size
    
    # We assume it's a 2x2 grid from the AI generator
    fw = w // 2
    fh = h // 2
    
    # Crop the 4 frames
    f1 = img.crop((0, 0, fw, fh))
    f2 = img.crop((fw, 0, w, fh))
    f3 = img.crop((0, fh, fw, h))
    f4 = img.crop((fw, fh, w, h))
    
    # Create new 1x4 image
    new_img = Image.new('RGBA', (fw * 4, fh))
    new_img.paste(f1, (0, 0))
    new_img.paste(f2, (fw, 0))
    new_img.paste(f3, (fw * 2, 0))
    new_img.paste(f4, (fw * 3, 0))
    
    print("Removing white background...")
    datas = new_img.getdata()
    newData = []
    for item in datas:
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    new_img.putdata(newData)
    
    print("Scaling down...")
    new_img = new_img.resize((512, 128), Image.Resampling.LANCZOS)
    
    new_img.save('climber_1x4.png', 'PNG')
    print("Saved climber_1x4.png successfully!")

if __name__ == '__main__':
    process()
