with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace('>DEVICES<', '>OBJECTIVE RESULTS<')
c = c.replace('>Mobile, Desktop, Tablet<', '>Results by Campaign Objective<')
c = c.replace('>Device-level performance data<', '>Objective-level performance data<')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - card text updated")
