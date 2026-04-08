with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace('\\u2014', '\u2014')
c = c.replace('\\u00B7', '\u00B7')
c = c.replace('\\u2019', '\u2019')
c = c.replace('\\u2013', '\u2013')
c = c.replace('\\u0026', '&')
c = c.replace('\\u2026', '\u2026')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - unicode fixed")
