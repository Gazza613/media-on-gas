with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the current complex tag logic and replace with simple one
old_start = '{(function(){var n=(c.campaignName||"").toLowerCase();var now=new Date();var curMonth'
old_end = 'return null;})()}'

idx = c.find(old_start)
if idx > 0:
    end_idx = c.find(old_end, idx) + len(old_end)
    old_block = c[idx:end_idx]
    
    new_block = """{(function(){var isCompleted=(c.endDate&&new Date(c.endDate)<new Date())||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused");if(isCompleted)return <span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>;if(c.status==="scheduled")return <span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>;return null;})()}"""
    
    c = c[:idx] + new_block + c[end_idx:]
    print("Replaced with simple tag logic")
else:
    print("Could not find old tag logic")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
