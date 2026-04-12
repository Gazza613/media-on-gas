with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Remove duplicate community tab declaration
c = c.replace(
    'tabs.push({id:"community",label:"Community",icon:Ic.users(P.mint,16)});tabs.push({id:"community",label:"Community",icon:Ic.users(P.mint,16)});',
    'tabs.push({id:"community",label:"Community",icon:Ic.users(P.mint,16)});'
)

# Fix 2: Remove the empty community tab section
c = c.replace(
    """        {tab==="community"&&(<div>
          <SH icon={Ic.users(P.mint,20)} title="Community Growth" sub={df+" to "+dt+" \\u00b7 Followers & Likes by Platform"} accent={P.mint}/>

        </div>)}


        {tab==="community"&&(<div>""",
    """        {tab==="community"&&(<div>"""
)

# Fix 3: Also fix remaining "per store visit" in objectives
c = c.replace(
    'per store visit compares favourably against the target market mobile app acquisition benchmark of R2.50 to R5.00.',
    'per app store click confirms strong acquisition economics for the campaign period.'
)

print("Duplicate tabs:", c.count('id:"community"'))
print("Community sections:", c.count('tab==="community"'))
print("Store visit remaining:", c.count('store visit'))
print("Done")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
