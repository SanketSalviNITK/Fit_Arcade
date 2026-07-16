from PIL import Image

def process():
    print("Processing industrial cable...")
    img = Image.open('cable_raw.png').convert('RGBA')
    w, h = img.size
    
    # Remove white background
    datas = img.getdata()
    newData = []
    for item in datas:
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    
    # Crop tight to the rope
    bbox = img.getbbox()
    if bbox:
        print("Bounding box:", bbox)
        img = img.crop(bbox)
        
    # Resize to a clean 32px wide vertical texture
    img = img.resize((32, 512), Image.Resampling.LANCZOS)
    img.save('rope_texture.png', 'PNG')
    print("Saved rope_texture.png!")

if __name__ == '__main__':
    process()
