from PIL import Image, ImageDraw

def draw_character(draw, x_offset, y_offset, frame):
    # Colors
    skin = (255, 200, 150)
    hair = (255, 0, 128) # Cyberpunk pink hair
    jacket = (40, 40, 60)
    pants = (20, 20, 30)
    boots = (10, 10, 10)
    neon = (0, 255, 200)
    
    # Head (Back facing, so mostly hair)
    draw.rectangle([x_offset+56, y_offset+20, x_offset+72, y_offset+36], fill=hair)
    
    # Body (Jacket)
    draw.rectangle([x_offset+50, y_offset+36, x_offset+78, y_offset+70], fill=jacket)
    # Neon stripe on back
    draw.line([x_offset+64, y_offset+36, x_offset+64, y_offset+60], fill=neon, width=2)
    
    # Rope (center of frame)
    if frame < 3: # In frames 0, 1, 2 player is on the rope
        draw.line([x_offset+64, 0, x_offset+64, 128], fill=(150, 100, 50), width=4)
        
    if frame == 0:
        # Clinging
        # Arms
        draw.line([x_offset+50, y_offset+40, x_offset+64, y_offset+30], fill=jacket, width=6) # Left arm
        draw.line([x_offset+78, y_offset+40, x_offset+64, y_offset+30], fill=jacket, width=6) # Right arm
        # Hands grasping rope
        draw.rectangle([x_offset+60, y_offset+24, x_offset+68, y_offset+32], fill=skin)
        # Legs
        draw.rectangle([x_offset+54, y_offset+70, x_offset+62, y_offset+100], fill=pants) # Left leg
        draw.rectangle([x_offset+66, y_offset+70, x_offset+74, y_offset+100], fill=pants) # Right leg

    elif frame == 1:
        # Reaching (Left hand up, right hand holding)
        # Left Arm (reaching high)
        draw.line([x_offset+50, y_offset+40, x_offset+60, y_offset+10], fill=jacket, width=6)
        draw.rectangle([x_offset+58, y_offset+4, x_offset+66, y_offset+12], fill=skin) # Hand
        # Right Arm (holding low)
        draw.line([x_offset+78, y_offset+40, x_offset+64, y_offset+40], fill=jacket, width=6)
        # Legs (one bent)
        draw.rectangle([x_offset+54, y_offset+70, x_offset+62, y_offset+80], fill=pants) # Left leg bent
        draw.rectangle([x_offset+54, y_offset+80, x_offset+64, y_offset+88], fill=pants) # Left foot on rope
        draw.rectangle([x_offset+66, y_offset+70, x_offset+74, y_offset+100], fill=pants) # Right leg straight

    elif frame == 2:
        # Pulling (Both hands high on rope)
        # Arms bent upwards
        draw.line([x_offset+50, y_offset+40, x_offset+64, y_offset+15], fill=jacket, width=6)
        draw.line([x_offset+78, y_offset+40, x_offset+64, y_offset+15], fill=jacket, width=6)
        draw.rectangle([x_offset+60, y_offset+10, x_offset+68, y_offset+18], fill=skin)
        # Both legs bent
        draw.rectangle([x_offset+50, y_offset+70, x_offset+60, y_offset+80], fill=pants) 
        draw.rectangle([x_offset+68, y_offset+70, x_offset+78, y_offset+80], fill=pants) 
        
    elif frame == 3:
        # Leaping (Leaning to the right, off the rope)
        # Shift body right
        draw.rectangle([x_offset+50, y_offset+20, x_offset+128, y_offset+128], fill=(255,255,255)) # clear
        # Re-draw at angle
        draw.rectangle([x_offset+70, y_offset+20, x_offset+86, y_offset+36], fill=hair) # Head
        draw.polygon([(x_offset+60, y_offset+36), (x_offset+88, y_offset+36), (x_offset+100, y_offset+70), (x_offset+72, y_offset+70)], fill=jacket)
        # Arms outstretched
        draw.line([x_offset+60, y_offset+40, x_offset+40, y_offset+30], fill=jacket, width=6)
        draw.line([x_offset+88, y_offset+40, x_offset+110, y_offset+20], fill=jacket, width=6)
        # Legs leaping
        draw.line([x_offset+72, y_offset+70, x_offset+60, y_offset+100], fill=pants, width=8)
        draw.line([x_offset+100, y_offset+70, x_offset+110, y_offset+90], fill=pants, width=8)


# Create 512x128 white image
img = Image.new('RGB', (512, 128), color = (255, 255, 255))
draw = ImageDraw.Draw(img)

# Draw 4 frames
for i in range(4):
    x_offset = i * 128
    # Draw frame border for testing (optional, let's keep it clean)
    draw_character(draw, x_offset, 0, i)

# Save as PNG
img.save('rope_climber_1x4.png')
print("Saved rope_climber_1x4.png")
