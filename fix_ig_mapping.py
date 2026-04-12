with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add willowbrook → flower foundation mapping
c = c.replace(
    '(cn.indexOf("concord")>=0&&pn.indexOf("concord")>=0)',
    '(cn.indexOf("concord")>=0&&pn.indexOf("concord")>=0)||(cn.indexOf("willowbrook")>=0&&pn.indexOf("flower")>=0)'
)

# Fix in both places - getResult and community growth
c = c.replace(
    '(cnj.indexOf("psycho")>=0&&pnj.indexOf("psycho")>=0)',
    '(cnj.indexOf("psycho")>=0&&pnj.indexOf("psycho")>=0)||(cnj.indexOf("willowbrook")>=0&&pnj.indexOf("flower")>=0)'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Willowbrook mapped to Flower Foundation")
