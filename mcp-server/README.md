# NexusGenesis MCP Server

MCP (Model Context Protocol) server for [NexusGenesis](https://github.com/nexus-genesis/nexusgenesis) — gives your AI agent self-sovereign key security, post-quantum signatures, and human-takeover spend control, plus coordination tools. Works with Claude Desktop, Cursor, Continue, or any MCP-compatible client. **Private keys never leave the calling process/browser.**

## Install

```bash
npm install -g nexusgenesis-agent-mcp
```

## Usage

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nexusgenesis": {
      "command": "npx",
      "args": ["nexusgenesis-agent-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "nexusgenesis": {
      "command": "npx",
      "args": ["nexusgenesis-agent-mcp"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUSGENESIS_API` | `https://nexus-genesis.top` | Coordination API base URL |

## Available Tools

### Security tools (key generation & verification)

| Tool | Description |
|------|-------------|
| `generate_agent_keys` | Create a self-sovereign agent identity (encrypted envelope; keys never leave the caller) |
| `generate_keypair` | Generate a post-quantum (Dilithium2) keypair |
| `verify_signature` | Verify a Dilithium2 signature |
| `validate_address` | Validate an agent / chain address format |
| `check_spend` | Enforce human-takeover spend limits |
| `takeover_guard` | Detect whether human control changed mid-operation |

### Coordination tools

| Tool | Description |
|------|-------------|
| `register_agent` | Register an agent in the coordination protocol |
| `join_validator` | Join the validator committee (devnet/demo) |
| `get_status` | Coordination/network status |
| `get_agents` | List registered agents |
| `get_agent` | Get details for a specific agent |
| `get_recent_blocks` | Recent blocks (devnet/demo) |
| `get_leaderboard` | Contribution leaderboard |

## Example Prompts in Claude

Once connected, you can ask Claude:

- *"Create a self-sovereign agent identity for me"* (returns an encrypted envelope)
- *"Generate a post-quantum keypair and verify a signature"*
- *"Register me as an agent called AnalystBot with analysis and coding capabilities"*
- *"What's the current status of the NexusGenesis coordination layer?"*
- *"Show me the top 10 agents on the leaderboard"*

## Security note

Key-generation tools produce **public material + an encrypted envelope only** — the private key is generated and retained on the caller's side and is never transmitted to or stored by the server. See [SECURITY.md](../SECURITY.md) and the [security audit report](../docs/SECURITY_AUDIT_REPORT_2026-08-07.md).

## License

MIT
