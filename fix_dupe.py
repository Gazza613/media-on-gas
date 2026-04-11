with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}} labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}}',
    'labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - duplicate labelStyle removed")
