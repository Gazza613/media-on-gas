with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Need to import Line from recharts - check if already imported
if "ComposedChart" not in c.split("from")[0]:
    c = c.replace(
        'import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";',
        'import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from "recharts";'
    )

# Replace the engagement bar chart with a ComposedChart showing Clicks bars + CPC line
c = c.replace(
    '<ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc},{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc},{name:"TikTok",Clicks:t.clicks,CPC:t.clicks>0?t.spend/t.clicks:0}]}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Clicks" fill={P.mint} radius={[6,6,0,0]} barSize={30}/></BarChart></ResponsiveContainer>',
    '<ResponsiveContainer width="100%" height={220}><ComposedChart data={[{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc},{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc},{name:"TikTok",Clicks:t.clicks,CPC:t.clicks>0?t.spend/t.clicks:0}]}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis yAxisId="left" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:P.ember,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return"R"+v.toFixed(0);}}/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar yAxisId="left" dataKey="Clicks" fill={P.mint} radius={[6,6,0,0]} barSize={30}/><Line yAxisId="right" type="monotone" dataKey="CPC" stroke={P.ember} strokeWidth={2.5} dot={{r:5,fill:P.ember}} activeDot={{r:7}}/></ComposedChart></ResponsiveContainer>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - CPC line added to engagement chart")
