with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace("{fmt(ig.pageLikes)}", "{fmt(computed.ig.pageLikes)}")
c = c.replace("{fmt(ig.pageLikes+", "{fmt(computed.ig.pageLikes+")
c = c.replace("({fmt(m.pageLikes+ig.pageLikes+", "({fmt(m.pageLikes+computed.ig.pageLikes+")
c = c.replace("Instagram ({fmt(ig.pageLikes)}", "Instagram ({fmt(computed.ig.pageLikes)}")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - ig references fixed")
