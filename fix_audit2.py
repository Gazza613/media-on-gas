with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix TikTok CPM comparison in awareness insight
old_tt = 'At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook'
if old_tt in c:
    # Find the full sentence and replace
    old_full = '+" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok'
    idx = c.find(old_full)
    if idx > 0:
        # Find end of this sentence
        end_idx = c.find('":"")', idx) + 5
        old_block = c[idx:end_idx]
        new_block = '+(t.cpm<computed.fb.cpm?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":" TikTok delivers comparable Cost Per Thousand Ads Served to Facebook, with additional value driven by higher video completion rates and native content engagement.")'
        c = c[:idx] + new_block + c[end_idx:]
        print("TikTok CPM fix applied")
    else:
        print("Could not find full TikTok block")
else:
    print("TikTok CPM already fixed or different format")

# Fix IG CPM advantage - only show when >5% difference
old_ig = "Instagram\\'s \"+((1-computed.ig.cpm/computed.fb.cpm)*100).toFixed(0)+\"% CPM advantage"
if old_ig in c:
    c = c.replace(
        "computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0",
        "computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0&&((1-computed.ig.cpm/computed.fb.cpm)*100)>5"
    )
    print("IG CPM threshold fix applied")
else:
    print("IG CPM already fixed or different format")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - insight audit fixes")
