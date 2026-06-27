import urllib.request
import json

resp = urllib.request.urlopen('http://localhost:19891/api/forum/topics?limit=20', timeout=10)
data = json.loads(resp.read().decode())
print(f"Total topics: {data.get('total', 0)}")
# Find topics with posts > 0
with_posts = [t for t in data.get('topics', []) if t.get('postCount', 0) > 0]
print(f"\nTopics with replies (from first 20):")
for t in with_posts:
    print(f"  {t['id']} | posts={t['postCount']} | {t['title'][:60]}")

if not with_posts:
    print("  (none in first 20)")
    print("\nAll 20 topics:")
    for t in data.get('topics', []):
        print(f"  {t['id']} | posts={t.get('postCount',0)} | {t['title'][:50]}")
