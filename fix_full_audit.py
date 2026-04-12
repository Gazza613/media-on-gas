with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# BUG 1: Remove duplicate pages state
c = c.replace(
    "var ps=useState([]),pages=ps[0],setPages=ps[1];\n  var ps=useState([]),pages=ps[0],setPages=ps[1];",
    "var ps=useState([]),pages=ps[0],setPages=ps[1];"
)

# BUG 2: Remove duplicate setPages call
c = c.replace(
    "if(d.pages){setPages(d.pages);}if(d.pages){setPages(d.pages);}",
    "if(d.pages){setPages(d.pages);}"
)

# BUG 3: Fix "total Total Ads Served volume" doubled word
c = c.replace("total Total Ads Served volume", "Total Ads Served volume")

# BUG 4: Fix TikTok frequency showing "0" instead of dash when no data
c = c.replace(
    """{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}""",
    """{t.frequency>0?t.frequency.toFixed(2)+"x":"\\u2014"}"""
)

# BUG 5: Fix Grand Total frequency to exclude Google (0 reach skews it)
c = c.replace(
    """{computed.grand.frequency>0?computed.grand.frequency.toFixed(2)+"x":"\\u2014"}""",
    """{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\\u2014"}"""
)

# BUG 6: Fix awareness insight TikTok - old efficiency formula still there
c = c.replace(
    """+(t.cpm>0&&computed.fb.cpm>0?" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok\\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning. This CPM level indicates strong content relevance scores, meaning TikTok\\'s system recognises the creative as genuinely engaging to the target audience rather than purely promotional.":"")""",
    """+(t.cpm>0&&computed.fb.cpm>0?(t.cpm<computed.fb.cpm?" TikTok\\'s Cost Per Thousand Ads Served of "+fR(t.cpm)+" is "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% more cost-efficient than Facebook\\'s "+fR(computed.fb.cpm)+", confirming strong content relevance scores and favourable auction positioning.":" TikTok\\'s Cost Per Thousand Ads Served of "+fR
cat > /workspaces/media-on-gas/fix_full_audit.py << 'DONE'
with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# BUG 1: Remove duplicate pages state
c = c.replace(
    "var ps=useState([]),pages=ps[0],setPages=ps[1];\n  var ps=useState([]),pages=ps[0],setPages=ps[1];",
    "var ps=useState([]),pages=ps[0],setPages=ps[1];"
)

# BUG 2: Remove duplicate setPages call
c = c.replace(
    "if(d.pages){setPages(d.pages);}if(d.pages){setPages(d.pages);}",
    "if(d.pages){setPages(d.pages);}"
)

# BUG 3: Fix "total Total Ads Served volume" doubled word
c = c.replace("total Total Ads Served volume", "Total Ads Served volume")

# BUG 4: Fix TikTok frequency showing "0" instead of dash when no data
c = c.replace(
    """{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}""",
    """{t.frequency>0?t.frequency.toFixed(2)+"x":"\\u2014"}"""
)

# BUG 5: Fix Grand Total frequency to exclude Google (0 reach skews it)
c = c.replace(
    """{computed.grand.frequency>0?computed.grand.frequency.toFixed(2)+"x":"\\u2014"}""",
    """{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\\u2014"}"""
)

# BUG 6: Fix awareness insight TikTok - old efficiency formula still there
c = c.replace(
    """+(t.cpm>0&&computed.fb.cpm>0?" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok\\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning. This CPM level indicates strong content relevance scores, meaning TikTok\\'s system recognises the creative as genuinely engaging to the target audience rather than purely promotional.":"")""",
    """+(t.cpm>0&&computed.fb.cpm>0?(t.cpm<computed.fb.cpm?" TikTok\\'s Cost Per Thousand Ads Served of "+fR(t.cpm)+" is "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% more cost-efficient than Facebook\\'s "+fR(computed.fb.cpm)+", confirming strong content relevance scores and favourable auction positioning.":" TikTok\\'s Cost Per Thousand Ads Served of "+fR(t.cpm)+" runs at a similar level to Facebook\\'s "+fR(computed.fb.cpm)+", with TikTok\\'s value driven by higher video completion rates and native content engagement.":"")"""
)

# BUG 7: Fix Instagram CPM "advantage" claim when difference is small
c = c.replace(
    """+(computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0?" Instagram\\'s "+((1-computed.ig.cpm/computed.fb.cpm)*100).toFixed(0)+"% CPM advantage over Facebook makes it the more capital-efficient Meta placement for awareness delivery, driven by higher engagement rates in Stories and Reels placements that reduce effective cost per quality impression.":"")""",
    """+(computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0&&((1-computed.ig.cpm/computed.fb.cpm)*100)>5?" Instagram\\'s "+((1-computed.ig.cpm/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook makes it the more capital-efficient Meta placement for awareness delivery.":"")"""
)

# BUG 8: Grand Total reach display - exclude Google's 0
c = c.replace(
    "{fmt(computed.grand.reach)}",
    "{fmt(m.reach+t.reach)}"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - full audit fixes applied")
print("Duplicate ps:", c.count("var ps=useState"))
print("Duplicate setPages:", c.count("if(d.pages){setPages(d.pages);}if(d.pages)"))
print("total Total:", c.count("total Total"))
