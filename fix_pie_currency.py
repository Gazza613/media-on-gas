with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The tooltip already handles currency for "spend" in the name
# But the pie chart data uses "value" not "spend" as the key
# Let's update the Tip function to also detect pie chart spend data
c = c.replace(
    'var n=(p.name||"").toLowerCase();if(n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost")>=0)',
    'var n=(p.name||"").toLowerCase();var dn=(p.dataKey||"").toLowerCase();if(n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost")>=0||dn.indexOf("value")>=0||n.indexOf("facebook")>=0||n.indexOf("instagram")>=0||n.indexOf("tiktok")>=0||n.indexOf("google")>=0)'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie chart shows currency")
