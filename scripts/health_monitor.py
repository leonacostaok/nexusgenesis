#!/usr/bin/env python3
"""
NexusGenesis 系统健康监控脚本

用法:
  python3 scripts/health_monitor.py              # 本地模式 (查询 localhost)
  python3 scripts/health_monitor.py --remote     # 远程模式 (SSH 到服务器查询)
  python3 scripts/health_monitor.py --json       # 输出 JSON (便于告警系统消费)

检查项:
  1. 3 个节点 HTTP API 可达性
  2. 链高度 + 哈希一致性 (chain alignment)
  3. PM2 进程状态
  4. 服务器磁盘 + 内存
  5. 生态系统统计 (agents / tasks / proposals)
"""

import argparse
import json
import subprocess
import sys
import urllib.request
import urllib.error
from datetime import datetime

NODES = [
    {"name": "genesis", "port": 19891},
    {"name": "node02", "port": 19892},
    {"name": "node03", "port": 19893},
]

SSH_HOST = "root@nexus-genesis.top"
SSH_KEY = "~/.ssh/ng_deploy"

# ANSI 颜色
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def ok(msg):
    return f"{GREEN}[OK]{RESET} {msg}"


def fail(msg):
    return f"{RED}[FAIL]{RESET} {msg}"


def warn(msg):
    return f"{YELLOW}[WARN]{RESET} {msg}"


def fetch_json(url, timeout=5):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "health-monitor"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.URLError as e:
        return None, f"连接失败: {e.reason}"
    except Exception as e:
        return None, str(e)


