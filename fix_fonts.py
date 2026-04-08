with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'var ff="Outfit,Segoe UI,Trebuchet MS,sans-serif",fm="Consolas,Lucida Console,Courier New,monospace";',
    'var ff="Outfit,Segoe UI,sans-serif",fm="JetBrains Mono,Consolas,monospace";'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - fonts upgraded")
