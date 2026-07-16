import sys
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def process():
    print("Processing rope climber raw...")
    img = Image.open('rope_climber_raw.png').convert('RGBA')
    w, h = img.size
    
    if w == h:
        print("Detected 2x2 grid. Slicing into 1x4...")
        fw = w // 2
        fh = h // 2
        f1 = img.crop((0, 0, fw, fh))
        f2 = img.crop((fw, 0, w, fh))
        f3 = img.crop((0, fh, fw, h))
        f4 = img.crop((fw, fh, w, h))
        new_img = Image.new('RGBA', (fw * 4, fh))
        new_img.paste(f1, (0, 0))
        new_img.paste(f2, (fw, 0))
        new_img.paste(f3, (fw * 2, 0))
        new_img.paste(f4, (fw * 3, 0))
    else:
        print("Detected non-square image. Assuming it is already 1x4.")
        new_img = img

    print("Removing white background...")
    datas = new_img.getdata()
    newData = []
    for item in datas:
        # Check for near-white pixels and make them transparent
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    new_img.putdata(newData)
    
    print("Scaling down to 512x128...")
    new_img = new_img.resize((512, 128), Image.Resampling.LANCZOS)
    
    new_img.save('rope_climber_1x4.png', 'PNG')
    print("Saved rope_climber_1x4.png successfully!")

if __name__ == '__main__':
    process()
