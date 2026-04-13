with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Step 1: Change subtitle
c = c.replace(
    'Adset-Level Analysis by Platform',
    'Adset-Level Analysis by Objective'
)

# Step 2: Replace the platform-based rendering with objective-based
# Find and replace the platSections block
old_plat = """            var platSections=platforms.map(function(plat){
              var pRows=allRows.filter(function(r){return r.platform===plat;});
              return renderTable(pRows,platColors[plat],plat);
            }).filter(function(x){return x!==null;});"""

new_obj = """            var objList=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objColors3={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var platOrd3={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};
            var platSections=objList.map(function(objName){
              var objRows=allRows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){objRows=objRows.concat(allRows.filter(function(r){return r.objective==="Traffic";}));}
              if(objRows.length===0)return null;
              var sorted5=objRows.slice().sort(function(a,b){var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.spend-a.spend;});
              return renderTable(sorted5,objColors3[objName],objName);
            }).filter(function(x){return x!==null;});"""

if old_plat in c:
    c = c.replace(old_plat, new_obj)
    print("Step 2: Switched to objective-based sections")

# Step 3: Update renderTable header label to show "by Adset" 
c = c.replace(
    '<span style={{fontSize:16,fontWeight:800,color:pc2,fontFamily:ff}}>{label}</span>',
    '<span style={{fontSize:16,fontWeight:800,color:pc2,fontFamily:ff}}>{label+" by Adset"}</span>'
)

# Step 4: Add platform badge column and sort by platform within table
# Replace the table header to include Platform column
old_headers = '["Adset (Targeting)","Objective","Spend","Impressions","Clicks","Results","Cost Per","CTR %","CPC"]'
new_headers = '["Adset (Targeting)","Platform","Spend","Impressions","Clicks","Results","Cost Per","CTR %","CPC"]'
c = c.replace(old_headers, new_headers)

# Step 5: Replace Objective cell with Platform badge cell
old_obj_cell = """<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>"""
new_plat_cell = """<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":"TT"}</span></td>"""
c = c.replace(old_obj_cell, new_plat_cell)

# Step 6: Remove recommendations from insights, keep assessment only
old_insight_end = """var zeroResult=sorted2.filter(function(r){return r.spend>200&&r.result===0;});if(zeroResult.length>0){p.push("Strategy: "+zeroResult.length+" adset"+(zeroResult.length>1?"s":"")+" have spent budget without producing results. Evaluate targeting parameters and creative relevance for these segments.");}return p.join(" ");"""
new_insight_end = """return p.join(" ");"""
c = c.replace(old_insight_end, new_insight_end)

# Step 7: Remove "Consider increasing budget" recommendation from insight
c = c.replace(
    ' Consider increasing budget allocation to this targeting.',
    '.'
)

# Step 8: Move adsetFlags to not show on targeting tab (keep for optimisation)
# Remove the alerts section from targeting display
old_alerts = 'adsetFlags.length>0&&<div style={{background:P.glass'
if old_alerts in c:
    # Find the full alerts block
    alert_start = c.find('{adsetFlags.length>0&&<div style={{background:P.glass')
    if alert_start > 0:
        # Find its closing
        depth = 0
        i = alert_start
        alert_end = -1
        found_first = False
        while i < len(c) and i < alert_start + 5000:
            if c[i:i+1] == '{' and not found_first:
                found_first = True
            if found_first:
                if c[i:i+1] == '{':
                    depth += 1
                if c[i:i+1] == '}':
                    depth -= 1
                    if depth == 0:
                        alert_end = i + 1
                        break
            i += 1
        if alert_end > 0:
            c = c[:alert_start] + c[alert_end:]
            print("Step 8: Removed alerts from targeting tab")

# Step 9: Update Combined View title
c = c.replace(
    'COMBINED CROSS-PLATFORM VIEW',
    'COMBINED ADSET PERFORMANCE'
)
c = c.replace(
    'ALL ADSETS RANKED BY INVESTMENT',
    'ALL ADSETS BY OBJECTIVE & PLATFORM'
)

# Step 10: Add platform border divider in tables
c = c.replace(
    'return <tr key={ri} style={{background:isWorst?"rgba(244,63,94,0.08)":ri%2===0?pc2+"06":"transparent"}}>',
    'return <tr key={ri} style={{background:isWorst?"rgba(244,63,94,0.08)":ri%2===0?pc2+"06":"transparent",borderTop:ri>0&&sorted2[ri-1]&&r.platform!==sorted2[ri-1].platform?"3px solid "+pc2+"30":"none"}}>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All surgical edits done")
