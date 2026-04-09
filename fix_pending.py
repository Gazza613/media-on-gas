with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'c.status==="scheduled"?P.solar:c.status==="completed"?P.sub:P.warning',
    'c.status==="scheduled"?P.solar:c.status==="pending"?P.cyan:c.status==="completed"?P.sub:P.warning'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pending status colour added")
