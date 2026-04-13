with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find and replace the entire TikTok CPM comparison block with a function call
old = '(t.cpm>0&&computed.fb.cpm>0?('

# Find the full block
idx = c.find(old, c.find('TikTok delivers "+ttShare+"%'))
if idx < 0:
    print("Could not find start")
else:
    # Find the closing
    depth = 0
    end = idx
    for i in range(idx, min(idx+2000, len(c))):
        if c[i] == '(':
            depth += 1
        elif c[i] == ')':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    
    old_block = c[idx:end]
    print("Found block:", len(old_block), "chars")
    print("Starts with:", old_block[:60])
    print("Ends with:", old_block[-60:])
    
    # Replace with simple function
    new_block = '(function(){if(t.cpm<=0||computed.fb.cpm<=0)return "";if(t.cpm<computed.fb.cpm*0.9)return " TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.";if(t.cpm>computed.fb.cpm*1.1)return " TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.";return " TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.";})()'
    
    c = c[:idx] + new_block + c[end:]
    print("Replaced with function call")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
