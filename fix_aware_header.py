with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The awareness table uses #002a40 borders instead of #003a55
c = c.replace('background:"#004F71",border:"1px solid #002a40"', 'background:"#F96203",border:"1px solid #E85500"')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - awareness header fixed")
