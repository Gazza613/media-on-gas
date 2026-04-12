with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Update tooltip to format CTR as percentage
c = c.replace(
    'var n=(p.name||"").toLowerCase();var dn=(p.dataKey||"").toLowerCase();if(n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost")>=0||dn.indexOf("value")>=0||n.indexOf("facebook")>=0||n.indexOf("instagram")>=0||n.indexOf("tiktok")>=0||n.indexOf("google")>=0)',
    'var n=(p.name||"").toLowerCase();var dn=(p.dataKey||"").toLowerCase();if(dn==="ctr"){display=typeof v==="number"?v.toFixed(2)+"%":v;} else if(n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost")>=0||dn.indexOf("value")>=0||n.indexOf("facebook")>=0||n.indexOf("instagram")>=0||n.indexOf("tiktok")>=0||n.indexOf("google")>=0)'
)

# Update the right Y axis formatter to show % for CTR values
c = c.replace(
    'return"R"+v.toFixed(2);',
    'return v<20?v.toFixed(2)+"%":"R"+v.toFixed(2);'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - CTR shows as percentage in chart")
