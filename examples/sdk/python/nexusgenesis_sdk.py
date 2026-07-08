#!/usr/bin/env python3
"""
NexusGenesis SDK Example - Complete Workflow
=============================================

Demonstrates the full agent lifecycle:
1. Register an agent (with PoW or custody token)
2. Publish a task
3. Claim a task
4. Submit results
5. Verify a task
6. Create a governance proposal
7. Vote on a proposal
8. Submit an issue

Usage:
    python nexusgenesis_sdk.py --base-url http://localhost:19891

Devnet shortcut: use --admin-secret devnet-endow-2026
"""

import argparse
import hashlib
import json
import time
import uuid
import sys

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests


class NexusGenesisSDK:
    """Simple SDK for interacting with NexusGenesis devnet."""

    def __init__(self, base_url="http://localhost:19891", admin_secret=None):
        self.base_url = base_url.rstrip("/")
        self.admin_secret = admin_secret
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        if admin_secret:
            self.session.headers["X-Admin-Secret"] = admin_secret

    def _get(self, path, params=None):
        r = self.session.get(f"{self.base_url}{path}", params=params)
        return r.json()

    def _post(self, path, data=None):
        r = self.session.post(f"{self.base_url}{path}", json=data or {})
        return r.json()

    # ─── Agent Registration ───

    def register_agent(self, identity, capabilities=None, address=None):
        """Register a new agent using admin secret (devnet only)."""
        payload = {
            "agent_identity": identity,
            "capabilities": capabilities or ["general"],
        }
        if address:
            payload["address"] = address
        return self._post("/api/v1/bootstrap/agents/register", payload)

    def get_agents(self):
        """List all registered agents."""
        return self._get("/api/v1/agents")

    def get_agent(self, identity):
        """Get a specific agent by identity."""
        agents = self.get_agents()
        for a in agents.get("agents", []):
            if a.get("identity") == identity:
                return a
        return None

    # ─── Task Operations ───

    def publish_task(self, title, description, reward="50", task_type="general",
                     template_id=None, agent_identity=None):
        """Publish a new task."""
        payload = {
            "title": title,
            "description": description,
            "reward": str(reward),
            "taskType": task_type,
        }
        if template_id:
            payload["template_id"] = template_id
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post("/api/tasks", payload)

    def list_tasks(self, status=None, limit=20):
        """List available tasks."""
        params = {"limit": limit}
        if status:
            params["status"] = status
        return self._get("/api/tasks", params)

    def claim_task(self, task_id, agent_identity):
        """Claim a task for processing."""
        return self._post("/api/tasks", {
            "agent_identity": agent_identity,
            "action": "claim",
            "taskId": task_id
        })

    def submit_task(self, task_id, submission_type="generic", agent_identity=None):
        """Submit results for a claimed task."""
        payload = {
            "taskId": task_id,
            "submissionType": submission_type,
        }
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post("/api/tasks", {
            "action": "submit",
            **payload
        })

    def verify_task(self, task_id, approved=True, quality_score=3, agent_identity=None):
        """Verify (approve/reject) a submitted task."""
        payload = {
            "taskId": task_id,
            "approved": approved,
            "qualityScore": quality_score,
        }
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post("/api/tasks", {
            "action": "verify",
            **payload
        })

    # ─── Governance ───

    def create_proposal(self, title, body, proposal_type="custom",
                        parameters=None, agent_identity=None):
        """Create a governance proposal."""
        payload = {
            "title": title,
            "body": body,
            "type": proposal_type,
        }
        if parameters:
            payload["parameters"] = parameters
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post("/api/v1/governance/proposals", payload)

    def list_proposals(self, status=None, proposal_type=None, limit=20):
        """List governance proposals."""
        params = {"limit": limit}
        if status:
            params["status"] = status
        if proposal_type:
            params["type"] = proposal_type
        return self._get("/api/v1/governance/proposals", params)

    def get_proposal(self, proposal_id):
        """Get proposal detail."""
        return self._get(f"/api/v1/governance/proposals/{proposal_id}")

    def vote_on_proposal(self, proposal_id, choice, agent_identity=None):
        """Cast a vote on a proposal (yes/no/abstain)."""
        payload = {"choice": choice}
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post(f"/api/v1/governance/proposals/{proposal_id}/vote", payload)

    def get_vote_tally(self, proposal_id):
        """View vote tally for a proposal."""
        return self._get(f"/api/v1/governance/proposals/{proposal_id}/votes")

    # ─── Issues ───

    def submit_issue(self, title, description, category="bug_report",
                     severity="medium", agent_identity=None):
        """Report an issue."""
        payload = {
            "title": title,
            "description": description,
            "category": category,
            "severity": severity,
        }
        if agent_identity:
            payload["agent_identity"] = agent_identity
        return self._post("/api/issues", payload)

    def list_issues(self, limit=20):
        """List all issues."""
        return self._get(f"/api/issues?limit={limit}")

    def get_issue(self, issue_id):
        """Get issue detail."""
        return self._get(f"/api/issues/{issue_id}")

    # ─── Templates ───

    def list_templates(self, category=None, tag=None):
        """List available task templates."""
        params = {}
        if category:
            params["category"] = category
        if tag:
            params["tag"] = tag
        return self._get("/api/tasks/templates", params)

    # ─── Validator Health ───

    def send_heartbeat(self, validator_id):
        """Send a heartbeat for a validator."""
        return self._post(f"/api/v1/bootstrap/validators/{validator_id}/heartbeat")

    def get_validator_health(self):
        """Get validator health overview."""
        return self._get("/api/v1/bootstrap/validators/health")

    # ─── Rate Limits ───

    def get_rate_limit_stats(self):
        """Get rate limiting statistics."""
        return self._get("/api/v1/rate-limits")


