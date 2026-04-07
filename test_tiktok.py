import urllib.request, json
token = input("TikTok Access Token: ")
adv_id = input("Advertiser ID: ")
url = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/"
body = json.dumps({
    "advertiser_id": adv_id,
    "report_type": "BASIC",
    "data_level": "AUCTION_CAMPAIGN",
    "dimensions": ["campaign_id"],
    "metrics": ["spend", "impressions", "clicks", "cpm"],
    "start_date": "2026-03-01",
    "end_date": "2026-04-07",
    "page_size": 10
}).encode()
req = urllib.request.Request(url, data=body, method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("Access-Token", token)
try:
    r = urllib.request.urlopen(req)
    raw = r.read().decode()
    print("RESPONSE:", raw)
except urllib.error.HTTPError as e:
    raw = e.read().decode()
    print("ERROR CODE:", e.code)
    print("ERROR:", raw)
