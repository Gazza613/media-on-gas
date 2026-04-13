with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Sort FB→IG→TT→GD then by results descending (not results first)
c = c.replace(
    'var sorted6=objRows.slice().sort(function(a,b){var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.result-a.result||b.spend-a.spend;});',
    'var sorted6=objRows.slice().sort(function(a,b){var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.result-a.result;});'
)
print("Fix 1: Sort order confirmed FB>IG>TT>GD then results desc")

# Fix 2: Charts sorted descending (best on top) with longer labels
c = c.replace(
    "var chartD=sorted6.map(function(r){return{name:r.adsetName.length>30?r.adsetName.substring(0,27)+\"...\":r.adsetName,fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});",
    "var chartD=sorted6.slice().sort(function(a,b){return b.result-a.result;}).map(function(r){var platTag=r.platform===\"Facebook\"?\"FB\":r.platform===\"Instagram\"?\"IG\":r.platform===\"TikTok\"?\"TT\":\"GD\";return{name:platTag+\" | \"+r.adsetName.substring(0,35),fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});"
)
print("Fix 2: Chart labels wider with platform prefix")

# Fix 3: Wider Y-axis and bigger font on charts
c = c.replace(
    'width={160} tick={{fontSize:9,fill:"rgba(255,255,255,0.75)"',
    'width={220} tick={{fontSize:10,fill:"rgba(255,255,255,0.85)"'
)
print("Fix 3: Y-axis wider and brighter")

# Fix 4: Chart height taller per bar
c = c.replace(
    'Math.max(120,chartD.length*36)',
    'Math.max(140,chartD.length*40)'
)
c = c.replace(
    'Math.max(120,chartD.filter',
    'Math.max(140,chartD.filter'
)
print("Fix 4: Taller chart bars")

# Fix 5: Cost per result chart also sorted ascending (cheapest on top)
# Already sorted by a.CostPer-b.CostPer which is ascending - good

# Fix 6: Add BEST tag per platform group in table
c = c.replace(
    'var isBest=r.adsetName===bestAd.adsetName&&r.result>0;',
    'var isBest=false;var platGroup=sorted6.filter(function(x){return x.platform===r.platform;});if(platGroup.length>0&&platGroup[0].adsetName===r.adsetName&&r.result>0)isBest=true;'
)
print("Fix 6: BEST tag per platform group")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All fixes applied")
