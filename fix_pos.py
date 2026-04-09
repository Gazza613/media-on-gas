with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the campaign matcher - put "momo pos" BEFORE "momo"
c = c.replace(
    '{match:"momo",client:"MTN MoMo"},{match:"mtn momo",client:"MTN MoMo"}',
    '{match:"momo pos",client:"MTN POS"},{match:"mtn momo pos",client:"MTN POS"},{match:"momo",client:"MTN MoMo"},{match:"mtn momo",client:"MTN MoMo"}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - POS matcher fixed")
