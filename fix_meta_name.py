with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Add "Meta" suffix to Meta account names that don't already have it
c = c.replace(
    'accountName: account.name,',
    'accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""),'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - Meta suffix added to account names")
