with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Step 1: Find and extract the community growth section from overview
start_marker = '          {/* COMMUNITY GROWTH */}'
end_search = '          </div>\n        </div>)}\n'

start_idx = c.find(start_marker)
if start_idx < 0:
    print("ERROR: Community section not found")
else:
    # Find the closing </div> that ends the community section
    # It's the </div> before the </div>)} that closes the overview tab
    overview_end = c.find('</div>)}\n', start_idx)
    # Go back to find the community section end
    community_end = c.rfind('\n          </div>\n', start_idx, overview_end)
    if community_end < 0:
        community_end = overview_end
    
    # Extract community HTML
    community_section = c[start_idx:community_end + len('\n          </div>')]
    
    # Remove from overview
    c = c[:start_idx] + c[community_end + len('\n          </div>'):]
    
    print("Community section extracted:", len(community_section), "chars")
    
    # Step 2: Add Community tab
    c = c.replace(
        'tabs.push({id:"deepdive",label:"Deep Dive"',
        'tabs.push({id:"community",label:"Community",icon:Ic.users(P.mint,16)});tabs.push({id:"deepdive",label:"Deep Dive"'
    )
    
    # Step 3: Add Community tab content before Deep Dive tab content
    community_tab = """
        {{tab==="community"&&(<div>
          <SH icon={{Ic.users(P.mint,20)}} title="Community Growth" sub={{df+" to "+dt+" · Followers & Likes by Platform"}} accent={{P.mint}}/>
{community}
        </div>)}}
""".replace("{community}", community_section).replace("{{", "{").replace("}}", "}")
    
    # Insert before deepdive tab
    deepdive_marker = '        {tab==="deepdive"'
    deepdive_idx = c.find(deepdive_marker)
    if deepdive_idx > 0:
        c = c[:deepdive_idx] + '\n        {tab==="community"&&(<div>\n          <SH icon={Ic.users(P.mint,20)} title="Community Growth" sub={df+" to "+dt+" \\u00b7 Followers & Likes by Platform"} accent={P.mint}/>\n' + community_section + '\n        </div>)}\n\n' + c[deepdive_idx:]
        print("Community tab added before Deep Dive")
    else:
        print("ERROR: Deep Dive tab not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
