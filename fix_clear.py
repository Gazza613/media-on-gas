with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix: return safe defaults when nothing selected - add fb/ig fields
old_empty = 'if(selected.length===0)return{metaCamps:[],ttCamps:[],meta:{impressions:0,reach:0,spend:0,clicks:0,cpm:0,cpc:0,ctr:0,frequency:0},tt:{impressions:0,spend:0,clicks:0,follows:0,likes:0,cpm:0},totalImps:0,totalSpend:0,totalClicks:0,blendedCpm:0,allSelected:[]};'

new_empty = 'if(selected.length===0){var z={impressions:0,reach:0,spend:0,clicks:0,cpm:0,cpc:0,ctr:0,frequency:0,leads:0,appInstalls:0,landingPageViews:0,pageLikes:0,follows:0,likes:0,costPerLead:0,costPerInstall:0};return{fbCamps:[],igCamps:[],metaCamps:[],ttCamps:[],fb:Object.assign({},z),ig:Object.assign({},z),meta:Object.assign({},z),tt:Object.assign({},z),grand:Object.assign({},z),totalImps:0,totalSpend:0,totalClicks:0,blendedCpm:0,allSelected:[]};}'

c = c.replace(old_empty, new_empty)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - clear fix applied")
print("fbCamps in empty:", "fbCamps:[]" in c)
