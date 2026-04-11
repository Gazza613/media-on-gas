with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Match both "appinstall" and "appinstal" (typo in campaign name)
c = c.replace(
    'if(n.indexOf("appinstall")>=0||n.indexOf("app install")>=0)return "App Store Clicks";',
    'if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - matches AppInstal with one L too")
