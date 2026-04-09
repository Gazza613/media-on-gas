with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the old iframe deepdive block
old = '{tab==="deepdive"&&(<div><SH icon={Ic.eye(P.cyan,20)} title="Deep Dive" sub="Demographics & Creative Performance \u00b7 Powered by Looker Studio" accent={P.cyan}/><Glass accent={P.cyan} st={{padding:0,overflow:"hidden",marginBottom:24}}><div style={{width:"100%",height:800,position:"relative"}}><iframe src="https://lookerstudio.google.com/u/0/embed/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d" width="100%" height="100%" style={{border:"none",borderRadius:16}} allowFullScreen></iframe></div></Glass><Insight title="About This View" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>This interactive report provides granular campaign analysis including audience demographics, ad creative performance with visual thumbnails, placement breakdowns, and device-level delivery data. Use the date controls within the report to adjust the analysis period.</Insight></div>)}'

c = c.replace(old, '')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)

print("Iframe removed:", "iframe" not in c)
print("Deepdive tabs remaining:", c.count("deepdive"))
