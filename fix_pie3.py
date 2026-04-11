with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix pie label font size - make it smaller
c = c.replace(
    'labelStyle={{fontSize:11,fontFamily:fm,fill:"#fff"}}',
    'labelStyle={{fontSize:9,fontFamily:fm,fill:"#fff"}}'
)

# Make pie chart taller so top doesn't cut off
c = c.replace(
    'outerRadius={72} innerRadius={44}',
    'outerRadius={65} innerRadius={40}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie font smaller, radius reduced")
