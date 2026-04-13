with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix: parse ctr as float in the targeting tab rows
old = 'var ctr=imps>0?(clicks/imps*100):0;'
# This exists in both overview and targeting - we need to be specific
# The targeting version calculates from clicks/imps so it should be fine
# The issue is in the engagement table where we use r.ctr directly from API data

# Fix all r.ctr.toFixed references to parseFloat first
c = c.replace('color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}',
              'color:parseFloat(r.ctr)>2?P.mint:parseFloat(r.ctr)>1?P.txt:parseFloat(r.ctr)>0?P.warning:P.dim}}>{parseFloat(r.ctr).toFixed(2)+"%"}')

# Also fix the chart data CTR
c = c.replace(
    'return{name:short,Clicks:r.clicks,CPC:r.cpc,CTR:r.ctr,Spend:r.spend};',
    'return{name:short,Clicks:r.clicks,CPC:r.cpc,CTR:parseFloat(r.ctr)||0,Spend:r.spend};'
)

# Also fix blendedCtr.toFixed in insight
c = c.replace(
    'r.ctr.toFixed(2)+"%";}).join(", ")+".',
    'parseFloat(r.ctr).toFixed(2)+"%";}).join(", ")+".'
)

# Fix the low perf filter
c = c.replace(
    'r.spend>300&&r.ctr<0.5&&r.impressions>5000',
    'r.spend>300&&parseFloat(r.ctr)<0.5&&r.impressions>5000'
)

print("Fixed all ctr parseFloat issues")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
