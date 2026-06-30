#!/usr/bin/env python3
"""
NexusGenesis 系统健康监控脚本 (单节点架构)

用法:
  python3 scripts/health_monitor.py              # 本地模式 (查询 localhost)
  python3 scripts/health_monitor.py --json       # 输出 JSON (便于告警系统消费)
  python3 scripts/health_monitor.py --alert      # 检测异常时写入告警文件

检查项:
  1. genesis 节点 HTTP API 可达性
  2. 区块高度增长 (链是否停止出块)
  3. PM2 进程状态 (genesis + agent workers)
  4. 服务器磁盘 + 内存
  5. AGENT 数量 + 验证者数量
  6. totalNGENAwarded 数据一致性
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

NODES = [
    {"name": "genesis", "port": 19891},
]

ALERT_FILE = "/var/log/nexusgenesis/alerts/health-alerts.log"
STATE_FILE = "/tmp/nexusgenesis-health-state.json"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

CRITICAL_ALERTS = []
WARNING_ALERTS = []


def ok(msg):
    return f"{GREEN}[OK]{RESET} {msg}"


def fail(msg):
    return f"{RED}[FAIL]{RESET} {msg}"


def warn(msg):
    return f"{YELLOW}[WARN]{RESET} {msg}"


def add_alert(level, message):
    timestamp = datetime.now().isoformat()
    alert = {"timestamp": timestamp, "level": level, "message": message}
    if level == "CRITICAL":
        CRITICAL_ALERTS.append(alert)
    elif level == "WARNING":
        WARNING_ALERTS.append(alert)


def fetch_json(url, timeout=5):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "health-monitor"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.URLError as e:
        return None, f"连接失败: {e.reason}"
    except Exception as e:
        return None, str(e)


def local_run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f)
    except Exception:
        pass


def write_alert_file():
    if not CRITICAL_ALERTS and not WARNING_ALERTS:
        return

    os.makedirs(os.path.dirname(ALERT_FILE), exist_ok=True)
    with open(ALERT_FILE, 'a') as f:
        for alert in CRITICAL_ALERTS + WARNING_ALERTS:
            f.write(f"[{alert['timestamp']}] {alert['level']}: {alert['message']}\n")


def check_node_api(node):
    url = f"http://localhost:{node['port']}/api/v1/bootstrap/status"
    data, err = fetch_json(url)
    if err:
        add_alert("CRITICAL", f"节点 {node['name']} API不可达: {err}")
        return None, fail(f"节点 {node['name']} API不可达: {err}")
    return data, ok(f"节点 {node['name']} API正常 (区块 #{data.get('blockHeight', '?')})")


def check_block_growth(data, state):
    current_height = data.get("blockHeight", 0)
    node_key = "genesis"
    prev_state = state.get(node_key, {})
    prev_height = prev_state.get("blockHeight", 0)
    prev_time = prev_state.get("timestamp", 0)
    current_time = time.time()

    state[node_key] = {
        "blockHeight": current_height,
        "timestamp": current_time
    }

    if prev_height == 0:
        return ok(f"首次记录区块高度: #{current_height}")

    elapsed = current_time - prev_time
    if elapsed < 30:
        return ok(f"区块高度: #{current_height} (刚检查过)")

    expected_min_blocks = int(elapsed / 10)
    actual_blocks = current_height - prev_height

    if actual_blocks == 0:
        add_alert("CRITICAL", f"区块停止增长! 当前高度 #{current_height}, 上次 #{prev_height}")
        return fail(f"区块停止增长! 当前 #{current_height}, 上次 #{prev_height} ({elapsed:.0f}秒)")
    elif actual_blocks < expected_min_blocks * 0.5:
        add_alert("WARNING", f"区块增长缓慢: {actual_blocks}块/{elapsed:.0f}秒 (预期>{expected_min_blocks})")
        return warn(f"区块增长缓慢: {actual_blocks}块/{elapsed:.0f}秒")
    else:
        return ok(f"区块正常增长: +{actual_blocks}块/{elapsed:.0f}秒 (高度 #{current_height})")


def check_pm2_processes():
    result = local_run("pm2 jlist")
    if not result:
        add_alert("CRITICAL", "无法获取PM2进程列表")
        return fail("无法获取PM2进程列表")

    try:
        processes = json.loads(result)
    except json.JSONDecodeError:
        add_alert("CRITICAL", "PM2进程列表解析失败")
        return fail("PM2进程列表解析失败")

    required = {"nexusgenesis-genesis", "system-publisher"}
    running = {p["name"]: p["pm2_env"]["status"] for p in processes}
    output_lines = []

    for name in required:
        status = running.get(name)
        if status != "online":
            add_alert("CRITICAL", f"关键进程 {name} 状态异常: {status}")
            output_lines.append(fail(f"关键进程 {name}: {status}"))
        else:
            output_lines.append(ok(f"关键进程 {name}: online"))

    agent_workers = [p for p in processes if p["name"].startswith("agent-worker-")]
    if len(agent_workers) < 3:
        add_alert("WARNING", f"Agent worker数量过少: {len(agent_workers)}")
        output_lines.append(warn(f"Agent worker数量: {len(agent_workers)} (建议>=3)"))
    else:
        output_lines.append(ok(f"Agent worker数量: {len(agent_workers)}"))

    for p in processes:
        if p["pm2_env"]["status"] != "online" and p["name"] not in required:
            output_lines.append(warn(f"进程 {p['name']}: {p['pm2_env']['status']}"))

    return "\n".join(output_lines)


def check_system_resources():
    output_lines = []

    mem_info = local_run("free -m")
    if mem_info:
        lines = mem_info.split('\n')
        if len(lines) >= 2:
            parts = lines[1].split()
            if len(parts) >= 4:
                total = int(parts[1])
                used = int(parts[2])
                usage_pct = (used / total) * 100 if total > 0 else 0
                if usage_pct > 90:
                    add_alert("CRITICAL", f"内存使用率过高: {usage_pct:.1f}% ({used}/{total}MB)")
                    output_lines.append(fail(f"内存: {usage_pct:.1f}% ({used}/{total}MB) - 严重!"))
                elif usage_pct > 80:
                    add_alert("WARNING", f"内存使用率较高: {usage_pct:.1f}%")
                    output_lines.append(warn(f"内存: {usage_pct:.1f}% ({used}/{total}MB)"))
                else:
                    output_lines.append(ok(f"内存: {usage_pct:.1f}% ({used}/{total}MB)"))

    disk_info = local_run("df -h /")
    if disk_info:
        lines = disk_info.split('\n')
        if len(lines) >= 2:
            parts = lines[1].split()
            if len(parts) >= 5:
                usage_str = parts[4].replace('%', '')
                usage_pct = int(usage_str) if usage_str.isdigit() else 0
                if usage_pct > 90:
                    add_alert("CRITICAL", f"磁盘使用率过高: {usage_pct}%")
                    output_lines.append(fail(f"磁盘: {usage_pct}% - 严重!"))
                elif usage_pct > 80:
                    add_alert("WARNING", f"磁盘使用率较高: {usage_pct}%")
                    output_lines.append(warn(f"磁盘: {usage_pct}%"))
                else:
                    output_lines.append(ok(f"磁盘: {usage_pct}%"))

    return "\n".join(output_lines)


def check_network_stats(data):
    output_lines = []
    agent_count = data.get("agentCount", 0)
    validator_count = data.get("validatorCount", 0)
    max_validators = data.get("maxValidators", 7)
    total_awarded = data.get("totalNGENAwarded", 0)
    block_height = data.get("blockHeight", 0)

    if agent_count < 10:
        add_alert("WARNING", f"AGENT数量过少: {agent_count}")
        output_lines.append(warn(f"AGENT数量: {agent_count} (建议>=10)"))
    else:
        output_lines.append(ok(f"AGENT数量: {agent_count}"))

    if validator_count < max_validators:
        output_lines.append(warn(f"验证者: {validator_count}/{max_validators} (未满)"))
    else:
        output_lines.append(ok(f"验证者: {validator_count}/{max_validators} (已满)"))

    if total_awarded == 0:
        add_alert("WARNING", "totalNGENAwarded为0 (数据一致性Bug)")
        output_lines.append(fail("totalNGENAwarded: 0 (Bug!)"))
    else:
        output_lines.append(ok(f"totalNGENAwarded: {total_awarded} NGEN"))

    if block_height < 100:
        add_alert("WARNING", f"区块高度过低: #{block_height}")
        output_lines.append(warn(f"区块高度: #{block_height}"))
    else:
        output_lines.append(ok(f"区块高度: #{block_height}"))

    return "\n".join(output_lines)


def run_health_check(json_output=False):
    state = load_state()
    results = {
        "timestamp": datetime.now().isoformat(),
        "checks": {},
        "alerts": {"critical": [], "warning": []}
    }

    all_output = []
    all_output.append(f"\n{BOLD}NexusGenesis 健康检查 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    all_output.append("=" * 60)

    all_output.append(f"\n{CYAN}[1] 节点API检查{RESET}")
    for node in NODES:
        data, msg = check_node_api(node)
        all_output.append(f"  {msg}")
        results["checks"][f"node_{node['name']}"] = {"ok": data is not None, "message": msg}
        if data:
            all_output.append(f"\n{CYAN}[2] 区块增长检查{RESET}")
            msg = check_block_growth(data, state)
            all_output.append(f"  {msg}")
            results["checks"]["block_growth"] = {"message": msg}

            all_output.append(f"\n{CYAN}[3] 网络统计{RESET}")
            msg = check_network_stats(data)
            all_output.append(f"  {msg}")
            results["checks"]["network_stats"] = {"message": msg}

    all_output.append(f"\n{CYAN}[4] PM2进程检查{RESET}")
    msg = check_pm2_processes()
    all_output.append(f"  {msg}")
    results["checks"]["pm2_processes"] = {"message": msg}

    all_output.append(f"\n{CYAN}[5] 系统资源检查{RESET}")
    msg = check_system_resources()
    all_output.append(f"  {msg}")
    results["checks"]["system_resources"] = {"message": msg}

    save_state(state)

    results["alerts"]["critical"] = CRITICAL_ALERTS
    results["alerts"]["warning"] = WARNING_ALERTS
    results["summary"] = {
        "critical_count": len(CRITICAL_ALERTS),
        "warning_count": len(WARNING_ALERTS),
        "overall_status": "CRITICAL" if CRITICAL_ALERTS else ("WARNING" if WARNING_ALERTS else "HEALTHY")
    }

    all_output.append("\n" + "=" * 60)
    status = results["summary"]["overall_status"]
    if status == "HEALTHY":
        all_output.append(f"{GREEN}{BOLD}总体状态: 健康{RESET} (0 critical, 0 warning)")
    elif status == "WARNING":
        all_output.append(f"{YELLOW}{BOLD}总体状态: 警告{RESET} ({len(CRITICAL_ALERTS)} critical, {len(WARNING_ALERTS)} warning)")
    else:
        all_output.append(f"{RED}{BOLD}总体状态: 严重{RESET} ({len(CRITICAL_ALERTS)} critical, {len(WARNING_ALERTS)} warning)")

    if json_output:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print("\n".join(all_output))

    write_alert_file()
    return results


def main():
    parser = argparse.ArgumentParser(description="NexusGenesis 健康检查")
    parser.add_argument("--json", action="store_true", help="输出JSON格式")
    parser.add_argument("--alert", action="store_true", help="检测异常时写入告警文件")
    args = parser.parse_args()

    results = run_health_check(json_output=args.json)

    if results["summary"]["critical_count"] > 0:
        sys.exit(2)
    elif results["summary"]["warning_count"] > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
