with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the status badge with a smarter one that checks dates
c = c.replace(
    """{c.status&&c.status!=="active"&&<span style={{color:c.status==="scheduled"?P.solar:c.status==="pending"?P.cyan:c.status==="completed"?P.sub:P.warning,fontWeight:700,textTransform:"uppercase",marginLeft:4}}>{c.status}</span>}""",
    """{(function(){var tag="";var tagColor=P.dim;if(c.endDate&&new Date(c.endDate)<new Date()){tag="COMPLETED";tagColor=P.sub;}else if(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused"){tag="PAUSED";tagColor=P.warning;}else if(c.status==="scheduled"){tag="SCHEDULED";tagColor=P.solar;}if(!tag)return null;return <span style={{background:tagColor+"20",color:tagColor,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>{tag}</span>;})()}"""
)

# Try alternative format if first didn't match
c = c.replace(
    """{c.status&&c.status!=="active"&&<span style={{background:c.status==="scheduled"?P.solar+"20":c.status==="paused"?P.warning+"20":c.status==="completed"?P.sub+"20":P.dim+"20",color:c.status==="scheduled"?P.solar:c.status==="paused"?P.warning:c.status==="completed"?P.sub:P.dim,fontWeight:700,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>{c.status}</span>}""",
    """{(function(){var tag="";var tagColor=P.dim;if(c.endDate&&new Date(c.endDate)<new Date()){tag="COMPLETED";tagColor=P.sub;}else if(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused"){tag="PAUSED";tagColor=P.warning;}else if(c.status==="scheduled"){tag="SCHEDULED";tagColor=P.solar;}if(!tag)return null;return <span style={{background:tagColor+"20",color:tagColor,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>{tag}</span>;})()}"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - smart status tags")
