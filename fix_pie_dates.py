with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Pie chart labels even smaller
c = c.replace(
    'labelStyle={{fontSize:9,fontFamily:fm,fill:"#fff"}}',
    'labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}}'
)

# Fix 2: Default dates to current month
# Replace hardcoded dates with dynamic current month
c = c.replace(
    'var ds=useState("2026-04-01"),df=ds[0],setDf=ds[1];',
    'var nowD=new Date();var monthStart=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-01";var ds=useState(monthStart),df=ds[0],setDf=ds[1];'
)

c = c.replace(
    'var de=useState("2026-04-07"),dt=de[0],setDt=de[1];',
    'var lastDay=new Date(nowD.getFullYear(),nowD.getMonth()+1,0).getDate();var monthEnd=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-"+String(lastDay).padStart(2,"0");var de=useState(monthEnd),dt=de[0],setDt=de[1];'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie labels 7px, dates default to current month")
