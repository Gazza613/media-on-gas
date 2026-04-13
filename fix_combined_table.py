with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Combined table - fix Platform column to use platBdg3 and fix Objective column
# The issue: two cells both show platform badges. Second should show objective text.
old_two_cols = """<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc3,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBadge[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":"TT"}</span></td>"""

new_two_cols = """<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":"TT"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>"""

c = c.replace(old_two_cols, new_two_cols)
print("Fix 1: Platform + Objective columns fixed")

# Fix 2: Combined table - fix pc3 to use platCol3 instead of old platColors
c = c.replace(
    'var pc3=platColors[r.platform]||P.ember;',
    'var pc3=platCol3[r.platform]||P.ember;'
)
print("Fix 2: platColors -> platCol3")

# Fix 3: Sort combined table by objective then platform then spend
old_combined_sort = 'allRows.slice().sort(function(a,b){return b.spend-a.spend;}).map'
new_combined_sort = 'allRows.slice().sort(function(a,b){var objOrd={"App Store Clicks":0,"Landing Page Clicks":1,"Leads":2,"Followers & Likes":3,"Traffic":1};var oo=(objOrd[a.objective]||9)-(objOrd[b.objective]||9);if(oo!==0)return oo;var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.spend-a.spend;}).map'
c = c.replace(old_combined_sort, new_combined_sort)
print("Fix 3: Combined table sorted by objective > platform > spend")

# Fix 4: Fix platforms reference in insight to use platList3
c = c.replace(
    'platforms.filter(function(pl){return allRows.filter(function(r){return r.platform===pl;}).length>0;}).length',
    'platList3.filter(function(pl){return allRows.filter(function(r){return r.platform===pl;}).length>0;}).length'
)
c = c.replace(
    'platforms.forEach(function(pl){var pr=allRows',
    'platList3.forEach(function(pl){var pr=allRows'
)
print("Fix 4: platforms -> platList3 in insight")

# Fix 5: Fix adsetFlags reference (was removed but still referenced in insight)
if 'adsetFlags.length>0' in c and 'var adsetFlags=[]' not in c:
    # adsetFlags was removed, remove the reference in insight
    old_flags_ref = 'if(adsetFlags.length>0){p.push("Strategy: "+adsetFlags.filter(function(f){return f.severity==="critical";}).length+" critical and "+adsetFlags.filter(function(f){return f.severity==="warning";}).length+" warning flags have been identified. Review the Optimisation tab for detailed recommendations on underperforming adsets.");}'
    c = c.replace(old_flags_ref, '')
    print("Fix 5: Removed adsetFlags reference from insight")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All combined table fixes applied")
