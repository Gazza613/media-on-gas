with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'background:"linear-gradient(135deg, #003a55 0%, #004F71 50%, #005580 100%)",borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid rgba(255,203,5,0.15)"',
    'background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule'
)

# Also fix the table header colours inside awareness to match
c = c.replace(
    'border:"1px solid #002a40"',
    'border:"1px solid "+P.rule',
)

# Fix text colours from white to P.txt since background is now dark glass
c = c.replace('color:"#fff"}}>Facebook</span>', 'color:P.txt}}>Facebook</span>')
c = c.replace('color:"#fff"}}>Instagram</span>', 'color:P.txt}}>Instagram</span>')
c = c.replace('color:"#fff"}}>TikTok</span>', 'color:P.txt}}>TikTok</span>')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - awareness background matches other sections")
