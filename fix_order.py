with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the gd line from its current wrong position
c = c.replace(
    "var gd=calcD(sumP(gdC));\n    var sumP=function",
    "var sumP=function"
)

# Add gd after calcD and before fb
c = c.replace(
    "var fb=calcD(sumP(fbC));var ig=calcD(sumP(igC));var mt=calcD(sumP(mc));var tt=calcD(sumP(tc));",
    "var fb=calcD(sumP(fbC));var ig=calcD(sumP(igC));var mt=calcD(sumP(mc));var tt=calcD(sumP(tc));var gd=calcD(sumP(gdC));"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - gd moved after sumP/calcD definitions")
