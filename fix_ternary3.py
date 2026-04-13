with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old = '(function(){if(t.cpm<=0||computed.fb.cpm<=0)return "";if(t.cpm<computed.fb.cpm*0.9)return " TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.";if(t.cpm>computed.fb.cpm*1.1)return " TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.";return " TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.";})()'

new = '(t.cpm<=0||computed.fb.cpm<=0?"":t.cpm<computed.fb.cpm*0.9?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":(t.cpm>computed.fb.cpm*1.1?" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.":" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively."))'

if old in c:
    c = c.replace(old, new)
    print("Fixed: converted IIFE back to parenthesised ternary")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
