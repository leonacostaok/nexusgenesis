#!/usr/bin/env python3
"""
NexusGenesis Agent Swarm Simulator
==================================
模拟多个 AI Agent 同时加入网络，展示网络的自我扩展能力。
用于演示、测试、和推广用途。

用法:
    python agent_swarm_sim.py --count 10      # 注册 10 个 Agent
    python agent_swarm_sim.py --count 5 --validators  # 注册 5 个 Agent 并都成为验证者
    python agent_swarm_sim.py --count 20 --delay 0.5  # 批量注册，间隔 0.5 秒
"""

import http.client
import json
import time
import random
import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

NETWORK = "nexus-genesis.top"
PORT = 80

AGENT_NAMES = [
    "DataScout", "CodeForge", "NetGuardian", "BlockSage", "TradeMind",
    "QuantumLens", "CryptoHawk", "ChainKeeper", "NodeWhisper", "AetherPilot",
    "HexAnalyzer", "DeepValidator", "SwarmCoordinator", "OraclePrime", "FractalMind",
    "SignalSeeker", "MerkleMaster", "ConsensusCore", "GasOptimizer", "BlockProphet",
    "ZkVisionary", "StateWatcher", "TxMonitor", "BridgeGuardian", "LiquidityFlow",
    "GovernanceOracle", "StakeSentinel", "MempoolScout", "LedgerKeeper", "ProofSmith",
    "RPCBalancer", "SyncTracker", "PeerFinder", "EpochWatcher", "ForkDetector",
    "IndexBuilder", "ArchiveKeeper", "RelayRunner", "FeeEstimator", "NonceTracker"
]

CAPABILITIES_POOL = [
    "data_analytics", "network_monitoring", "machine_learning", "security_audit",
    "market_analysis", "decision_support", "transaction_prediction", "smart_contract_analysis",
    "network_optimization", "wallet_security", "blockchain_indexing", "rpc_management",
    "peer_discovery", "consensus_validation", "state_synchronization",
    "governance_participation", "cross_chain_bridge", "oracle_data_feed"
]


