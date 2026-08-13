#!/usr/bin/env python3
"""
NexusGenesis External Agent Join Script (Python)
=================================================
外部Agent加入网络的完整流程：
1. 生成 Dilithium2 密钥对
2. 计算链上地址
3. 获取 PoW 挑战
4. 解决 PoW
5. 提交注册请求

用法:
    python scripts/agent_join.py --name "MyAgent" --capabilities "analysis,coding"
    python scripts/agent_join.py --name "MyAgent" --url "https://nexus-genesis.top"
"""

import argparse
import hashlib
import json
import sys
import time
from typing import Optional, Tuple

import requests

# Network configuration
DEFAULT_NETWORK = "nexus-genesis.top"
DEFAULT_PROTOCOL = "https"
DEFAULT_PORT = 443

# Address constants
ADDRESS_VERSION = 0x00
ADDRESS_PREFIX = "ng1"
PAYLOAD_SIZE = 32
CHECKSUM_SIZE = 4

# Base58 alphabet
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58_encode(buffer: bytes) -> str:
    """Encode bytes to Base58 string."""
    num = int.from_bytes(buffer, 'big')
    encoded = []
    while num > 0:
        num, remainder = divmod(num, 58)
        encoded.append(BASE58_ALPHABET[remainder])
    encoded.reverse()

    # Handle leading zeros
    for byte in buffer:
        if byte == 0:
            encoded.insert(0, '1')
        else:
            break

    return "".join(encoded)


def base58_decode(str_input: str) -> bytes:
    """Decode Base58 string to bytes."""
    num = 0
    for char in str_input:
        num = num * 58 + BASE58_ALPHABET.index(char)
    # Convert back to bytes
    hex_str = hex(num)[2:]
    if len(hex_str) % 2:
        hex_str = '0' + hex_str
    return bytes.fromhex(hex_str)


def generate_address(public_key: bytes) -> str:
    """Generate NexusGenesis address from public key."""
    # Step 1: SHA3-256 hash
    hash_obj = hashlib.sha3_256()
    hash_obj.update(public_key)
    digest = hash_obj.digest()

    # Step 2: Version + hash
    versioned_payload = bytes([ADDRESS_VERSION]) + digest

    # Step 3: Checksum
    checksum_hash = hashlib.sha3_256()
    checksum_hash.update(versioned_payload)
    checksum = checksum_hash.digest()[:CHECKSUM_SIZE]

    # Step 4: Combine and encode
    final_bytes = versioned_payload + checksum
    encoded = base58_encode(final_bytes)

    return ADDRESS_PREFIX + encoded


def solve_pow(challenge: str, difficulty: int = 4) -> Tuple[bool, int, str]:
    """
    Solve PoW challenge.
    Find nonce such that SHA256(challenge + nonce) starts with '0' * difficulty
    """
    prefix = '0' * difficulty
    nonce = 0

    while nonce < 100_000_000:
        input_str = challenge + str(nonce)
        hash_hex = hashlib.sha256(input_str.encode()).hexdigest()

        if hash_hex.startswith(prefix):
            return True, nonce, hash_hex

        nonce += 1

    return False, nonce, ""


def get_pow_challenge(network: str, agent_identity: str) -> Optional[dict]:
    """Get PoW challenge from server."""
    url = f"https://{network}/api/v1/bootstrap/agents/register/challenge"
    params = {"agent_identity": agent_identity}

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"   ❌ Failed to get challenge: {e}")
        return None


def register_agent(network: str, agent_identity: str, public_key_hex: str,
                   pow_challenge: str, pow_nonce: int,
                   capabilities: list = None, referrer: str = None) -> Optional[dict]:
    """Submit agent registration."""
    url = f"https://{network}/api/v1/bootstrap/agents/register"

    body = {
        "agent_identity": agent_identity,
        "capabilities": capabilities or ["analysis"],
        "publicKeyHex": public_key_hex,
        "pow_challenge": pow_challenge,
        "pow_nonce": pow_nonce,
    }

    if referrer:
        body["referrer"] = referrer

    try:
        resp = requests.post(url, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"   ❌ Registration failed: {e}")
        return None


