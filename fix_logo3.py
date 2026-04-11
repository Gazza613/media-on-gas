with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Use the SVG logo from the website instead - much sharper
c = c.replace(
    'https://cdn.prod.website-files.com/6716222294e7b4b6c2add1e4/672af495c21c0fb947f1a023_GAS-42.png',
    'https://cdn.prod.website-files.com/6716222294e7b4b6c2add1e4/67173c3aead6f6c44872e341_logo.svg'
)

# Fix footer text
c = c.replace(
    'Powered by GAS Response Marketing',
    'Powered by GAS Marketing Automation'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - SVG logo and footer text")
