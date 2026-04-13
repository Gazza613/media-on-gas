with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: BEST tag - use adsetId comparison, only first per platform
old_best = 'var isBest=false;var platGroup=sorted6.filter(function(x){return x.platform===r.platform;});if(platGroup.length>0&&platGroup[0].adsetName===r.adsetName&&r.result>0)isBest=true;'
new_best = 'var isBest=false;if(r.result>0){var firstInPlat=true;for(var bi=0;bi<ri;bi++){if(sorted6[bi].platform===r.platform){firstInPlat=false;break;}}isBest=firstInPlat;}'
c = c.replace(old_best, new_best)
print("Fix 1: BEST only on first (top) per platform")

# Fix 2: Chart labels - show full name, no truncation
old_chart = 'var chartD=sorted6.slice().sort(function(a,b){return b.result-a.result;}).map(function(r){var platTag=r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="TikTok"?"TT":"GD";return{name:platTag+" | "+r.adsetName.substring(0,35),fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});'
new_chart = 'var chartD=sorted6.slice().sort(function(a,b){return b.result-a.result;}).map(function(r){var platTag=r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="TikTok"?"TT":"GD";return{name:platTag+" | "+r.adsetName,fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});'
c = c.replace(old_chart, new_chart)
print("Fix 2: Full adset names in chart data")

# Fix 3: Custom Y-axis tick that wraps text
old_yaxis1 = '<YAxis type="category" dataKey="name" width={220} tick={{fontSize:10,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><Tooltip content={adsetTip}'
new_yaxis1 = '<YAxis type="category" dataKey="name" width={220} tick={function(props){var lines=[];var txt=props.payload.value||"";var maxW=28;for(var si=0;si<txt.length;si+=maxW){lines.push(txt.substring(si,si+maxW));}return <g transform={"translate("+props.x+","+props.y+")"}>{lines.map(function(ln,li){return <text key={li} x={-4} y={li*13-((lines.length-1)*6)} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={9} fontFamily="\'JetBrains Mono\',monospace">{ln}</text>;})}</g>;}} stroke="transparent"/><Tooltip content={adsetTip}'
c = c.replace(old_yaxis1, new_yaxis1, 2)
print("Fix 3: Wrapped Y-axis labels on charts")

# Fix 4: Increase bar height for wrapped labels
c = c.replace(
    'Math.max(140,chartD.length*40)',
    'Math.max(160,chartD.length*52)'
)
c = c.replace(
    'Math.max(140,chartD.filter',
    'Math.max(160,chartD.filter'
)
# Fix the filter version too
c = c.replace(
    '.length*36)',
    '.length*52)'
)
print("Fix 4: Taller bars for wrapped labels")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All fixes applied")