def ssh_run(cmd, timeout=15):
    full = ["ssh", "-i", SSH_KEY, SSH_HOST, cmd]
    try:
        r = subprocess.run(full, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def local_run(cmd, timeout=15):
    """直接在本机执行命令 (用于在服务器上运行时)"""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def check_nodes():
    """检查 3 个节点的 HTTP API + 链一致性"""
    print(f"\n{BOLD}{CYAN}═══ 节点状态 ═══{RESET}")
    results = []
    for node in NODES:
        url = f"http://localhost:{node['port']}/api/v1/bootstrap/blocks/recent?count=1"
        data, err = fetch_json(url)
        if err:
            print(fail(f"{node['name']} (port {node['port']}): {err}"))
            results.append({"name": node["name"], "online": False})
            continue

        blocks = data.get("blocks", [])
        if not blocks:
            print(fail(f"{node['name']}: 无区块数据"))
            results.append({"name": node["name"], "online": False})
            continue

        b = blocks[0]
        print(ok(f"{node['name']}: height={b['index']} hash={b['hash'][:18]}... txs={b.get('transactions', 0)}"))
        results.append({
            "name": node["name"],
            "online": True,
            "height": b["index"],
            "hash": b["hash"],
        })

    # 链一致性检查
    online = [r for r in results if r.get("online")]
    if len(online) >= 2:
        heights = {r["height"] for r in online}
        hashes = {r["hash"] for r in online}
        if len(hashes) == 1 and len(heights) == 1:
            print(ok(f"链一致性: {len(online)}/{len(online)} 节点对齐 @ height {online[0]['height']}"))
        else:
            print(fail(f"链分叉! heights={heights}"))
            for r in online:
                print(f"  {r['name']}: h={r['height']} hash={r['hash'][:18]}...")
    elif len(online) == 1:
        print(warn(f"仅 1 个节点在线, 无法验证一致性"))
    else:
        print(fail("所有节点离线"))

    return results


def check_bootstrap_status():
    """检查 genesis 节点的 bootstrap 状态 (agents/validators/uptime)"""
    print(f"\n{BOLD}{CYAN}═══ Bootstrap 状态 ═══{RESET}")
    data, err = fetch_json("http://localhost:19891/api/v1/bootstrap/status")
    if err:
        print(fail(f"无法获取 bootstrap status: {err}"))
        return None

    print(ok(f"区块高度: {data.get('blockHeight', 0)}"))
    print(ok(f"Agent 数: {data.get('agentCount', 0)}"))
    print(ok(f"验证者: {data.get('validatorCount', 0)}/{data.get('maxValidators', 7)}"))
    print(ok(f"NGEN 已发放: {data.get('totalNGENAwarded', 0):,}"))
    uptime_h = data.get("uptime", 0) / 3600000
    print(ok(f"运行时长: {uptime_h:.1f}h"))
    print(ok(f"出块间隔: {data.get('blockTime', 5000)}ms"))

    bx = data.get("bootstrapExitProgress", {})
    print(f"  Bootstrap 退出进度: uptime={bx.get('uptime')} validators={bx.get('validatorCount')} canExit={bx.get('canExit')}")
    return data


def check_pm2(remote=False):
    """检查 PM2 进程状态. remote=True 从本地 SSH 到服务器; remote=False 在服务器上直接执行."""
    print(f"\n{BOLD}{CYAN}═══ PM2 进程 ═══{RESET}")
    runner = ssh_run if remote else local_run
    out = runner("pm2 jlist")
    if not out:
        print(fail("无法获取 PM2 进程列表"))
        return
    try:
        procs = json.loads(out)
    except Exception as e:
        print(fail(f"PM2 jlist 解析失败: {e}"))
        return

    expected = {
        "nexusgenesis-genesis",
        "nexusgenesis-node02",
        "nexusgenesis-node03",
        "agent-worker-swarm-atlas",
        "agent-worker-swarm-beacon",
        "agent-worker-swarm-cipher",
        "agent-worker-swarm-drift",
        "agent-worker-swarm-echo",
        "system-publisher",
    }
    found = {p["name"] for p in procs}
    for p in procs:
        status = p.get("pm2_env", {}).get("status", "?")
        mem_mb = p.get("monit", {}).get("memory", 0) / 1024 / 1024
        cpu = p.get("monit", {}).get("cpu", 0)
        restarts = p.get("pm2_env", {}).get("restart_time", 0)
        marker = ok if status == "online" else fail
        print(marker(f"{p['name']:<32} {status:<8} mem={mem_mb:6.1f}MB cpu={cpu:5.1f}% restarts={restarts}"))

    missing = expected - found
    for m in sorted(missing):
        print(fail(f"缺失进程: {m}"))


def check_system_resources(remote=False):
    """检查磁盘 + 内存. remote=True 从本地 SSH; remote=False 在服务器上直接执行."""
    print(f"\n{BOLD}{CYAN}═══ 系统资源 ═══{RESET}")
    runner = ssh_run if remote else local_run

    df = runner("df -h / | tail -1")
    if df:
        parts = df.split()
        if len(parts) >= 5:
            use_pct = parts[4].rstrip("%")
            marker = ok if int(use_pct) < 85 else (warn if int(use_pct) < 95 else fail)
            print(marker(f"磁盘: {parts[2]} 已用 / {parts[1]} 总计 ({parts[4]})  可用={parts[3]}"))
    else:
        print(fail("无法获取磁盘信息"))

    free = runner("free -m | grep Mem")
    if free:
        parts = free.split()
        if len(parts) >= 4:
            total, used = int(parts[1]), int(parts[2])
            free_mb = total - used
            use_pct = used * 100 // total if total else 0
            marker = ok if use_pct < 80 else (warn if use_pct < 90 else fail)
            print(marker(f"内存: {used}MB 已用 / {total}MB 总计 ({use_pct}%)  可用={free_mb}MB"))
    else:
        print(fail("无法获取内存信息"))


def check_ecosystem():
    """检查生态系统统计 (tasks/proposals/forum)"""
    print(f"\n{BOLD}{CYAN}═══ 生态系统 ═══{RESET}")
    # Tasks
    tasks_data, err = fetch_json("http://localhost:19891/api/tasks?status=open&limit=1")
    if not err and tasks_data:
        # 尝试获取总数
        total = tasks_data.get("total", tasks_data.get("count", "?"))
        print(ok(f"开放任务: {total}"))

    # Agents
    agents_data, err = fetch_json("http://localhost:19891/api/v1/bootstrap/agents")
    if not err and agents_data:
        count = agents_data.get("total", agents_data.get("count", 0))
        print(ok(f"注册 Agent: {count}"))

    # Proposals (尝试常见端点)
    prop_data, err = fetch_json("http://localhost:19891/api/v1/proposals")
    if not err and prop_data:
        proposals = prop_data.get("proposals", [])
        print(ok(f"治理提案: {len(proposals)}"))

    # Forum topics
    forum_data, err = fetch_json("http://localhost:19891/api/forum/topics?limit=1")
    if not err and forum_data:
        total = forum_data.get("total", forum_data.get("count", "?"))
        print(ok(f"论坛主题: {total}"))


def main():
    parser = argparse.ArgumentParser(description="NexusGenesis 系统健康监控")
    parser.add_argument("--remote", action="store_true",
                        help="从本地 SSH 到服务器检查 PM2/资源 (默认: 在服务器上直接执行)")
    parser.add_argument("--json", action="store_true", help="JSON 输出 (便于告警系统)")
    args = parser.parse_args()

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    mode = "远程 (SSH)" if args.remote else "服务器本地"
    print(f"{BOLD}NexusGenesis 健康报告 — {now}  [{mode}]{RESET}")

    node_results = check_nodes()
    check_bootstrap_status()
    check_ecosystem()
    check_pm2(remote=args.remote)
    check_system_resources(remote=args.remote)

    # 汇总
    online_count = sum(1 for r in node_results if r.get("online"))
    print(f"\n{BOLD}═══ 汇总 ═══{RESET}")
    if online_count == 3:
        print(ok(f"节点: {online_count}/3 在线"))
    elif online_count > 0:
        print(warn(f"节点: {online_count}/3 在线 (部分降级)"))
    else:
        print(fail(f"节点: 0/3 在线 (系统离线)"))

    sys.exit(0 if online_count == 3 else 1)


if __name__ == "__main__":
    main()
