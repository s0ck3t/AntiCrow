<p align="center">
  <img src="https://raw.githubusercontent.com/lucianlamp/AntiCrow/main/images/ogp.png" alt="AntiCrow Banner" width="100%" />
</p>

# 🐦‍⬛ AntiCrow

![Version](https://img.shields.io/badge/version-0.2.1-blue)
![Licence](https://img.shields.io/badge/licence-PolyForm%20Noncommercial-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

[Website](https://anticrow.pages.dev) | [Documentation](https://anticrow.gitbook.io/en) | [OpenVSX](https://open-vsx.org/extension/lucianlamp/anti-crow)

**Discord → Antigravity Automation Bridge**

Send a natural language task from Discord on your phone → Antigravity executes it automatically → Real-time progress and results are delivered straight back to Discord 🚀

> 📖 [日本語版 README](README.ja.md)

---

## 🌿 About This Fork

This repository is an enhanced fork of the original [lucianlamp/AntiCrow](https://github.com/lucianlamp/AntiCrow) extension, providing:

- 🇬🇧 **British English Localisation** — Thoroughly revised British English terminology and phrasing across user interfaces, prompts, notifications, and documentation.
- 🛡️ **Subagent IPC Hardening** — Enhanced handshake protocols, file-based IPC lifecycle management, bidirectional progress reporting, and resilient timeout fallbacks.
- 🧪 **Comprehensive Test Coverage** — Rigorous automated test harness containing 38 test suites and over 700 unit/integration tests verifying prompt generation, CDP bridges, and agent coordination.
- ⚡ **Optimised Window & Prompt Routing** — Improved target detection and DevTools Protocol reliability across multi-workspace environments.

---

## ✨ Features

- 📱 **Remote Control from Mobile** — Delegate tasks to AI via Discord from anywhere, anytime.
- ⏰ **Scheduled Execution** — Register automated recurring tasks using cron expressions (daily, weekly, hourly, etc.).
- 🔄 **Instant Execution** — Promptly request tasks to be carried out immediately.
- 📂 **Multi-Workspace Support** — Automatically organises projects into dedicated Discord categories.
- 📎 **File Attachments** — Attach images and documents for direct AI analysis.
- 📊 **Progress Notifications** — Real-time progress updates for long-running workflows.
- 📝 **Prompt Templates** — Save frequently used instructions as templates for one-tap execution.
- 🧠 **Model & Mode Switching** — Switch AI models and execution modes on the fly from Discord.
- 🤖 **Continuous Auto Mode** — AI autonomously executes tasks in sequence with strict safety guards.
- 🤝 **Agent Team Mode** — Multiple AI sub-agents execute tasks in parallel for rapid results.
- 💾 **Memory Management** — Automatically records and utilises past learnings (global & workspace-specific).
- 🛡️ **Safety Guard** — 21-pattern dangerous operation detection (file deletion, credential leaks, injection attacks).
- 🔐 **Privacy & Security** — Encrypted token storage and strict user ID restrictions.

---

## 🆓 All Features Free

AntiCrow is a **free and source-available** project. All capabilities are available to everyone at no cost:

| Feature | Status |
| --- | --- |
| Task execution via Discord | ✅ Unlimited |
| Scheduled execution (cron) | ✅ |
| Slash commands | ✅ |
| File attachments & progress notifications | ✅ |
| Model & mode switching | ✅ |
| Templates | ✅ |
| Continuous Auto Mode | ✅ |
| Agent Team Mode | ✅ |

---

## 🔧 How It Works

AntiCrow acts as a bidirectional bridge between Discord and Antigravity:

```
📱 Discord (Mobile/Desktop)
    ↕ Message exchange
🐦‍⬛ AntiCrow Extension (Your PC)
    ↕ Task coordination (CDP & IPC)
🤖 Antigravity AI (Your PC)
```

> 🔒 **All processing runs entirely on your local machine.** No code or private workspace data is sent to external intermediary servers. Communication is exclusively conducted with the Discord API. No telemetry or usage statistics are gathered.

---

## Prerequisites

| Item | Requirement |
| --- | --- |
| Antigravity | Installed and launchable |
| Node.js | 18.0.0 or higher |
| Discord Account | Developer Portal access required for Bot creation |
| Discord Server | A server where you possess administrative permissions |

> 💡 For fully autonomous operation, you may optionally install the companion extension [pesosz/antigravity-auto-accept](https://github.com/pesosz/antigravity-auto-accept), which automatically confirms approval prompts (Run / Allow / Continue) within Antigravity.

---

## Setup Guide

### 1️⃣ Create a Discord Bot

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **"New Application"** in the top right → Enter a name (e.g. `AntiCrow`).
3. Select **"Bot"** from the left-hand navigation menu.
4. Click **"Reset Token"** to generate a token → **Save it securely** (it cannot be retrieved again).
5. On the same page, enable the following **Privileged Gateway Intents**:
   - ✅ **MESSAGE CONTENT INTENT** — Required (to process task instructions).
   - ✅ **SERVER MEMBERS INTENT** — Recommended (for user information retrieval).

### 2️⃣ Invite the Bot to Your Server

1. Select **"OAuth2"** from the left-hand menu.
2. In **"URL Generator"**, configure:
   - **SCOPES**: `bot`
   - **BOT PERMISSIONS**: `Send Messages`, `Read Message History`, `Add Reactions`, `Manage Channels`, `Manage Messages`, `Attach Files`, `Embed Links`, `Use Slash Commands`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`
3. Copy the generated URL, open it in your browser, and authorise the Bot into your chosen server.

### 3️⃣ Install the Extension

Search for **"AntiCrow"** in the Antigravity extension marketplace and select **Install**, or obtain it from the [OpenVSX Marketplace](https://open-vsx.org/extension/lucianlamp/anti-crow).

### 4️⃣ Initial Configuration

1. Open the Command Palette (`Ctrl+Shift+P`) → Run **"AntiCrow: Set Bot Token"** → Enter your saved Bot Token.
2. When **`✓ AntiCrow`** appears in the status bar, you are successfully connected 🎉.

> `autoStart` is enabled by default, ensuring the bridge starts automatically once the token is configured.

> ⚠️ **Important:** AntiCrow requires Antigravity to run with remote debugging enabled. Create a shortcut using the **"AntiCrow: Create Desktop Shortcut"** command and launch Antigravity from it.

---

## Basic Usage

### 💬 Natural Language Requests (`#agent-chat`)

Post a message into the `#agent-chat` channel. AntiCrow analyses the request and determines whether to execute immediately or register it as a scheduled task.

**Instant Execution:**
```
List all TODO items in the current project
```
```
Fix the styling glitch shown in this screenshot
```

**Scheduled Execution:**
```
Summarise GitHub notifications every weekday at 9 AM
```
*→ Automatically translated to a cron schedule and executed at the appointed time.*

### ✅ Confirmation Reactions

When pre-execution confirmation is required:
- Select ✅ → **Approve and initiate execution**
- Select ❌ → **Reject and cancel**

### 📎 File Attachments

Attach images, logs, or specification files to your message. The AI analyses the uploaded materials alongside your prompt instructions.

---

## Workspace Integration

AntiCrow automatically detects active Antigravity workspaces and organises channels under corresponding server categories:

```
📁 🔧 crypto (Category)
  └── #agent-chat
📁 🔧 web-app (Category)
  └── #agent-chat
```

Tasks dispatched within a category channel execute strictly within the context of that specific workspace.

---

## 🤖 Continuous Auto Mode

Continuous Auto Mode allows the AI to autonomously plan, execute, and iterate through multiple subtasks sequentially. Initiate using `/auto`:

```
/auto Redesign the landing page
/auto --steps 15 --confirm semi Refactor the entire project
```

- **Options:** `--steps N` (1–20), `--duration N` (5–120 min), `--confirm auto|semi|manual`, `--select auto-delegate|first|ai-select`
- **Safety Guard:** A 21-pattern detection engine safeguards against accidental file deletion, destructive Git force operations, database modifications, secret credential leaks, and prompt injection attempts.

> 📖 [Full Continuous Auto Mode Documentation](https://anticrow.gitbook.io/en/auto-mode)

---

## 🤝 Agent Team Mode

Agent Team Mode coordinates multiple AI sub-agents in parallel. Complex or large-scale tasks are automatically partitioned across multiple agents:

- 🚀 Automatically decomposes extensive tasks for parallel execution.
- 💬 Displays real-time progress for each sub-agent via dedicated Discord threads.
- 🔄 Aggregates and returns consolidated results upon completion.

Toggle with the `/team` command.

> 📖 [Full Agent Team Mode Documentation](https://anticrow.gitbook.io/en/team-mode)

---

## Slash Commands

| Command | Description |
| --- | --- |
| `/status` | Display Bot health, connection status, and execution queue |
| `/stop` | Stop the currently running task |
| `/newchat` | Open a fresh chat session in Antigravity |
| `/workspace` | Display detected workspace environments |
| `/queue` | Display detailed processing queue contents |
| `/model` | Inspect and switch the active AI model |
| `/mode` | Switch AI execution mode (Planning / Fast) |
| `/template` | Create and manage reusable prompt templates |
| `/schedules` | View, pause, or remove scheduled executions |
| `/auto` | Start Continuous Auto Mode |
| `/auto-config` | View or adjust Continuous Auto Mode parameters |
| `/team` | Configure Agent Team Mode |
| `/suggest` | Display contextual follow-up suggestion buttons |
| `/screenshot` | Capture and return current editor screenshot |
| `/soul` | View or customise persona and behavioural instructions |
| `/help` | Display interactive usage guide |

---

## Settings Reference

| Setting Key | Type | Default | Description |
| --- | --- | --- | --- |
| `antiCrow.botToken` | boolean | `false` | Bot Token configuration status (display only) |
| `antiCrow.allowedUserIds` | string[] | `[]` | Allowed Discord user IDs (**empty = all denied for security**) |
| `antiCrow.autoStart` | boolean | `true` | Automatically start bridge on editor launch |
| `antiCrow.language` | string | `en` | UI and prompt display language (`en` / `ja`) |
| `antiCrow.cdpPort` | number | `9000` | CDP (Chrome DevTools Protocol) debugging port |
| `antiCrow.responseTimeoutMs` | number | `0` | Idle timeout since last progress update in ms (0 = unlimited) |
| `antiCrow.maxRetries` | number | `0` | Automatic retry attempts on failure (0 = disabled) |
| `antiCrow.categoryArchiveDays` | number | `7` | Days of inactivity before archiving workspace categories |
| `antiCrow.workspaceParentDirs` | string[] | `[]` | Parent directories scanned for new workspace creation |

---

## Command Palette Commands

| Command | Description |
| --- | --- |
| `AntiCrow: Start` | Start Discord Bridge service |
| `AntiCrow: Stop` | Stop Discord Bridge service |
| `AntiCrow: Set Bot Token` | Securely store Discord Bot Token in SecretStorage |
| `AntiCrow: Show Plans` | Export registered execution plans as JSON |
| `AntiCrow: Clear All Plans` | Clear all saved execution plans |
| `AntiCrow: Create Desktop Shortcut` | Generate configured Antigravity desktop launcher |

---

## Customisation

### 🎨 AI Personality & Behaviour

Customise the AI's persona and tone by editing `~/.anticrow/SOUL.md`:

```markdown
# Basic Style
- Always respond in British English
- Use a clear, concise, and structured tone

# Engineering Standards
- Strict TypeScript with strict type checking
- Maintain comprehensive unit tests
```

### 💾 Memory

AntiCrow automatically records architectural decisions and past project learnings:

| Type | Location | Purpose |
| --- | --- | --- |
| Global Memory | `~/.anticrow/MEMORY.md` | Cross-workspace knowledge & global preferences |
| Workspace Memory | `{workspace}/.anticrow/MEMORY.md` | Project-specific architecture & conventions |

---

## 🔒 Security & Privacy

- **Encrypted Storage**: Bot Token is securely encrypted within the editor's native `SecretStorage`.
- **Access Control**: Strict `allowedUserIds` whitelist restricts who can trigger execution.
- **Local-First Architecture**: Code and prompts are executed locally on your machine.
- **Zero Telemetry**: No user data, code snippets, or analytics are collected or transmitted externally.

> 📖 [Full Security Policy](https://anticrow.gitbook.io/en/security) | [Privacy Policy](https://anticrow.gitbook.io/en/privacy)

---

## 📄 Licence

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Copyright (c) 2026 LUCIAN (lucianlamp)
