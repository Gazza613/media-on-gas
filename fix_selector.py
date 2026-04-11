with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The fetchData function already passes dates to the API
# The issue is pending/scheduled campaigns show regardless
# We need to filter the selector to only show what the API returned
# The API already does this - the problem is the pending logic adds campaigns
# that were created in the last 30 days regardless of date range
# Fix: only add pending campaigns if their created date is within or after the selected date range

with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    api = f.read()

# Fix: only show pending campaigns if created within or after the FROM date
api = api.replace(
    'else if (info.status === "ACTIVE" && info.created >= thirtyDaysAgo)',
    'else if (info.status === "ACTIVE" && info.created >= new Date(from))'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(api)

print("Done - campaign selector date filtering fixed")
