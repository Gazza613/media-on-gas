import urllib.request, json
app_id = input("TikTok App ID: ")
secret = input("TikTok App Secret: ")
code = input("Auth Code (get this THEN paste immediately): ")
url = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/"
body = json.dumps({"app_id": app_id, "secret": secret, "auth_code": code}).encode()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req)
    print(json.loads(r.read()))
except urllib.error.HTTPError as e:
    print("ERROR:", json.loads(e.read()))
