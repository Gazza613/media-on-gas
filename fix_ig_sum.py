with open("/workspaces/media-on-gas/api/pages.js", "r") as f:
    c = f.read()

# Fix: SUM all daily values instead of last - first
c = c.replace(
    'var firstVal = vals[0].value;\n            var lastVal = vals[vals.length - 1].value;\n            page.instagram_business_account.follower_growth = lastVal - firstVal;\n            page.instagram_business_account.follower_start = firstVal;\n            page.instagram_business_account.follower_end = lastVal;',
    'var totalGrowth = 0;\n            for (var v = 0; v < vals.length; v++) { totalGrowth += vals[v].value; }\n            page.instagram_business_account.follower_growth = totalGrowth;'
)

with open("/workspaces/media-on-gas/api/pages.js", "w") as f:
    f.write(c)
print("Done - IG follower growth now sums daily values")
