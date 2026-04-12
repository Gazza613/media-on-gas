with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'igEarned+=parseFloat(camp.pageFollows||0);',
    'igEarned+=parseFloat(camp.clicks||0);'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
print("Verify:", "igEarned+=parseFloat(camp.clicks||0)" in c)
