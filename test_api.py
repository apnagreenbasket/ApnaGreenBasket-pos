import requests

login_res = requests.post("http://localhost:8000/api/auth/token", data={
    "username": "superadmin@apnagreenbasket.com",
    "password": "supersecret123"
})
token = login_res.json().get("access_token")

res = requests.get(
    "http://localhost:8000/api/analytics/outlet-earnings?from_date=2026-08-01&to_date=2026-09-06",
    headers={"Authorization": f"Bearer {token}"}
)

print(res.status_code)
print(res.text)
