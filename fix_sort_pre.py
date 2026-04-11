with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the sort inside the group since it's not working
c = c.replace(
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};g=[].concat(g).sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.clicks-a.clicks;});var totalSpend=g.reduce',
    'var totalSpend=g.reduce'
)

# Add sort to rows right after they're created, before grouping
c = c.replace(
    'var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];',
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};rows.sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.clicks-a.clicks;});var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - sort rows before grouping")
