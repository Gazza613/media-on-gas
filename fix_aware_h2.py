with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace('background:"#003a55",border:"1px solid "+P.rule', 'background:"#F96203",border:"1px solid #E85500"')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
print("Remaining #003a55:", c.count("#003a55"))
