with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The fR function already does 2 decimal places - let's verify
# Also fix the pc function to always show 2 decimal places
# And ensure the chart axis formatter shows 2 decimals for currency

# Fix the CPC axis formatter on charts
c = c.replace(
    'return"R"+v.toFixed(0);',
    'return"R"+v.toFixed(2);'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - currency 2dp fixed")
