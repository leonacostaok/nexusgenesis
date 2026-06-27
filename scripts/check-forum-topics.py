import urllib.request
import json

resp = urllib.request.urlopen('http://localhost:19891/api/forum/topics?limit=5', timeout=10)
data = json.loads(resp.read().decode())
print(f"Total topics: {data.get('total', 0)}")
for t in data.get('topics', []):
    print(f"  {t['id']} | posts={t.get('postCount',0)} | {t['title'][:60]}")
