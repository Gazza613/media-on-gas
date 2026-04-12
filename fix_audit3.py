with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Remove redundant local totalClicks in engagement insight
c = c.replace(
    'var totalClicks=m.clicks+t.clicks+computed.gd.clicks;var blendedCpc=computed.totalClicks>0',
    'var blendedCpc=computed.totalClicks>0'
)

# Fix 2: Remove "Instagram purchase intent" claim
c = c.replace(
    """ Instagram clicks typically carry higher purchase intent signals due to the platform's commerce-oriented user behaviour.""",
    ""
)

# Fix 3: FB click share use computed.totalClicks
c = c.replace(
    'var fbClickShare=totalClicks>0?((computed.fb.clicks/totalClicks)*100).toFixed(1):"0"',
    'var fbClickShare=computed.totalClicks>0?((computed.fb.clicks/computed.totalClicks)*100).toFixed(1):"0"'
)

# Fix 4: getObj - use "paidsearch" specifically instead of "google" to avoid false matches
c = c.replace(
    'if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0||n.indexOf("google")>=0)return "Landing Page Clicks";',
    'if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";'
)

# Fix 5: IG engagements - include pageFollows for follower campaigns
c = c.replace(
    'var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0);',
    'var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0)+(camp.pageFollows?parseFloat(camp.pageFollows):0);'
)

# Also fix engCtr to use updated engagements
c = c.replace(
    'var engCtr=imps>0?((parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0))/imps*100):0;',
    ''
)

# Fix 6: Remove the old rows.sort that conflicts with platList sort
c = c.replace(
    'rows.sort(function(a,b){var p=platOrder[a.platform]||9;var q=platOrder[b.platform]||9;if(p!==q)return p-q;return b.result-a.result;});',
    ''
)

# Fix: totalClicks===0 check should use computed.totalClicks
c = c.replace(
    'if(totalClicks===0)',
    'if(computed.totalClicks===0)'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - engagement and objective audit fixes")
