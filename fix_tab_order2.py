with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find current tab definition and replace
old_tabs = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,16)},{id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,16)},{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}];'

new_tabs = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}];'

if old_tabs in c:
    c = c.replace(old_tabs, new_tabs)
    print("Fixed tab order - removed Ad Serving, Engagement, Objectives")
else:
    print("Exact match not found, trying alternative...")
    # Try to find and rebuild
    idx = c.find('var tabs=[')
    if idx > 0:
        end = c.find('];', idx) + 2
        old = c[idx:end]
        print("Current tabs:", old[:200])
        c = c[:idx] + new_tabs + c[end:]
        print("Replaced tabs")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
