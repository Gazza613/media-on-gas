with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the existing URLs with the correct ones
c = c.replace('"MTN Khava":""', '"MTN Khava":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d"')
c = c.replace('"Psycho Bunny ZA":""', '"Psycho Bunny ZA":"https://lookerstudio.google.com/reporting/0adc106a-50e2-42cc-a4ca-aafc04160e5d/page/p_1ooj1p0nmd"')
c = c.replace('"Willowbrook":""', '"Willowbrook":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d"')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Looker URLs updated")
