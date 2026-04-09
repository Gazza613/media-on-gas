with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find everything between the two Glass tags in the deepdive section
old = '<Glass accent={P.cyan} st={{padding:"36px 32px",marginBottom:24}}>'
new_start = '<Glass accent={P.cyan} st={{padding:0,overflow:"hidden",marginBottom:24,borderRadius:16}}>'

# Find the old block and replace just the Glass component
idx = c.find(old)
if idx > 0:
    end_idx = c.find('</Glass>', idx) + len('</Glass>')
    old_block = c[idx:end_idx]
    new_block = new_start + '<iframe width="100%" height="800" src="https://lookerstudio.google.com/embed/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d" frameBorder="0" style={{border:"none",borderRadius:16,background:"#fff"}} allowFullScreen={true}></iframe></Glass>'
    c = c.replace(old_block, new_block)
    print("Done - iframe embed restored")
else:
    print("Could not find the block to replace")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
