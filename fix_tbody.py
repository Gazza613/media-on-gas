with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix: move bestRow2 computation before the map, use regular map
old = "<tbody>{(function(){var bestRow2=sorted3.reduce(function(a,x){return x.result>a.result?x:a;},{result:-1});return sorted3.map(function(r,ri){"
new = "<tbody>{sorted3.map(function(r,ri){var bestRow2=sorted3[0]&&sorted3.reduce(function(a,x){return x.result>a.result?x:a;},{result:-1});"

c = c.replace(old, new)

# Fix closing - remove IIFE wrapper
c = c.replace("</tr>;})})()}", "</tr>;})}") 

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Fixed tbody")
