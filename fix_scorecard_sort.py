with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix sort: platform order first, then results descending within each platform
old_sort = 'scored.sort(function(a,b){return b.score-a.score;});'
new_sort = 'scored.sort(function(a,b){var po=(platOrd3[a.row.platform]||9)-(platOrd3[b.row.platform]||9);if(po!==0)return po;return b.row.result-a.row.result;});'
c = c.replace(old_sort, new_sort)
print("Fix 1: Sort by platform then results desc")

# Fix row background to subtly highlight by platform
old_row_bg = "background:s.status===\"weak\"?\"rgba(239,68,68,0.06)\":s.status===\"strong\"?\"rgba(34,197,94,0.04)\":\"transparent\""
new_row_bg = "background:pc4+\"08\""
c = c.replace(old_row_bg, new_row_bg)
print("Fix 2: Subtle platform color background")

# Add platform divider border
old_tr = '<tr key={si} style={{background:pc4+"08"}}>'
new_tr = '<tr key={si} style={{background:pc4+"08",borderTop:si>0&&scored[si-1].row.platform!==r.platform?"3px solid "+pc4+"40":"none"}}>'
c = c.replace(old_tr, new_tr)
print("Fix 3: Platform divider lines")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All fixes applied")
