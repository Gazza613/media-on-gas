import urllib.request, json
app_id = input("App ID: ")
secret = input("Secret: ")
token = input("Token: ")
url = "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=" + app_id + "&client_secret=" + secret + "&fb_exchange_token=" + token
r = urllib.request.urlopen(url)
print(json.loads(r.read()))
