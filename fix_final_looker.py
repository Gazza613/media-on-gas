with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add the LOOKER mapping and smart function after API variable
c = c.replace(
    'var API=window.location.origin;',
    """var API=window.location.origin;
var LOOKER_URLS={"mtn momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","mtn momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","willowbrook":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","psycho":"https://lookerstudio.google.com/reporting/0adc106a-50e2-42cc-a4ca-aafc04160e5d/page/p_1ooj1p0nmd","khava":"","concord":"","eden":"","flower":""};
var LOOKER_KEYS=["mtn momo pos","momo pos","willowbrook","psycho","khava","concord","eden","flower","momo","mtn momo"];
function findLookerUrl(camps,sel){var s=camps.filter(function(x){return sel.indexOf(x.campaignId)>=0;});if(s.length===0)return{url:"",client:"none"};var names=s.map(function(x){return(x.campaignName||"").toLowerCase();}).join(" ");for(var i=0;i<LOOKER_KEYS.length;i++){if(names.indexOf(LOOKER_KEYS[i])>=0){var u=LOOKER_URLS[LOOKER_KEYS[i]];return{url:u,client:LOOKER_KEYS[i]};}}return{url:"",client:"unknown"};}"""
)

# Replace the hardcoded onClick
c = c.replace(
    """onClick={function(){window.open("https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","_blank");}}""",
    """onClick={function(){var r=findLookerUrl(campaigns,selected);if(r.url){window.open(r.url,"_blank");}else{alert("No Looker report configured for '"+r.client+"' yet.");}}}"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
print("LOOKER_URLS found:", "LOOKER_URLS" in c)
print("findLookerUrl found:", "findLookerUrl" in c)
