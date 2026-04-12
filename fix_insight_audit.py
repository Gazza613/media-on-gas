with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix the TikTok efficiency comparison - only say more efficient when it actually is
c = c.replace(
    '+(t.cpm>0&&computed.fb.cpm>0?" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok\\\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning. This CPM level indicates strong content relevance scores, meaning TikTok\\\'s system recognises the creative as genuinely engaging to the target audience rather than purely promotional.":"")',
    '+(t.cpm>0&&computed.fb.cpm>0?(t.cpm<computed.fb.cpm?" TikTok\\'s Cost Per Thousand Ads Served of "+fR(t.cpm)+" is "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% more cost-efficient than Facebook\\'s "+fR(computed.fb.cpm)+", confirming TikTok\\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning.":" TikTok\\'s Cost Per Thousand Ads Served of "+fR(t.cpm)+" runs at a similar level to Facebook\\'s "+fR(computed.fb.cpm)+", with TikTok\\'s value driven by higher video completion rates and native content engagement rather than pure Cost Per Thousand Ads Served efficiency."):"")'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - fixed TikTok efficiency comparison")
