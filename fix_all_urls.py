with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix MTN MoMo URL (was wrong - had Willowbrook's URL)
c = c.replace(
    '"MTN MoMo":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d"',
    '"MTN MoMo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd"'
)

# Add MTN POS and Willowbrook URLs
c = c.replace(
    '"Willowbrook":""',
    '"Willowbrook":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d"'
)

c = c.replace(
    '"Psycho Bunny ZA":""',
    '"Psycho Bunny ZA":"https://lookerstudio.google.com/reporting/0adc106a-50e2-42cc-a4ca-aafc04160e5d/page/p_1ooj1p0nmd"'
)

# Add MTN POS to the LOOKER mapping
c = c.replace(
    '"Flower Foundation":"",',
    '"Flower Foundation":"","MTN POS":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d",'
)

# Add MTN POS to the campaign name matcher
c = c.replace(
    '{match:"khava",client:"MTN Khava"}',
    '{match:"khava",client:"MTN Khava"},{match:"pos",client:"MTN POS"},{match:"point of sale",client:"MTN POS"}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all Looker URLs updated")
