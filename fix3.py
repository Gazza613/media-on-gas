with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove frequency warning from awareness insight
c = c.replace(
    'if(computed.fb.frequency>3)parts.push("Warning: Facebook frequency at "+computed.fb.frequency.toFixed(2)+"x is approaching the fatigue threshold \u2014 consider audience expansion or creative refresh.");',
    ''
)

# Remove CPC warnings from engagement insight
c = c.replace(
    'if(m.cpc>0&&m.cpc<2)parts.push("Meta CPC below R2.00 is a positive efficiency signal \u2014 consider scaling budget on top-performing ad sets.");else if(m.cpc>5)parts.push("Meta CPC above R5.00 warrants creative review and potential audience refresh.");',
    ''
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - warnings moved to optimisation only")
