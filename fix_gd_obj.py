with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add Google Display check before the default "Traffic" return
c = c.replace(
    "if(n.indexOf(\"homeloan\")>=0||n.indexOf(\"traffic\")>=0||n.indexOf(\"paidsearch_display_homeloans\")>=0)return \"Landing Page Clicks\";\n                return \"Traffic\";",
    "if(n.indexOf(\"homeloan\")>=0||n.indexOf(\"traffic\")>=0||n.indexOf(\"paidsearch\")>=0||n.indexOf(\"google\")>=0)return \"Landing Page Clicks\";\n                return \"Traffic\";"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all Google campaigns = Landing Page Clicks")
