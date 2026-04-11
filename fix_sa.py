with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace("South African market", "paid social market")
c = c.replace("South African paid social market", "paid social market")
c = c.replace("South African paid social", "paid social")
c = c.replace("South Africa", "the target market")
c = c.replace("the South African market", "the paid social market")
c = c.replace("ZA market", "the market")
c = c.replace("SA market", "the market")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)

count = c.count("South Afric")
print("Done - remaining SA references:", count)
