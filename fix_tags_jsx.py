with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_tag = """{(function(){var now=new Date();var tag="";var tagColor=P.dim;var hasEnded=c.endDate&&new Date(c.endDate)<now;var isPaused=c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused";if(hasEnded||isPaused){tag="COMPLETED";tagColor="#888";}else if(c.status==="scheduled"){tag="SCHEDULED";tagColor=P.solar;}if(!tag)return null;return React.createElement("span",{style:{background:tagColor+"20",color:tagColor,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}},tag);})()} · {fR(parseFloat(c.spend))}"""

new_tag = """{(c.endDate&&new Date(c.endDate)<new Date())||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused")?<span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>:c.status==="scheduled"?<span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>:null} · {fR(parseFloat(c.spend))}"""

c = c.replace(old_tag, new_tag)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - JSX tags instead of React.createElement")
