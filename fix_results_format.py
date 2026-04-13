with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix tooltip to show numbers for Results, currency for CostPer
old_tip = 'typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"?fR(p.value):p.value'
new_tip = 'typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"&&(p.name==="Results"||p.name==="Clicks")?fmt(p.value):typeof p.value==="number"?fR(p.value):p.value'
c = c.replace(old_tip, new_tip)
print("Fix: Tooltip shows numbers for Results, currency for CostPer")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
