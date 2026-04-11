with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix: match "_like_" or "_like " for like campaigns, check BEFORE leads (since "like" appears in many words)
# Reorder the objective detection - check specific patterns first
c = c.replace(
    """var getObj=function(name){
                var n=(name||"").toLowerCase();
                if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
                if(n.indexOf("follower")>=0)return "Follows";
                if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0)return "Page Likes";
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";
                if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0)return "Landing Page Clicks";
                return "Traffic";
              };""",
    """var getObj=function(name){
                var n=(name||"").toLowerCase();
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";
                if(n.indexOf("follower")>=0)return "Followers & Likes";
                if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidSocial_like")>=0||n.indexOf("paidsocial_like")>=0)return "Followers & Likes";
                if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
                if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0)return "Landing Page Clicks";
                return "Traffic";
              };""")

# Fix getResult to handle combined Followers & Likes
c = c.replace(
    """var getResult=function(camp,obj){
                if(obj==="Leads")return parseFloat(camp.leads||0);
                if(obj==="Follows")return parseFloat(camp.follows||0);
                if(obj==="Page Likes")return parseFloat(camp.pageLikes||0);
                return parseFloat(camp.clicks||0);
              };""",
    """var getResult=function(camp,obj){
                if(obj==="Leads")return parseFloat(camp.leads||0);
                if(obj==="Followers & Likes")return parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);
                return parseFloat(camp.clicks||0);
              };""")

# Fix labels
c = c.replace(
    """var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Follows")return "Follows";if(obj==="Page Likes")return "Likes";return "Clicks";};""",
    """var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Followers & Likes")return "Follows/Likes";return "Clicks";};""")

c = c.replace(
    """var getCostLabel=function(obj){if(obj==="Leads")return "CPL";if(obj==="Follows")return "CPF";if(obj==="Page Likes")return "CPL";return "CPC";};""",
    """var getCostLabel=function(obj){if(obj==="Leads")return "CPL";if(obj==="Followers & Likes")return "CPF";return "CPC";};""")

# Fix objectives array - combine Follows and Page Likes into one
c = c.replace(
    'var objectives=["App Store Clicks","Landing Page Clicks","Leads","Follows","Page Likes"];',
    'var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];'
)

# Fix objColors
c = c.replace(
    'var objColors={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Follows":P.tt,"Page Likes":P.fb};',
    'var objColors={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};'
)

# Fix objOrder for sorting
c = c.replace(
    'var objOrder={"App Store Clicks":0,"Landing Page Clicks":1,"Leads":2,"Follows":3,"Page Likes":4,"Traffic":5};',
    'var objOrder={"App Store Clicks":0,"Landing Page Clicks":1,"Leads":2,"Followers & Likes":3,"Traffic":4};'
)

# Fix summary blocks - combine Follows and Likes into one
c = c.replace(
    """var tFollows=rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.result;},0);
              var tLikes=rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.result;},0);""",
    """var tFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.result;},0);
              var tLikes=0;""")

c = c.replace(
    """var sFollows=rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.spend;},0);
              var sLikes=rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.spend;},0);""",
    """var sFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.spend;},0);
              var sLikes=0;""")

# Update summary glass blocks - remove separate LIKES block, rename FOLLOWS
c = c.replace('>FOLLOWS<', '>FOLLOWERS & LIKES<')

# Remove the separate PAGE LIKES glass block
old_likes_glass = """<Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>LIKES</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(tLikes)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPL: {fR(tLikes>0?sLikes/tLikes:0)}</div></Glass>"""
c = c.replace(old_likes_glass, '')

# Fix grid to 4 columns since we removed one
c = c.replace(
    "gridTemplateColumns:\"repeat(5,1fr)\",gap:12,marginBottom:16}}>",
    "gridTemplateColumns:\"repeat(4,1fr)\",gap:12,marginBottom:16}}>"
)

# Fix insight references
c = c.replace(
    'if(tFollows>0)p.push("Follower campaigns acquired "+fmt(tFollows)+" new followers at "+fR(sFollows/tFollows)+" CPF.");if(tLikes>0)p.push("Page engagement campaigns earned "+fmt(tLikes)+" new page likes at "+fR(sLikes/tLikes)+" per like, strengthening organic reach capacity and social proof signals that enhance paid ad performance.");',
    'if(tFollows>0)p.push("Follower and like campaigns acquired "+fmt(tFollows)+" new community members at "+fR(sFollows/tFollows)+" cost per acquisition. Each new follower or page like represents a compounding organic asset that increases future content reach, strengthens social proof, and reduces long-term paid media dependency.");'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Followers & Likes combined, Like matcher fixed")
