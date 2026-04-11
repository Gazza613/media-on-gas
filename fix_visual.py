with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix unicode escapes that aren't rendering
c = c.replace('\\u2014', '\u2014')
c = c.replace('\\u00b7', '\u00b7')
c = c.replace('\\u2019', '\u2019')
c = c.replace('\\u0026', '&')

# Fix blank platform column - replace empty first header
c = c.replace(
    '["","Media Spend","Impressions","Reach","CPM","Frequency"]',
    '["Platform","Media Spend","Impressions","Reach","CPM","Frequency"]'
)
c = c.replace(
    '["","Media Spend","Reach","Clicks","CTR %","CPC"]',
    '["Platform","Media Spend","Reach","Clicks","CTR %","CPC"]'
)
c = c.replace(
    '["","Media Spend","Reach","Clicks","Leads","Cost Per Lead"]',
    '["Platform","Media Spend","Reach","Clicks","Leads","Cost Per Lead"]'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - unicode + platform labels fixed")
