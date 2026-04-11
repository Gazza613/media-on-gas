with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Change all table headers from blue/yellow to GAS orange/white
c = c.replace('color:"#FFCB05",textAlign:', 'color:"#fff",textAlign:')
c = c.replace('background:"#004F71",border:"1px solid #003a55"', 'background:"#F96203",border:"1px solid #E85500"')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all table headers GAS orange with white text")
