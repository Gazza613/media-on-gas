with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix Facebook percentage in insights - use computed.totalImps which includes all platforms
c = c.replace(
    '((computed.fb.impressions/computed.totalImps)*100).toFixed(1)',
    '(computed.totalImps>0?(computed.fb.impressions/computed.totalImps*100).toFixed(1):"0")'
)

# Fix Instagram percentage
c = c.replace(
    '((computed.ig.impressions/computed.totalImps)*100).toFixed(1)',
    '(computed.totalImps>0?(computed.ig.impressions/computed.totalImps*100).toFixed(1):"0")'
)

# Fix TikTok percentage  
c = c.replace(
    '((t.impressions/computed.totalImps)*100).toFixed(1)',
    '(computed.totalImps>0?(t.impressions/computed.totalImps*100).toFixed(1):"0")'
)

# Fix Google percentage
c = c.replace(
    '((computed.gd.impressions/computed.totalImps)*100).toFixed(1)',
    '(computed.totalImps>0?(computed.gd.impressions/computed.totalImps*100).toFixed(1):"0")'
)

# Now fix the pie chart legend to use computed.totalImps as total instead of just fb+ig+tt+gd
c = c.replace(
    'var total=computed.fb.spend+computed.ig.spend+t.spend+computed.gd.spend;',
    'var total=computed.totalSpend;'
)

# Fix the pie chart label to use totalSpend
c = c.replace(
    'var total=computed.fb.spend+computed.ig.spend+t.spend;var pct',
    'var total=computed.totalSpend;var pct'
)

# Make sure impression pie uses same total
# Check the impression share chart legend
c = c.replace(
    'computed.totalImps>0?((p.v/computed.totalImps)*100).toFixed(1)',
    'computed.totalImps>0?(p.v/computed.totalImps*100).toFixed(1)'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all percentages use same totals")
