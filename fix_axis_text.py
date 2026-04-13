with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Make Y axis labels brighter
c = c.replace('fill:"rgba(255,255,255,0.4)",fontFamily:fm', 'fill:"rgba(255,255,255,0.65)",fontFamily:fm')
c = c.replace('fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter', 'fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter')

# Make X axis labels brighter
c = c.replace('fill:"#fff",fontFamily:fm}} stroke="transparent"', 'fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"')
c = c.replace('fill:P.txt,fontFamily:fm}} stroke="transparent"', 'fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"')

# Make chart legends brighter
c = c.replace('color:"rgba(255,255,255,0.6)",fontFamily', 'color:"rgba(255,255,255,0.7)",fontFamily')
c = c.replace('color:P.sub,fontFamily:fm}}>Impressions', 'color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Impressions')
c = c.replace('color:P.sub,fontFamily:fm}}>Reach', 'color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Reach')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - axis text brighter")
