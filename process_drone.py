from PIL import Image

def process():
    print("Processing drone...")
    img = Image.open('drone_raw.png').convert('RGBA')
    
    # Remove white background
    datas = img.getdata()
    newData = []
    for item in datas:
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    
    # Crop tight
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    w, h = img.size
    aspect = h / w
    new_w = 150
    new_h = int(new_w * aspect)
    
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    img.save('hover_drone.png', 'PNG')
    print("Saved hover_drone.png!")

if __name__ == '__main__':
    process()
