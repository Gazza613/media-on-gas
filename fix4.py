with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()
c = c.replace(' \u2014 ', ', ')
c = c.replace(' — ', ', ')
with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - commas replacing dashes")
