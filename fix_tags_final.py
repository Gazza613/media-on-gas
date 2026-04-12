with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find current status display and replace with smart tag logic
# The tag should work based on:
# 1. endDate exists and is before today -> COMPLETED
# 2. status is "paused" -> PAUSED
# 3. No endDate but status is paused -> COMPLETED (TikTok paused = finished)
# 4. status is "scheduled" -> SCHEDULED

old_status = '{c.status&&c.status!=="active"&&<span style={{color:c.status==="scheduled"?P.solar:c.status==="pending"?P.cyan:c.status==="completed"?P.sub:P.warning,fontWeight:700,textTransform:"uppercase",marginLeft:4}}>{c.status}</span>}'

new_status = """{(function(){var now=new Date();var tag="";var tagColor=P.dim;var hasEnded=c.endDate&&new Date(c.endDate)<now;var isPaused=c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused";if(hasEnded||isPaused){tag="COMPLETED";tagColor="#888";}else if(c.status==="scheduled"){tag="SCHEDULED";tagColor=P.solar;}if(!tag)return null;return React.createElement("span",{style:{background:tagColor+"20",color:tagColor,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}},tag);})()}"""

if old_status in c:
    c = c.replace(old_status, new_status)
    print("Replaced old status tag")
else:
    print("Old status not found, trying alternative...")
    # Try the alternative format we may have set before
    alt = 'function(){var tag="";var tagColor=P.dim;if(c.endDate'
    if alt in c:
        # Already has the new format, just needs fixing
        start = c.find('{(function(){var tag="";var tagColor=P.dim;if(c.endDate')
        end = c.find('})()}', start) + 5
        old_block = c[start:end]
        c = c[:start] + new_status + c[end:]
        print("Replaced alternative status tag")
    else:
        print("No status tag found at all")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
