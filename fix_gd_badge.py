with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix platform badge in objective table
c = c.replace(
    'background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":"TT"}',
    'background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"||r.platform==="YouTube"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":r.platform==="YouTube"?"YT":"TT"}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Google Display badge fixed")
