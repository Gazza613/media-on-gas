with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Add start_time and stop_time to Meta campaign fields
c = c.replace(
    'fields=name,id,effective_status,created_time&',
    'fields=name,id,effective_status,created_time,start_time,stop_time&'
)

# Store the dates in campaignInfo
c = c.replace(
    'campaignInfo[camp.id] = { name: camp.name, status: camp.effective_status, created: new Date(camp.created_time) };',
    'campaignInfo[camp.id] = { name: camp.name, status: camp.effective_status, created: new Date(camp.created_time), startTime: camp.start_time || null, stopTime: camp.stop_time || null };'
)

# Add startDate and endDate to the campaign push for Meta
c = c.replace(
    'status: campaignInfo[c.campaign_id] ? campaignInfo[c.campaign_id].status.toLowerCase()',
    'startDate: campaignInfo[c.campaign_id] && campaignInfo[c.campaign_id].startTime ? campaignInfo[c.campaign_id].startTime.substring(0,10) : "",\n              endDate: campaignInfo[c.campaign_id] && campaignInfo[c.campaign_id].stopTime ? campaignInfo[c.campaign_id].stopTime.substring(0,10) : "",\n              status: campaignInfo[c.campaign_id] ? campaignInfo[c.campaign_id].status.toLowerCase()'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - campaign dates added to API")
