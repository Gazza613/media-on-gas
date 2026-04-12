with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the tag logic with one that also checks campaign name for past months
old_tag = """{(c.endDate&&new Date(c.endDate)<new Date())||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused")?<span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>:c.status==="scheduled"?<span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>:null}"""

new_tag = """{(function(){var n=(c.campaignName||"").toLowerCase();var now=new Date();var curMonth=now.getMonth();var curYear=now.getFullYear();var pastMonths=["jan","feb","mar","march","apr","april","may","jun","june","jul","july","aug","august","sep","sept","october","oct","nov","november","dec","december"];var monthNums={jan:0,feb:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};var nameMonth=-1;for(var mi=0;mi<pastMonths.length;mi++){if(n.indexOf(pastMonths[mi]+"26")>=0||n.indexOf(pastMonths[mi]+" 26")>=0||n.indexOf(pastMonths[mi]+"_26")>=0||n.indexOf(pastMonths[mi]+" 2026")>=0){nameMonth=monthNums[pastMonths[mi]];break;}}var isCompleted=(c.endDate&&new Date(c.endDate)<now)||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused")||(nameMonth>=0&&nameMonth<curMonth);if(isCompleted)return <span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>;if(c.status==="scheduled")return <span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>;return null;})()}"""

c = c.replace(old_tag, new_tag)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - smart month detection for completed tags")
