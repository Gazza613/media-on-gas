with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace all orange header styles with glass effect
c = c.replace(
    'background:"#F96203",border:"1px solid #E85500"',
    'background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)"'
)

# Make font slightly bigger
c = c.replace(
    'fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#fff"',
    'fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - glass effect headers with bigger font")
