with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix the engagement insight to use totalClicks which includes Google
c = c.replace(
    'var totalClicks=m.clicks+t.clicks;',
    'var totalClicks=m.clicks+t.clicks+computed.gd.clicks;'
)

c = c.replace(
    'var blendedCpc=totalClicks>0?computed.totalSpend/totalClicks:0;',
    'var blendedCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;'
)

# Also fix the clickToImpRate to use computed.totalClicks
c = c.replace(
    'var clickToImpRate=computed.totalImps>0?(totalClicks/computed.totalImps*100):0;',
    'var clickToImpRate=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;'
)

c = c.replace(
    '"The campaign generated "+fmt(totalClicks)+" total click actions across all platforms',
    '"The campaign generated "+fmt(computed.totalClicks)+" total click actions across all platforms'
)

c = c.replace(
    '"The cross-platform blended CPC of "+fR(blendedCpc)+" across "+fmt(totalClicks)+" total clicks',
    '"The cross-platform blended CPC of "+fR(computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0)+" across "+fmt(computed.totalClicks)+" total clicks'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - insight clicks now includes Google Display")
