with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace('AWARENESS ASSESSMENT', 'AWARENESS KEY METRICS')
c = c.replace('Awareness Assessment', 'Awareness Key Metrics')
c = c.replace('ENGAGEMENT ASSESSMENT', 'ENGAGEMENT KEY METRICS')
c = c.replace('Engagement Assessment', 'Engagement Key Metrics')
c = c.replace('OBJECTIVE ASSESSMENT', 'OBJECTIVE KEY METRICS')
c = c.replace('Objective Assessment', 'Objective Key Metrics')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all Assessment changed to Key Metrics")
