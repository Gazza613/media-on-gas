with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()
c = c.replace('>N/A<', '>0<')
c = c.replace('"N/A"', '"0"')
c = c.replace("'N/A'", "'0'")
c = c.replace('{t.cpm>0?fR(t.cpm):"N/A"}', '{fR(t.cpm)}')
with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - N/A replaced with 0")
