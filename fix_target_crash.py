with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the targeting section and ensure all numeric operations are safe
# The crash is likely ctr.toFixed, cpc.toFixed etc on string values

# Fix all .toFixed calls in targeting context to use parseFloat
# Search for patterns like r.ctr.toFixed, r.cpc.toFixed
import re

# Count fixes
fixes = 0

# Fix r.ctr.toFixed
while 'r.ctr.toFixed(' in c:
    c = c.replace('r.ctr.toFixed(', 'parseFloat(r.ctr||0).toFixed(', 1)
    fixes += 1

# Fix r.cpc.toFixed  
while 'r.cpc.toFixed(' in c:
    c = c.replace('r.cpc.toFixed(', 'parseFloat(r.cpc||0).toFixed(', 1)
    fixes += 1

# Fix r.costPer references that might be string
while 'r.costPer>0' in c:
    c = c.replace('r.costPer>0', 'parseFloat(r.costPer||0)>0', 1)
    fixes += 1

# Fix blendedCtr.toFixed
while 'blendedCtr.toFixed(' in c:
    c = c.replace('blendedCtr.toFixed(', 'parseFloat(blendedCtr||0).toFixed(', 1)
    fixes += 1

# Fix blendedCpc references
while 'blendedCpc)' in c and 'parseFloat(blendedCpc' not in c:
    break  # blendedCpc is already calculated as number

# Fix oCtr.toFixed
while 'oCtr.toFixed(' in c:
    c = c.replace('oCtr.toFixed(', 'parseFloat(oCtr||0).toFixed(', 1)
    fixes += 1

# Fix oResults comparison
# These should be fine as they're calculated

# Fix cheapest.costPer
c = c.replace('cheapest.costPer<Infinity', '(cheapest.costPer||Infinity)<Infinity')

# Fix highCtr sort comparison
c = c.replace('return b.ctr-a.ctr;', 'return parseFloat(b.ctr||0)-parseFloat(a.ctr||0);')

# Fix ctr comparison in filter
c = c.replace('r.ctr<0.5', 'parseFloat(r.ctr||0)<0.5')

# Fix ctr>2, ctr>1, ctr>0 comparisons
c = c.replace('r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning', 'parseFloat(r.ctr||0)>2?P.mint:parseFloat(r.ctr||0)>1?P.txt:parseFloat(r.ctr||0)>0?P.warning')

# Fix highCtr[0].ctr comparison
c = c.replace('highCtr[0].ctr>blendedCtr', 'parseFloat(highCtr[0].ctr||0)>blendedCtr')

print("Applied", fixes, "toFixed fixes plus safety guards")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
