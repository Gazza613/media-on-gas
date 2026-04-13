with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '{"Adsets loaded: "+adsets.length+" | Selected campaigns: "+selCamps.length+" | IDs: "+selIds.slice(0,3).join(", ")+" | Names: "+selNames.slice(0,2).join(", ")}',
    'Select campaigns to view adset targeting performance.'
)
print("Debug removed")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
