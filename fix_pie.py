with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Update the Spend pie chart to show percentages
# Replace the pie legend to include percentages
c = c.replace(
    '{[{n:"FB",v:computed.fb.spend,c:P.fb},{n:"IG",v:computed.ig.spend,c:P.ig},{n:"TT",v:t.spend,c:P.tt}].map(function(p){return <div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontFamily:fm}}>{p.n} {fR(p.v)}</span></div>;})}',
    '{(function(){var total=computed.fb.spend+computed.ig.spend+t.spend;return [{n:"FB",v:computed.fb.spend,c:P.fb},{n:"IG",v:computed.ig.spend,c:P.ig},{n:"TT",v:t.spend,c:P.tt}].map(function(p){var pct=total>0?(p.v/total*100).toFixed(1):"0.0";return <div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontFamily:fm}}>{p.n} {fR(p.v)} ({pct}%)</span></div>;});})()}'
)

# Add percentage labels to the impressions pie/bar legend
c = c.replace(
    '{[{n:"Meta",v:m.impressions,c:P.fb},{n:"TikTok",v:t.impressions,c:P.tt}]',
    '{(function(){var total2=m.impressions+t.impressions;return [{n:"Meta",v:m.impressions,c:P.fb},{n:"TikTok",v:t.impressions,c:P.tt}]'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie chart percentages added")
