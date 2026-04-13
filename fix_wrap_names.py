with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Campaign selector (line 55)
c = c.replace(
    'title={c.campaignName} style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"help"}}>{c.campaignName}',
    'style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{c.campaignName}'
)
print("Fix 1: Campaign selector wraps names")

# Fix 2: Reporting tab objective tables (line 345)
c = c.replace(
    'title={r.name} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:200,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}',
    'style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:280,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.name}</div>'
)
print("Fix 2: Reporting objective tables wrap names")

# Fix 3: Deep dive campaign list (line 423)
c = c.replace(
    'style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}',
    'style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{c.campaignName}'
)
print("Fix 3: Deep dive campaign list wraps names")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All name wrapping fixes applied")
