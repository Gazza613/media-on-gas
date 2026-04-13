with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()
fixes = 0

# FIX 13+14: Dead variables
c = c.replace("var tLikes=0;", "")
c = c.replace("var sLikes=0;", "")
fixes += 1
print("FIX 13+14: Dead variables removed")

# FIX 15: Pie chart filter zero spend
old15 = '[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}]'
new15 = '[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}].filter(function(x){return x.value>0;})'
if old15 in c:
    c = c.replace(old15, new15)
    fixes += 1
    print("FIX 15: Pie chart filters zero spend")

# FIX 16: Google bar null -> 0
old16 = '{name:"Google",Impressions:computed.gd.impressions,Reach:null}'
new16 = '{name:"Google",Impressions:computed.gd.impressions,Reach:0}'
if old16 in c:
    c = c.replace(old16, new16)
    fixes += 1
    print("FIX 16: Google Reach null -> 0")

# FIX 17: IG CPC guard zero
old17 = 'computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0'
new17 = 'computed.ig.cpc>0&&computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0'
if old17 in c:
    c = c.replace(old17, new17, 1)
    fixes += 1
    print("FIX 17: IG CPC zero guard")

# FIX 18: Combined read includes Google
old18 = 'across Meta and TikTok against a combined investment'
new18 = 'across Meta, TikTok, and Google Display against a combined investment'
if old18 in c:
    c = c.replace(old18, new18)
    fixes += 1
    print("FIX 18: Combined read includes Google")

# FIX 18b: dual -> multi platform
old18b = 'The dual-platform architecture is delivering'
new18b = 'The multi-platform architecture is delivering'
if old18b in c:
    c = c.replace(old18b, new18b)
    fixes += 1
    print("FIX 18b: dual -> multi platform")

# FIX 19: Community insight includes TikTok
old19 = 'across Facebook and Instagram.'
new19 = 'across Facebook, Instagram, and TikTok.'
if old19 in c:
    c = c.replace(old19, new19)
    fixes += 1
    print("FIX 19: Community includes TikTok")

# FIX 7: TikTok CPM - handle when more expensive
old7a = 'TikTok delivers comparable Cost Per Thousand Ads Served to Facebook at "+fR(t.cpm)+" versus "+fR(computed.fb.cpm)+", with TikTok'
if old7a in c:
    idx = c.find(old7a)
    # Find the full ternary block
    block_start = c.rfind('t.cpm<computed.fb.cpm?', idx - 300, idx)
    block_end = c.find('":"")', idx) + 5
    if block_start > 0 and block_end > idx:
        old_block = c[block_start:block_end]
        new_block = 't.cpm<computed.fb.cpm*0.9?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":t.cpm>computed.fb.cpm*1.1?" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.":" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.":"")'
        c = c[:block_start] + new_block + c[block_end:]
        fixes += 1
        print("FIX 7: TikTok CPM handles all scenarios")
    else:
        print("FIX 7: Could not find block boundaries")
else:
    print("FIX 7: Text not found, may already be fixed")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Script 2 done, fixes:", fixes)
