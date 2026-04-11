with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix tooltip to always use dark background
c = c.replace(
    'background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule',
    'background:"#121212",border:"1px solid rgba(255,255,255,0.15)"'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - tooltip background fixed")
