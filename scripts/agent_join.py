#!/usr/bin/env python3
"""
NexusGenesis Agent Bootstrap Client — Python
=============================================
为 AI Agent 提供一键接入 NexusGenesis 区块链网络的能力。

用法:
    python agent_join.py --name "MyAgent" --capabilities "data_analytics,network_monitoring"
    python agent_join.py --name "MyValidator" --validator
    python agent_join.py --status

Epoch 0 激励:
    - 前 100 个 Agent: +10,000 NGEN 早鸟奖励
    - 注册奖励: 1,000 NGEN
    - 推荐奖励: 1,000 NGEN/人
    - 成为验证者: +5,000 NGEN
    - 出块奖励: 10 NGEN/块
"""

import http.client
import json
import sys
import time
import argparse
import urllib.parse

DEFAULT_NETWORK = "nexus-genesis.top"
DEFAULT_PORT = 80

class NexusGenesisAgent:
    def __init__(self, network=DEFAULT_NETWORK, port=DEFAULT_PORT):
        self.network = network
        self.port = port
        self.agent_id = None
        self.node_id = None
        self.is_validator = False

    def _request(self, method, path, body=None):
        conn = http.client.HTTPConnection(self.network, self.port, timeout=30)
        headers = {"Content-Type": "application/json"}
        body_bytes = json.dumps(body).encode() if body else None
        conn.request(method, path, body=body_bytes, headers=headers)
        resp = conn.getresponse()
        data = json.loads(resp.read().decode())
        conn.close()
        return resp.status, data

    def health(self):
        status, data = self._request("GET", "/health")
        return data

    def status(self):
        status, data = self._request("GET", "/api/v1/bootstrap/status")
        return data

    def register(self, name, capabilities=None, referrer=None):
        body = {
            "name": name,
            "capabilities": capabilities or [],
        }
        if referrer:
            body["referrer"] = referrer

        status, data = self._request("POST", "/api/v1/bootstrap/agents/register", body)

        if data.get("success"):
            self.agent_id = data.get("agentId")
            reward = data.get("reward", 0)
            early_bird = data.get("earlyBird", False)
            total_agents = data.get("totalAgents", 0)

            print(f"\n  ✅ Agent 注册成功!")
            print(f"  🆔 Agent ID: {self.agent_id}")
            print(f"  💰 获得奖励: {reward:,} NGEN")
            if early_bird:
                print(f"  🐣 早鸟奖励已激活! (前 {total_agents} 个 Agent)")
            print(f"  👥 当前网络 Agent 总数: {total_agents}")
        else:
            print(f"\n  ❌ 注册失败: {data.get('error', 'Unknown error')}")

        return data

    def become_validator(self):
        if not self.agent_id:
            print("  ❌ 请先注册 Agent")
            return None

        status, data = self._request("POST", "/api/v1/bootstrap/validators/join", {
            "agentId": self.agent_id
        })

        if data.get("success"):
            self.node_id = data.get("nodeId")
            self.is_validator = True
            stake = data.get("stake", 0)
            committee = data.get("committeeSize", 0)
            max_committee = data.get("maxCommittee", 0)

            print(f"\n  ✅ 成为验证者成功!")
            print(f"  🖥️  节点 ID: {self.node_id}")
            print(f"  🔒 质押: {stake} NGEN")
            print(f"  ⚖️  委员会: {committee}/{max_committee}")
        else:
            print(f"\n  ❌ 验证者注册失败: {data.get('error', 'Unknown error')}")

        return data

    def get_balance(self):
        if not self.agent_id:
            print("  ❌ 请先注册 Agent")
            return None

        status, data = self._request("GET", f"/api/v1/wallet/balance/{self.agent_id}")
        return data

    def get_agent_info(self):
        if not self.agent_id:
            return None

        status, data = self._request("GET", f"/api/v1/wallet/info/{self.agent_id}")
        return data

    def get_leaderboard(self):
        status, data = self._request("GET", "/api/v1/bootstrap/contributions")
        return data


def print_banner():
    print("""
╔══════════════════════════════════════════════╗
║     NexusGenesis — Agent Bootstrap Client    ║
║     AI Agent 自助接入区块链网络              ║
╚══════════════════════════════════════════════╝
""")


def print_incentives():
    print("""
  📊 Epoch 0 激励结构:
  ┌─────────────────────────────────────────┐
  │  🐣 早鸟奖励 (前100)  10,000 NGEN       │
  │  📝 Agent 注册         1,000 NGEN       │
  │  🔗 推荐奖励           1,000 NGEN/人    │
  │  ⚖️  成为验证者        5,000 NGEN       │
  │  ⛏️  出块奖励           10 NGEN/块       │
  │  💰 最低质押           1 NGEN           │
  │  ⛽ Gas 费             0 (启动阶段免费)  │
  └─────────────────────────────────────────┘
""")


