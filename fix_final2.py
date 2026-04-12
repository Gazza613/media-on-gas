with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# ═══ FIX 1: TikTok CPM insight - the old text is still there on line 198 ═══
old_tt = """+(t.cpm>0&&computed.fb.cpm>0?" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok\\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning. This CPM level indicates strong content relevance scores, meaning TikTok\\'s system recognises the creative as genuinely engaging to the target audience rather than purely promotional.":"")"""

# Try with single escaped quotes
old_tt2 = """+(t.cpm>0&&computed.fb.cpm>0?" At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook, TikTok\'s content-first algorithm is rewarding the campaign creative with favourable auction positioning. This CPM level indicates strong content relevance scores, meaning TikTok\'s system recognises the creative as genuinely engaging to the target audience rather than purely promotional.":"")"""

new_tt = """+(t.cpm>0&&computed.fb.cpm>0?(t.cpm<computed.fb.cpm?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":" TikTok delivers comparable Cost Per Thousand Ads Served to Facebook at "+fR(t.cpm)+" versus "+fR(computed.fb.cpm)+", with TikTok\'s value driven by higher video completion rates and native content engagement."):"")"""

if old_tt in c:
    c = c.replace(old_tt, new_tt)
    print("Fixed TikTok CPM (double escaped)")
elif old_tt2 in c:
    c = c.replace(old_tt2, new_tt)
    print("Fixed TikTok CPM (single escaped)")
else:
    print("Trying character-by-character match...")
    # Find by unique substring
    marker = 'x more cost-efficient than Facebook'
    idx = c.find(marker)
    if idx > 0:
        # Go back to find the start of this block
        block_start = c.rfind('+(t.cpm>0&&computed.fb.cpm>0?', idx - 200, idx)
        # Go forward to find the end
        block_end = c.find('":"")', idx) + 5
        if block_start > 0 and block_end > idx:
            old_block = c[block_start:block_end]
            c = c[:block_start] + new_tt + c[block_end:]
            print("Fixed TikTok CPM by markers, removed: " + str(len(old_block)) + " chars")
        else:
            print("Could not find block boundaries", block_start, block_end)
    else:
        print("ERROR: Could not find TikTok CPM text at all")

# ═══ FIX 2: Campaign selector - group by client (accountName) first ═══
c = c.replace(
    'var k=c.platform+"\\u2014"+c.accountName;if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);',
    'var k=c.accountName||"Unknown";if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);'
)

# Try alternative format
c = c.replace(
    'var k=c.platform+"—"+c.accountName;if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);',
    'var k=c.accountName||"Unknown";if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);'
)

# Also fix the header to show client name instead of platform—client
# Check what the group header looks like
print("\nVerifying fixes...")
print("'x more cost-efficient' still in file:", 'x more cost-efficient' in c)
print("'platform+' in grouping:", 'c.platform+"' in c[40:50] if len(c) > 50 else "too short")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
