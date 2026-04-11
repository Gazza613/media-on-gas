with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add PERCENT label to pie chart cells using Recharts Pie label prop
# For the impression pie, add a label
c = c.replace(
    'data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend}]} cx="50%" cy="50%" outerRadius={72} innerRadius={44} paddingAngle={4} dataKey="value" stroke="none"><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Pie>',
    'data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend}]} cx="50%" cy="50%" outerRadius={72} innerRadius={44} paddingAngle={4} dataKey="value" stroke="none" label={function(entry){var total=computed.fb.spend+computed.ig.spend+t.spend;var pct=total>0?(entry.value/total*100).toFixed(0):0;return pct>0?pct+"%":"";}}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Pie>'
)

# Also for impression pie if it exists
c = c.replace(
    'data={[{name:"Facebook",value:computed.fb.impressions},{name:"Instagram",value:computed.ig.impressions},{name:"TikTok",value:t.impressions}]}',
    'data={[{name:"Facebook",value:computed.fb.impressions},{name:"Instagram",value:computed.ig.impressions},{name:"TikTok",value:t.impressions}]}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie chart percentages added")
