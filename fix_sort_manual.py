with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the grouping logic entirely
old_group = """var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
              var groups={};objectives.forEach(function(o){groups[o]=rows.filter(function(r){return r.objective===o;});});
              var trafficRows=rows.filter(function(r){return r.objective==="Traffic";});
              if(trafficRows.length>0){groups["Landing Page Clicks"]=groups["Landing Page Clicks"].concat(trafficRows);}"""

new_group = """var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
              var platList=["Facebook","Instagram","TikTok","Google Display","YouTube"];
              var groups={};objectives.forEach(function(o){
                var matched=rows.filter(function(r){return r.objective===o;});
                if(o==="Landing Page Clicks"){var tr=rows.filter(function(r){return r.objective==="Traffic";});matched=matched.concat(tr);}
                var sorted=[];
                platList.forEach(function(pl){var plRows=matched.filter(function(r){return r.platform===pl;});plRows.sort(function(a,b){return b.clicks-a.clicks;});sorted=sorted.concat(plRows);});
                groups[o]=sorted;
              });"""

c = c.replace(old_group, new_group)

# Remove any leftover sort that might conflict
c = c.replace(
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};rows.sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.clicks-a.clicks;});',
    ''
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - manual platform ordering")
print("platList found:", "platList" in c)
