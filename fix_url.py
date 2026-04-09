with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace("LOOKER_URL_PLACEHOLDER", "https://lookerstudio.google.com/u/0/embed/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Looker URL added")
