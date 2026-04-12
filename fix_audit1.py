with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Remove duplicate pages state
c = c.replace(
    "var ps=useState([]),pages=ps[0],setPages=ps[1];\n  var ps=useState([]),pages=ps[0],setPages=ps[1];",
    "var ps=useState([]),pages=ps[0],setPages=ps[1];"
)

# Fix 2: Remove duplicate setPages
c = c.replace(
    "if(d.pages){setPages(d.pages);}if(d.pages){setPages(d.pages);}",
    "if(d.pages){setPages(d.pages);}"
)

# Fix 3: Fix doubled word
c = c.replace("total Total Ads Served volume", "Total Ads Served volume")

# Fix 4: TikTok frequency dash
c = c.replace(
    '{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}',
    '{t.frequency>0?t.frequency.toFixed(2)+"x":"\u2014"}'
)

# Fix 5: Grand Total reach exclude Google
c = c.replace("{fmt(computed.grand.reach)}", "{fmt(m.reach+t.reach)}")

# Fix 6: Grand Total frequency exclude Google
c = c.replace(
    '{computed.grand.frequency>0?computed.grand.frequency.toFixed(2)+"x":"\u2014"}',
    '{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\u2014"}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)

print("Duplicate ps:", c.count("var ps=useState"))
print("Duplicate setPages:", c.count("setPages(d.pages);}if(d.pages)"))
print("total Total:", c.count("total Total"))
print("Done - basic audit fixes")
