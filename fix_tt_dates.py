with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# TikTok: campaigns that are DISABLE status = completed
# Add startDate/endDate fields
c = c.replace(
    'status: ttStatus });',
    'startDate: "", endDate: "", status: ttStatus });'
)

# Google: add startDate/endDate
c = c.replace(
    'status: gc.status === "ENABLED" ? "active" : "paused"',
    'startDate: "", endDate: "", status: gc.status === "ENABLED" ? "active" : "paused"'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - dates added to TikTok and Google")
