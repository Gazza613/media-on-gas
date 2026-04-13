with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the TikTok section and replace with a var approach
old_block = """if(t.impressions>0){parts.push("TikTok delivers "+ttShare+"% of all campaign Total Ads Served ("+fmt(t.impressions)+") at "+fR(t.cpm)+" Cost Per Thousand Ads Served"+(t.reach>0?", reaching "+fmt(t.reach)+" users":"")+"."+(t.cpm<=0||computed.fb.cpm<=0?"":t.cpm<computed.fb.cpm*0.9?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":(t.cpm>computed.fb.cpm*1.1?" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.":" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively."));}"""

new_block = """if(t.impressions>0){var ttCpmNote="";if(t.cpm>0&&computed.fb.cpm>0){if(t.cpm<computed.fb.cpm*0.9){ttCpmNote=" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.";}else if(t.cpm>computed.fb.cpm*1.1){ttCpmNote=" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.";}else{ttCpmNote=" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.";}}parts.push("TikTok delivers "+ttShare+"% of all campaign Total Ads Served ("+fmt(t.impressions)+") at "+fR(t.cpm)+" Cost Per Thousand Ads Served"+(t.reach>0?", reaching "+fmt(t.reach)+" users":"")+"."+ttCpmNote);}"""

if old_block in c:
    c = c.replace(old_block, new_block)
    print("Fixed: converted to var + if/else approach")
else:
    print("Pattern not found, searching...")
    # Try to find just the start
    marker = 'if(t.impressions>0){parts.push("TikTok delivers "+ttShare+"%'
    idx = c.find(marker)
    if idx >= 0:
        # Find the end of this if block
        end_marker = ';}if(computed.gd'
        end_idx = c.find(end_marker, idx)
        if end_idx > 0:
            old = c[idx:end_idx+2]  # include ;}
            print("Found block:", len(old), "chars")
            c = c[:idx] + new_block + c[end_idx+2:]
            print("Replaced by markers")
        else:
            print("Could not find end marker")
    else:
        print("Could not find start marker")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
