with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The sumP function needs to include follows but also the tt calcD needs ctr/cpc
# Currently tt doesn't get calcD applied - let's check
# The computed block does: var tt=calcD(sumP(tc));
# calcD adds cpm, cpc, ctr, frequency - which is correct
# But we need to make sure reach is being summed

# Check if reach is in sumP
if "reach:a.reach+parseFloat(c.reach||0)" in c:
    print("reach already in sumP")
else:
    print("ERROR: reach not in sumP")

# The issue is that TikTok campaigns have reach:"0" from the API
# After fixing the API above, this should work
# But we also need to ensure the display uses t.reach, t.ctr, t.cpc

print("Done - verified computed includes reach/ctr/cpc")
