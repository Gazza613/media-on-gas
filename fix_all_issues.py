with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Fix: Only allow facebook and instagram, skip audience_network and messenger
c = c.replace(
    'var pub = c.publisher_platform || "facebook";',
    'var pub = c.publisher_platform || "facebook"; if (pub !== "facebook" && pub !== "instagram") continue;'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - filtered out Audience Network")