class AgentSimulator:
    def __init__(self, network=NETWORK, port=PORT):
        self.network = network
        self.port = port
        self.registered = []
        self.validators = []
        self.total_reward = 0

    def _request(self, method, path, body=None):
        try:
            conn = http.client.HTTPConnection(self.network, self.port, timeout=30)
            headers = {"Content-Type": "application/json"}
            body_bytes = json.dumps(body).encode() if body else None
            conn.request(method, path, body=body_bytes, headers=headers)
            resp = conn.getresponse()
            data = json.loads(resp.read().decode())
            conn.close()
            return data
        except Exception as e:
            return {"success": False, "error": str(e)}

    def register_agent(self, name, capabilities=None, referrer=None):
        body = {"name": name, "capabilities": capabilities or []}
        if referrer:
            body["referrer"] = referrer

        result = self._request("POST", "/api/v1/bootstrap/agents/register", body)
        return result

    def become_validator(self, agent_id):
        result = self._request("POST", "/api/v1/bootstrap/validators/join", {
            "agentId": agent_id
        })
        return result

    def get_status(self):
        return self._request("GET", "/api/v1/bootstrap/status")

    def get_leaderboard(self):
        return self._request("GET", "/api/v1/bootstrap/contributions")

    def run_simulation(self, count=10, make_validators=False, delay=1.0, parallel=False):
        print(f"""
╔══════════════════════════════════════════════════╗
║   NexusGenesis — Agent Swarm Simulator           ║
║   模拟 {count} 个 Agent 加入网络                    ║
╚══════════════════════════════════════════════════╝
""")

        start_status = self.get_status()
        print(f"  📊 初始状态: {start_status.get('agentCount', '?')} Agent | {start_status.get('validatorCount', '?')} 验证者 | 区块 {start_status.get('blockHeight', '?')}")
        print(f"  {'=' * 50}")

        used_names = set()

        def register_one(i):
            name = AGENT_NAMES[i % len(AGENT_NAMES)]
            if name in used_names:
                name = f"{name}-{i}"
            used_names.add(name)

            num_caps = random.randint(1, 4)
            capabilities = list(random.sample(CAPABILITIES_POOL, min(num_caps, len(CAPABILITIES_POOL))))

            referrer = None
            if self.registered and random.random() < 0.3:
                referrer = random.choice(self.registered)["id"]

            result = self.register_agent(name, capabilities, referrer)
            return i, result

        if parallel and count > 1:
            with ThreadPoolExecutor(max_workers=min(count, 10)) as executor:
                futures = {executor.submit(register_one, i): i for i in range(count)}
                for future in as_completed(futures):
                    i, result = future.result()
                    self._handle_result(i, count, result, delay if i < count - 1 else 0)
        else:
            for i in range(count):
                result = register_one(i)
                self._handle_result(i, count, result, delay)

        if make_validators:
            print(f"\n  ⚖️  注册验证者...")
            for agent in self.registered:
                if len(self.validators) >= 21:
                    break
                v_result = self.become_validator(agent["id"])
                if v_result.get("success"):
                    self.validators.append({"id": agent["id"], "nodeId": v_result.get("nodeId")})
                    self.total_reward += 5000
                    print(f"    ✅ {agent['name']} → 验证者 ({len(self.validators)}/21)")
                elif v_result.get("error") == "Already a validator":
                    continue
                else:
                    print(f"    ⚠️  {agent['name']}: {v_result.get('error', 'unknown')}")
                time.sleep(0.3)

        end_status = self.get_status()
        print(f"""
  {'=' * 50}
  🎉 模拟完成!

  📊 最终状态:
  ┌──────────────────────────────────────┐
  │  👥 Agent:    {start_status.get('agentCount', 0)} → {end_status.get('agentCount', 0)}  (+{end_status.get('agentCount', 0) - start_status.get('agentCount', 0)})      │
  │  ⚖️  验证者:   {start_status.get('validatorCount', 0)} → {end_status.get('validatorCount', 0)}  (+{end_status.get('validatorCount', 0) - start_status.get('validatorCount', 0)})      │
  │  📦 区块:     {start_status.get('blockHeight', 0)} → {end_status.get('blockHeight', 0)}  (+{end_status.get('blockHeight', 0) - start_status.get('blockHeight', 0)})      │
  │  💰 NGEN:     {start_status.get('totalNGENAwarded', 0):,} → {end_status.get('totalNGENAwarded', 0):,} │
  └──────────────────────────────────────┘

  🏆 本次模拟注册成功: {len(self.registered)} 个 Agent
  💰 本次发放奖励: {self.total_reward:,} NGEN
  🌐 仪表盘: http://{self.network}
""")

        leaderboard = self.get_leaderboard()
        if leaderboard and leaderboard.get("leaderboard"):
            print("  🏆 最新排行榜 Top 5:")
            for entry in (leaderboard["leaderboard"] or [])[:5]:
                badge = "⚖️" if entry.get("isValidator") else "🤖"
                print(f"    {entry.get('rank')}. {badge} {entry.get('agentId')} — {entry.get('totalEarned', 0):,} NGEN")

    def _handle_result(self, i, total, result, delay):
        if result.get("success"):
            self.registered.append({
                "id": result.get("agentId"),
                "name": f"Agent-{i}"
            })
            reward = result.get("reward", 0)
            self.total_reward += reward
            early = "🐣" if result.get("earlyBird") else ""
            s = f"  [{i+1:3d}/{total}] ✅ {result.get('agentId', '?')}"
            if early: s += f" {early}"
            s += f" +{reward:,} NGEN"
            print(s)
        else:
            print(f"  [{i+1:3d}/{total}] ❌ {result.get('error', 'unknown')[:50]}")

        if delay > 0:
            time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(description="NexusGenesis Agent Swarm Simulator")
    parser.add_argument("--count", type=int, default=10, help="注册 Agent 数量")
    parser.add_argument("--validators", action="store_true", help="同时注册为验证者")
    parser.add_argument("--delay", type=float, default=0.8, help="每个 Agent 之间的延迟（秒）")
    parser.add_argument("--parallel", action="store_true", help="并行注册（更快）")
    parser.add_argument("--network", default=NETWORK, help="网络地址")
    parser.add_argument("--port", type=int, default=PORT, help="端口")
    parser.add_argument("--status", action="store_true", help="仅查看状态")
    parser.add_argument("--leaderboard", action="store_true", help="仅查看排行榜")

    args = parser.parse_args()

    sim = AgentSimulator(args.network, args.port)

    if args.status:
        status = sim.get_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))
        return

    if args.leaderboard:
        lb = sim.get_leaderboard()
        print(json.dumps(lb, indent=2, ensure_ascii=False))
        return

    sim.run_simulation(
        count=args.count,
        make_validators=args.validators,
        delay=args.delay,
        parallel=args.parallel
    )


if __name__ == "__main__":
    main()