with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add CTR to the chart data
c = c.replace(
    '{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc}',
    '{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc,CTR:computed.fb.ctr}'
)
c = c.replace(
    '{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc}',
    '{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc,CTR:computed.ig.ctr}'
)
c = c.replace(
    '{name:"TikTok",Clicks:t.clicks,CPC:t.cpc}',
    '{name:"TikTok",Clicks:t.clicks,CPC:t.cpc,CTR:t.ctr}'
)
c = c.replace(
    '{name:"Google",Clicks:computed.gd.clicks,CPC:computed.gd.cpc}',
    '{name:"Google",Clicks:computed.gd.clicks,CPC:computed.gd.cpc,CTR:computed.gd.ctr}'
)

# Add CTR line after CPC line
c = c.replace(
    '<Line yAxisId="right" type="monotone" dataKey="CPC" stroke={P.ember} strokeWidth={2.5} dot={{r:5,fill:P.ember}} activeDot={{r:7}}/></ComposedChart>',
    '<Line yAxisId="right" type="monotone" dataKey="CPC" stroke={P.ember} strokeWidth={2.5} dot={{r:5,fill:P.ember}} activeDot={{r:7}}/><Line yAxisId="right" type="monotone" dataKey="CTR" stroke={P.cyan} strokeWidth={2.5} dot={{r:5,fill:P.cyan}} activeDot={{r:7}} strokeDasharray="5 5"/></ComposedChart>'
)

# Update the chart title
c = c.replace(
    '>Clicks & CPC by Platform<',
    '>Clicks, CPC & CTR by Platform<'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - CTR trendline added")
