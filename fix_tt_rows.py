with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the TikTok awareness row and check what's there
import re
lines = c.split('\n')
for i, line in enumerate(lines):
    if 'TikTok</span></td>' in line and '#002a40' in line:
        print(f"Line {i+1}: Awareness TikTok row found")
        # Print a snippet
        print(line[line.find('TikTok'):line.find('TikTok')+200])
    if 'TikTok</span></td>' in line and 'P.rule' in line and 'Reach' not in line:
        print(f"Line {i+1}: Engagement TikTok row found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - checked TikTok rows")
