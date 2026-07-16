import sys
import subprocess

try:
    from PIL import Image
except ImportError:
    print("Pillow not found, installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def process_image(input_path, output_path):
    print("Opening image...")
    img = Image.open(input_path).convert("RGBA")
    
    print("Resizing to a clean 4-frame sprite sheet (256x64)...")
    img = img.resize((256, 64), Image.Resampling.LANCZOS)
    
    print("Removing white background...")
    datas = img.getdata()
    newData = []
    for item in datas:
        # If the pixel is mostly white, make it fully transparent
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Success! Saved processed sprite sheet to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python process_sprite.py <input> <output>")
    else:
        process_image(sys.argv[1], sys.argv[2])
