with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'console.log("GROUP "+o+":",sorted.map(function(x){return x.platform+" | "+x.name+" | clicks:"+x.clicks;}));groups[o]=sorted;',
    'groups[o]=sorted;'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - debug removed")
