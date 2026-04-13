with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Current order: overview, tof, mof, bof, then community is pushed separately
# Move community to position 2 (after overview)
old = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,16)},{id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,16)},{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)}];\n  tabs.push({id:"community",label:"Community",icon:Ic.users(P.mint,16)});'

new = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,16)},{id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,16)},{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)}];'

if old in c:
    c = c.replace(old, new)
    print("Fixed: Community tab moved to 2nd position")
else:
    print("Not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
