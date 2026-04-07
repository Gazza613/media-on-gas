import urllib.request, json
token = input("Paste your long-lived token: ")
account = input("Ad Account ID (with act_): ")
url = "https://graph.facebook.com/v25.0/" + account + "/insights?fields=campaign_name,impressions,spend,clicks,ctr,cpc,cpm&date_preset=last_30d&level=campaign&access_token=" + token
try:
    r = urllib.request.urlopen(url)
    data = json.loads(r.read())
    for c in data.get("data", []):
        print(c.get("campaign_name") + ": " + c.get("impressions","0") + " impressions, R" + c.get("spend","0") + " spend")
except urllib.error.HTTPError as e:
    print("ERROR:", json.loads(e.read()))
