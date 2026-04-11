with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Update brand colours to match CI
c = c.replace('void:"#06020e"', 'void:"#121212"')
c = c.replace('cosmos:"#0d0618"', 'cosmos:"#121212"')
c = c.replace('nebula:"#150b24"', 'nebula:"#1a1a1a"')
c = c.replace('ember:"#FF6B00"', 'ember:"#F96203"')
c = c.replace('lava:"#E8231A"', 'lava:"#FF2222"')
c = c.replace('txt:"#EDE9F5"', 'txt:"#FFFBF8"')

# Update font families
c = c.replace(
    'var ff="Outfit,Segoe UI,sans-serif",fm="JetBrains Mono,Consolas,monospace";',
    'var ff="Poppins,Outfit,Segoe UI,sans-serif",fm="JetBrains Mono,Consolas,monospace";'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - brand CI updated")
