from PIL import Image

def process():
    print("Fixing raw image...")
    img = Image.open('rope_climber_raw.png').convert('RGBA')
    
    print("Removing white background...")
    datas = img.getdata()
    newData = []
    for item in datas:
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    
    # Crop to the actual drawn content (ignoring the massive white borders)
    bbox = img.getbbox()
    if bbox:
        print("Bounding box:", bbox)
        img = img.crop(bbox)
    
    w, h = img.size
    print(f"Cropped size: {w}x{h}")
    
    print("Scaling down to 512x128 spritesheet...")
    img = img.resize((512, 128), Image.Resampling.LANCZOS)
    
    img.save('rope_climber_1x4.png', 'PNG')
    print("Saved fixed rope_climber_1x4.png!")

if __name__ == '__main__':
    process()
