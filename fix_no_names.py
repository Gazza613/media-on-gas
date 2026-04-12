with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove Facebook page name
c = c.replace(
    """{fbName&&<div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:6}}>{fbName}</div>}""",
    ""
)

# Remove Instagram handle
c = c.replace(
    """{igName&&<div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:6}}>{igName}</div>}""",
    ""
)

# Remove names from insight text
c = c.replace(
    '+" total page likes on "+fbName+", representing',
    '+" total page likes, representing'
)

c = c.replace(
    '+" followers on "+igName+", providing',
    '+" followers, providing'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - names removed")