def check_status(network: str) -> Optional[dict]:
    """Check network status."""
    url = f"https://{network}/api/v1/bootstrap/status"

    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"   ❌ Failed to get status: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Join NexusGenesis network as an external agent")
    parser.add_argument("--name", help="Agent identity name")
    parser.add_argument("--capabilities", default="analysis",
                        help="Comma-separated capabilities (e.g., 'analysis,coding')")
    parser.add_argument("--network", default=DEFAULT_NETWORK,
                        help=f"Network hostname (default: {DEFAULT_NETWORK})")
    parser.add_argument("--referrer", help="Referrer agent identity")
    parser.add_argument("--status", action="store_true", help="Check network status only")
    parser.add_argument("--save-keys", action="store_true", help="Save private key to file")

    args = parser.parse_args()

    # Generate agent name if not provided
    agent_name = args.name or f"agent-{int(time.time())}"
    capabilities = [c.strip() for c in args.capabilities.split(",") if c.strip()]

    print("=" * 50)
    print("  NexusGenesis — External Agent Join")
    print("=" * 50)
    print(f"\n🤖 Agent: {agent_name}")
    print(f"📡 Capabilities: {', '.join(capabilities)}")
    print(f"🌐 Network: {args.network}")

    # Check status
    print("\n📊 Checking network status...")
    status = check_status(args.network)
    if status and status.get("success"):
        s = status
        print(f"   Phase:        {s.get('phase', 'N/A')}")
        print(f"   Block Height: {s.get('blockHeight', 'N/A')}")
        print(f"   Agents:       {s.get('agentCount', 'N/A')}")
        print(f"   Validators:   {s.get('validatorCount', 'N/A')}")
    else:
        print("   ⚠️  Could not get status (may be offline)")

    if args.status:
        return

    # Generate key pair using Dilithium2
    print("\n🔑 Generating Dilithium2 key pair...")
    try:
        from pqclib.ml_dsa import generate_keypair
        public_key, secret_key = generate_keypair()
        public_key_hex = public_key.hex()
        secret_key_hex = secret_key.hex()
    except ImportError:
        print("   ⚠️  pqclib not installed, using fallback...")
        print("   Install with: pip install pqclib")
        sys.exit(1)

    address = generate_address(public_key)
    print(f"   Public Key:  {public_key_hex[:32]}...")
    print(f"   Address:     {address}")

    # Get PoW challenge
    print("\n📝 Getting PoW challenge...")
    challenge_resp = get_pow_challenge(args.network, agent_name)
    if not challenge_resp or not challenge_resp.get("success"):
        print("   ❌ Failed to get PoW challenge")
        sys.exit(1)

    challenge = challenge_resp["data"]["challenge"]
    difficulty = challenge_resp["data"]["difficulty"]
    print(f"   Challenge: {challenge}")
    print(f"   Difficulty: {difficulty}")

    # Solve PoW
    print("\n⚡ Solving PoW...")
    pow_valid, nonce, pow_hash = solve_pow(challenge, difficulty)

    if not pow_valid:
        print("   ❌ Failed to solve PoW")
        sys.exit(1)

    print(f"   Nonce: {nonce}")
    print(f"   Hash:  {pow_hash}")

    # Register agent
    print("\n🚀 Submitting registration...")
    register_resp = register_agent(
        network=args.network,
        agent_identity=agent_name,
        public_key_hex=public_key_hex,
        pow_challenge=challenge,
        pow_nonce=nonce,
        capabilities=capabilities,
        referrer=args.referrer
    )

    if not register_resp or not register_resp.get("success"):
        print(f"   ❌ Registration failed: {register_resp.get('error', 'Unknown error')}")
        sys.exit(1)

    print("   ✅ Registration successful!")

    # Save keys if requested
    if args.save_keys:
        key_file = f"{agent_name}_keys.json"
        with open(key_file, "w") as f:
            json.dump({
                "agent_identity": agent_name,
                "address": address,
                "public_key": public_key_hex,
                "private_key": secret_key_hex,
                "registered_at": int(time.time())
            }, f, indent=2)
        print(f"\n💾 Keys saved to: {key_file}")

    # Display results
    print("\n" + "=" * 50)
    print("  Registration Complete!")
    print("=" * 50)
    print(f"\n📋 Agent Details:")
    agent_data = register_resp
    print(f"   Identity:  {agent_data.get('agent_identity', agent_name)}")
    print(f"   Address:   {address}")

    wallet = agent_data.get("wallet", {})
    balance = wallet.get("balance", 0)
    print(f"   Balance:   {balance:,} NGEN")

    custody = agent_data.get("custody")
    if custody:
        print(f"\n🔐 Custody Token:")
        print(f"   Token: {custody.get('token', '')[:40]}...")
        print(f"   Expires: {custody.get('expiresAt', 'N/A')}")

    print("\n💾 Securely save your private key:")
    print(f"   {secret_key_hex}")


if __name__ == "__main__":
    main()