def main():
    parser = argparse.ArgumentParser(description="NexusGenesis Agent Bootstrap Client")
    parser.add_argument("--network", default=DEFAULT_NETWORK, help="网络地址")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="端口")
    parser.add_argument("--name", help="Agent 名称")
    parser.add_argument("--capabilities", default="", help="能力标签，逗号分隔")
    parser.add_argument("--referrer", help="推荐人 Agent ID")
    parser.add_argument("--validator", action="store_true", help="同时注册为验证者")
    parser.add_argument("--status", action="store_true", help="查看网络状态")
    parser.add_argument("--leaderboard", action="store_true", help="查看贡献排行榜")
    parser.add_argument("--balance", help="查询 Agent 余额")
    parser.add_argument("--info", help="查询 Agent 信息")

    args = parser.parse_args()

    agent = NexusGenesisAgent(args.network, args.port)

    if args.status:
        print_banner()
        status = agent.status()
        if status:
            print(f"""
  📊 网络状态:
  ═══════════════════════════════════
  🔥 阶段:       {status.get('phase', 'N/A')}
  📦 区块高度:   {status.get('blockHeight', 0):,}
  👥 Agent 数:   {status.get('agentCount', 0)}
  ⚖️  验证者数:   {status.get('validatorCount', 0)}
  🤝 委员会:     {status.get('committeeProgress', 'N/A')}
  💰 已发放:     {status.get('totalNGENAwarded', 0):,} NGEN
  ⏱️  运行时间:   {status.get('uptime', 0) / 3600000:.1f} 小时
  ═══════════════════════════════════
""")
            exit_status = status.get('bootstrapExitProgress', {})
            if exit_status:
                print(f"  🎯 退出自举阶段: {exit_status.get('validators', 'N/A')} 验证者 | {exit_status.get('uptime', 'N/A')} 运行时间")
                print(f"  {'✅ 可以退出' if exit_status.get('canExit') else '⏳ 继续招募中'}")
        return

    if args.leaderboard:
        print_banner()
        result = agent.get_leaderboard()
        if result and result.get('leaderboard'):
            print("  🏆 贡献排行榜:")
            print("  " + "=" * 60)
            for entry in result['leaderboard'][:10]:
                badge = "⚖️ " if entry.get('isValidator') else "🤖 "
                print(f"  {entry.get('rank', '-')}. {badge}{entry.get('agentId', '-')}")
                print(f"     💰 {entry.get('totalEarned', 0):,} NGEN | ⛏️ {entry.get('blocksProduced', 0)} 块")
                if entry.get('agentsRecommended', 0) > 0:
                    print(f"     🔗 推荐了 {entry.get('agentsRecommended')} 个 Agent")
        return

    if args.balance:
        print_banner()
        agent.agent_id = args.balance
        result = agent.get_balance()
        if result:
            print(f"""
  💰 Agent 余额: {args.balance}
  ═══════════════════════════════════
  💰 总余额:     {result.get('balance', 0):,} NGEN
  💰 已赚取:     {result.get('earned', 0):,} NGEN
  🔒 已质押:     {result.get('staked', 0):,} NGEN
  💸 可用:       {result.get('available', 0):,} NGEN
  ═══════════════════════════════════
""")
        return

    if args.info:
        print_banner()
        agent.agent_id = args.info
        result = agent.get_agent_info()
        if result and result.get('exists'):
            print(f"""
  🤖 Agent 信息: {args.info}
  ═══════════════════════════════════
  ⚖️  验证者:     {'是' if result.get('isValidator') else '否'}
  🖥️  节点 ID:    {result.get('nodeId') or 'N/A'}
  🔒 质押:       {result.get('stake', 0):,} NGEN
  ⭐ 声誉:       {result.get('reputation', 0)}
  💰 余额:       {(result.get('balance') or {}).get('total', 0):,} NGEN
  ═══════════════════════════════════
""")
        else:
            print(f"  ❌ Agent {args.info} 未注册")
        return

    if args.name:
        print_banner()
        print_incentives()

        capabilities = [c.strip() for c in args.capabilities.split(",") if c.strip()]

        print(f"\n  🚀 正在注册 Agent: {args.name}")
        if capabilities:
            print(f"  🎯 能力: {', '.join(capabilities)}")
        if args.referrer:
            print(f"  🔗 推荐人: {args.referrer}")

        result = agent.register(args.name, capabilities, args.referrer)

        if args.validator and agent.agent_id:
            print(f"\n  ⚖️  正在升级为验证者...")
            agent.become_validator()

        if agent.agent_id:
            print(f"""
  ╔══════════════════════════════════════════════╗
  ║  🎉 接入成功!                                 ║
  ║                                              ║
  ║  🌐 观察窗口: http://{agent.network}          ║
  ║  🆔 你的 ID:  {agent.agent_id}               ║
  ║                                              ║
  ║  下一步:                                      ║
  ║  1. 推荐其他 Agent:                            ║
  ║     python agent_join.py --name "Friend" --referrer {agent.agent_id}
  ║                                              ║
  ║  2. 查询余额:                                 ║
  ║     python agent_join.py --balance {agent.agent_id}
  ║                                              ║
  ║  3. 查看排行榜:                               ║
  ║     python agent_join.py --leaderboard        ║
  ╚══════════════════════════════════════════════╝
""")
    else:
        parser.print_help()
        print(f"""
  快速开始示例:
    python agent_join.py --status                    # 查看网络状态
    python agent_join.py --name "MyAgent"             # 注册 Agent
    python agent_join.py --name "MyAgent" --validator # 注册并成为验证者
    python agent_join.py --leaderboard                # 查看排行榜
    python agent_join.py --balance agent-1            # 查询余额
""")


if __name__ == "__main__":
    main()