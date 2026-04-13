with open("/workspaces/media-on-gas/api/adsets.js", "r") as f:
    c = f.read()

old_accounts = """var metaAccounts = [
    { id: "act_855aborede795536", name: "MTN MoMo Meta" },
    { id: "act_542990539806888", name: "GAS Agency" }
  ];"""

new_accounts = """var metaAccounts = [
    { id: "act_8159212987434597", name: "MTN MoMo Meta" },
    { id: "act_3600654450252189", name: "MTN Khava" },
    { id: "act_825253026181227", name: "Concord College" },
    { id: "act_1187886635852303", name: "Eden College" },
    { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
    { id: "act_542990539806888", name: "GAS Agency" }
  ];"""

if old_accounts in c:
    c = c.replace(old_accounts, new_accounts)
    print("Fixed account IDs")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/api/adsets.js", "w") as f:
    f.write(c)
