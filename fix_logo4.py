with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'https://cdn.prod.website-files.com/6716222294e7b4b6c2add1e4/67173c3aead6f6c44872e341_logo.svg',
    '/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - logo updated")
