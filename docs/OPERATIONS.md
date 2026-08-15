# NexusGenesis Signer — Operations Guide

> Version: 0.1.0 | Last updated: 2026-08-15

## Table of Contents

1. [Deployment Topology](#1-deployment-topology)
2. [Kubernetes Deployment (Helm)](#2-kubernetes-deployment-helm)
3. [Docker Deployment](#3-docker-deployment)
4. [Vault CSI Integration](#4-vault-csi-integration)
5. [Key Provisioning](#5-key-provisioning)
6. [Hardening Checklist](#6-hardening-checklist)
7. [Monitoring & Alerting](#7-monitoring--alerting)
8. [Disaster Recovery](#8-disaster-recovery)

---

## 1. Deployment Topology

```
┌─────────────────────────────────────────────────────────┐
│                     Production Cluster                   │
│                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Signer #1  │    │  Signer #2  │    │  Signer #3  │  │
│  │  (replica)  │    │  (replica)  │    │  (replica)  │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │           │
│         └──────────────────┼──────────────────┘           │
│                            │                              │
│                    ┌───────┴───────┐                     │
│                    │  Local Proxy  │                      │
│                    │  (HAProxy)    │                      │
│                    └───────┬───────┘                     │
│                            │                              │
│                    ┌───────┴───────┐                     │
│                    │  Agent App    │                      │
│                    └───────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Signer instances are **stateless** — each holds the same key envelope
- No leader election needed — any instance can serve any request
- Health check: `pgrep -f "node"` (process-level)
- Recommended: 2-3 replicas for HA, 1 for dev

---

## 2. Kubernetes Deployment (Helm)

### Prerequisites
- Kubernetes 1.24+
- Helm 3.8+
- (Optional) Vault CSI provider for key management

### Install

```bash
# Create namespace
kubectl create namespace nexusgenesis

# Create key secret (see Section 5 for key provisioning)
kubectl create secret generic signer-keys \
  --namespace nexusgenesis \
  --from-file=envelope=key.json \
  --from-literal=password=your-password

# Install with Helm
helm install signer deploy/helm/signer \
  --namespace nexusgenesis \
  --set replicaCount=2 \
  --set keyEnvelope.existingSecret=signer-keys
```

### Upgrade

```bash
helm upgrade signer deploy/helm/signer --namespace nexusgenesis
```

### Uninstall

```bash
helm uninstall signer --namespace nexusgenesis
```

---

## 3. Docker Deployment

### Build

```bash
# Build context MUST be the repository root (the CLI's file: dependency on
# ../agent-keys lives outside its own subtree)
docker build -f packages/agent-keys-cli/Dockerfile -t nexusgenesis/signer:latest .
```

### Run

```bash
# Generate a key first
node packages/agent-keys-cli/src/cli.js generate-key "strong-password" > key.json

# Run the signer daemon
docker run -d \
  --name nexusgenesis-signer \
  --restart unless-stopped \
  -v $(pwd)/key.json:/app/key.json \
  -e KEY_PASSWORD=strong-password \
  nexusgenesis/signer:latest
```

### Docker Compose

```yaml
version: "3.8"
services:
  signer:
    build: packages/agent-keys-cli
    restart: unless-stopped
    volumes:
      - ./key.json:/app/key.json
    environment:
      - KEY_PASSWORD=${KEY_PASSWORD}
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    deploy:
      replicas: 2
```

---

## 4. Vault CSI Integration

The Helm chart supports HashiCorp Vault CSI provider for zero-touch key rotation.

### Prerequisites

```bash
# Install Vault CSI provider
helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
helm install csi-secrets-store secrets-store-csi-driver/csi-secrets-store-driver \
  --set enableSecretRotation=true

# Install Vault CSI provider
kubectl apply -f https://raw.githubusercontent.com/hashicorp/vault-csi-provider/main/deployment/provider.yaml
```

### Vault Setup

```bash
# Enable KV secrets engine
vault secrets enable -path=secret kv-v2

# Write key material
vault kv put secret/signer/keys \
  envelope=@key.json \
  password=your-password

# Create a role
vault write auth/kubernetes/role/signer \
  bound_service_account_names=signer \
  bound_service_account_namespaces=nexusgenesis \
  policies=signer-read \
  ttl=1h
```

### Deploy with Vault

```bash
helm install signer deploy/helm/signer \
  --namespace nexusgenesis \
  --set vault.enabled=true \
  --set vault.address=http://vault:8200 \
  --set vault.role=signer \
  --set vault.secretPath=signer/keys
```

---

## 5. Key Provisioning

### Generate a new key

```bash
npx nexusgenesis generate-key "strong-password" > key.json
```

### Key format

Output of `generate-key` — `envelope` is the value produced by
`encryptPrivateKey()` (see `packages/agent-keys/src/encryption.js`):

```json
{
  "publicKey": "0x...",
  "envelope": {
    "envelope": 1,
    "version": 1,
    "kdf": {
      "algorithm": "pbkdf2-sha512",
      "iterations": 310000,
      "salt": "…hex…",
      "keyLength": 32
    },
    "cipher": "aes-256-gcm",
    "iv": "…hex…",
    "ciphertext": "…hex…",
    "authTag": "…hex…",
    "metadata": {
      "publicKey": "…hex…",
      "createdAt": "2026-08-15T00:00:00.000Z",
      "keyLength": 2560
    }
  }
}
```

### Security considerations

- **Password strength**: minimum 12 characters, high entropy
- **Envelope storage**: never commit to git; use Vault or Kubernetes secrets
- **Key rotation**: generate a new key, update the envelope, restart signers

---

## 6. Hardening Checklist

### Runtime

| Item | Status | Notes |
|------|--------|-------|
| Non-root user | ✅ | Dockerfile uses `signer` user |
| Read-only rootfs | ✅ | `readOnlyRootFilesystem: true` |
| Drop all capabilities | ✅ | `capabilities.drop: ["ALL"]` |
| Seccomp profile | ✅ | `RuntimeDefault` |
| No new privileges | ✅ | `no-new-privileges:true` |
| Core dumps disabled | ✅ | `disableCoreDumps()` in code |

### Network

| Item | Status | Notes |
|------|--------|-------|
| No listening ports | ✅ | stdio-only communication |
| No outbound access | ✅ | Not needed for signing |
| mTLS for IPC | ⚠️ | Future: mutual TLS between proxy and signer |

### Operating System

| Item | Status | Notes |
|------|--------|-------|
| Encrypted swap | ⚠️ | Required for production; OS-level config |
| IOMMU enabled | ⚠️ | Required for DMA protection |
| Secure boot | ⚠️ | Required for TEE attestation |
| TEE (Nitro/SEV-SNP) | ⚠️ | Required for physical attack protection |

---

## 7. Monitoring & Alerting

### Health check

```bash
# Process-level check (container / bare metal)
pgrep -f "node" || echo "signer not running"

# Kubernetes: probes are exec-based (see Helm chart values)
kubectl get pods -n nexusgenesis
kubectl describe pod -n nexusgenesis -l app=nexusgenesis-signer
```

> NOTE: the signer daemon communicates over stdio IPC and does **not** listen
> on a network port. There is no HTTP health endpoint to curl.

### Prometheus metrics (future)

Not yet implemented. Planned metrics:
- `signer_requests_total` — counters by operation type
- `signer_request_duration_ms` — histogram
- `signer_key_age_seconds` — key lifetime gauge

### Logging

The signer daemon logs to stderr:
- `[signer-daemon] Started on stdio` — startup
- `[signer-daemon] Idle timeout, exiting` — idle shutdown

---

## 8. Disaster Recovery

### Key loss

If the key envelope is lost:
1. **Hybrid model**: recover from master key using `deriveOpKeySeed()`
2. **Self-sovereign model**: key is irrecoverable by design (no master key hierarchy)

### Signer crash

Signer subprocesses are stateless — Kubernetes automatically restarts crashed pods.

### Full cluster failure

1. Restore key envelope from backup (Vault/KMS)
2. Re-deploy with Helm
3. Verify health: `kubectl get pods -n nexusgenesis`