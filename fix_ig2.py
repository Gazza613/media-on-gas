with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix community growth section - bare ig references
c = c.replace("value:ig.pageLikes", "value:computed.ig.pageLikes")
c = c.replace("{fmt(ig.pageLikes)}", "{fmt(computed.ig.pageLikes)}")
c = c.replace("m.pageLikes+ig.pageLikes+t.follows", "m.pageLikes+computed.ig.pageLikes+t.follows")
c = c.replace("({fmt(ig.pageLikes)}", "({fmt(computed.ig.pageLikes)}")
c = c.replace("Instagram ({fmt(ig.pageLikes)})", "Instagram ({fmt(computed.ig.pageLikes)})")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)

# Verify
with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    check = f.read()

import re
# Find any ig. that isn't computed.ig. or P.ig
matches = re.findall(r'(?<!computed\.)(?<!P\.)(?<!\w)ig\.', check)
print("Done - remaining bare ig references:", len(matches))
for m in matches:
    print("  Found:", m)
