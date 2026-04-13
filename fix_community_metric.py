with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Use followers_count instead of fan_count for Facebook
c = c.replace(
    'matchedPages2.forEach(function(mp){fbTotal+=mp.fan_count||0;',
    'matchedPages2.forEach(function(mp){fbTotal+=mp.followers_count||mp.fan_count||0;'
)
print("Fix 1: Use followers_count for Facebook")

# Fix 2: Change label from PAGE LIKES to FOLLOWERS
c = c.replace(
    'TOTAL PAGE LIKES',
    'TOTAL FOLLOWERS'
)
print("Fix 2: Label changed to TOTAL FOLLOWERS")

# Fix 3: Change earned label
c = c.replace(
    'COST PER LIKE',
    'COST PER FOLLOWER'
)
print("Fix 3: Cost per label updated")

# Fix 4: Change insight text
c = c.replace(
    'Facebook has "+fmt(fbTotal)+" total page likes',
    'Facebook has "+fmt(fbTotal)+" total followers'
)
c = c.replace(
    'cost per like during this period',
    'cost per follower during this period'
)
print("Fix 4: Insight text updated")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