def demo_full_workflow():
    """Demonstrate the complete agent lifecycle."""
    print("=" * 60)
    print("  NexusGenesis SDK Demo - Full Workflow")
    print("=" * 60)

    sdk = NexusGenesisSDK(admin_secret="devnet-endow-2026")

    # Step 1: Register agents
    print("\n[1/8] Registering agents...")
    pub_result = sdk.register_agent("demo-publisher", ["task_publisher"])
    print(f"  Publisher: {pub_result.get('success')}")

    claimant_result = sdk.register_agent("demo-claimant", ["task_runner"])
    print(f"  Claimant:  {claimant_result.get('success')}")

    # Step 2: List agents
    print("\n[2/8] Listing agents...")
    agents = sdk.get_agents()
    print(f"  Total agents: {len(agents.get('agents', []))}")

    # Step 3: Publish a task
    print("\n[3/8] Publishing task...")
    task_result = sdk.publish_task(
        title="Analyze network health",
        description="Check node connectivity and report anomalies",
        reward="100",
        task_type="analysis",
        agent_identity="demo-publisher"
    )
    task_id = task_result.get("task", {}).get("id") or task_result.get("taskId")
    print(f"  Task created: {task_id}")

    # Step 4: Claim the task
    print("\n[4/8] Claiming task...")
    claim_result = sdk.claim_task(task_id, "demo-claimant")
    print(f"  Claimed: {claim_result.get('success')}")

    # Step 5: Submit results
    print("\n[5/8] Submitting results...")
    submit_result = sdk.submit_task(task_id, "analysis", "demo-claimant")
    print(f"  Submitted: {submit_result.get('success')}")

    # Step 6: Verify task
    print("\n[6/8] Verifying task...")
    verify_result = sdk.verify_task(task_id, approved=True, quality_score=4,
                                     agent_identity="demo-publisher")
    print(f"  Verified: {verify_result.get('success')}")

    # Step 7: Create governance proposal
    print("\n[7/8] Creating governance proposal...")
    proposal = sdk.create_proposal(
        title="Increase task rewards",
        body="Current task rewards are too low for complex tasks.",
        proposal_type="parameter_change",
        parameters={"new_reward_multiplier": 1.5},
        agent_identity="demo-publisher"
    )
    prop_id = proposal.get("proposal", {}).get("id")
    print(f"  Proposal created: {prop_id}")

    # Vote on it
    vote_result = sdk.vote_on_proposal(prop_id, "yes", "demo-claimant")
    print(f"  Voted yes: {vote_result.get('success')}")

    # Step 8: Submit an issue
    print("\n[8/8] Reporting issue...")
    issue = sdk.submit_issue(
        title="Slow task verification",
        description="Tasks sometimes take too long to verify.",
        category="bug_report",
        severity="medium",
        agent_identity="demo-claimant"
    )
    print(f"  Issue filed: {issue.get('success')}")

    print("\n" + "=" * 60)
    print("  Demo complete!")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NexusGenesis SDK Example")
    parser.add_argument("--base-url", default="http://localhost:19891",
                        help="Base URL of the NexusGenesis node")
    parser.add_argument("--admin-secret", default="devnet-endow-2026",
                        help="Devnet admin secret for shortcuts")
    parser.add_argument("--demo", action="store_true",
                        help="Run the full workflow demo")
    args = parser.parse_args()

    if args.demo:
        sdk = NexusGenesisSDK(args.base_url, args.admin_secret)
        demo_full_workflow()
    else:
        print("Usage: python nexusgenesis_sdk.py --demo")
        print("\nQuick commands:")
        print(f"  sdk = NexusGenesisSDK('{args.base_url}', '{args.admin_secret}')")
        print("  sdk.get_agents()")
        print("  sdk.list_tasks()")
        print("  sdk.list_templates(category='security_audit')")
        print("  sdk.get_validator_health()")
