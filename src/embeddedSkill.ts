// ---------------------------------------------------------------------------
// embeddedSkill.ts — AntiCrow エージェントスキルテンプレート
// ---------------------------------------------------------------------------
// ワークスペースの .agent/skills/anticrow/SKILL.md に配置するスキル内容を定義。
// bridgeLifecycle.ts の起動時に毎回上書きコピーされる。
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logInfo, logWarn } from './logger';
import { ensureAnticrowGitignore } from './gitignoreHelper';

/** スキルの配置先ディレクトリ名 */
const SKILL_DIR = '.agent/skills/anticrow';
/** スキルファイル名 */
const SKILL_FILE = 'SKILL.md';

export const ANTICROW_SKILL_VERSION = '1.2.0';

/**
 * AntiCrow スキルテンプレート
 * Antigravity のエージェントが AntiCrow の機能を理解し活用するためのガイド。
 */
export const ANTICROW_SKILL_CONTENT = `---
name: anticrow
version: ${ANTICROW_SKILL_VERSION}
description: Skill for leveraging the AntiCrow extension. Understand how to use team mode, continuous auto mode, IPC communication, progress reporting, suggestions, and Discord slash commands.
---

# AntiCrow Skill

AntiCrow is a VS Code extension that receives tasks via Discord and delegates their execution to Antigravity agents.
This skill explains how to maximise the capabilities of AntiCrow.

## Team Mode (Parallel Subagent Execution)

Team mode distributes independent tasks across multiple subagents for concurrent execution.

### Usage

When generating a plan (\\\`task: "plan_generation"\\\`), output a \\\`tasks\\\` array so each task is assigned to an individual subagent.

\\\`\\\`\\\`json
{
  "tasks": [
    "Implement new authentication logic in src/auth.ts",
    "Add unit tests in src/__tests__/auth.test.ts",
    "Create documentation in src/docs/auth.md"
  ]
}
\\\`\\\`\\\`

### Decision Criteria for Task Splitting

**Use tasks (Team Mode):**
- Changes spanning 3 or more files
- New feature implementation + testing + documentation required
- Fixing multiple independent issues simultaneously
- Tasks where research, implementation, and verification can run in parallel

**Do NOT use tasks (Main agent only):**
- Single file edits or configuration changes
- Information lookups or answering questions
- Simple bug fixes (1-2 files)
- Running type checks, tests, or builds only
- Minor documentation or comment updates

### Important Rules

- Keep each task as an **independent, actionable unit**
- **Do not modify the same file across multiple tasks** to prevent merge conflicts
- If there is only one task, omit the \\\`tasks\\\` array
- **Subagents must not perform VSIX deployment** (the main agent performs this at the end)
  - Subagents build the VSIX file (compile → bundle → vsce package)
  - \\\`antigravity --install-extension\\\` is solely the main agent's responsibility
  - If a subagent installs a VSIX, the extension host reloads, severing IPC communication

### Subagent Window Reuse

During continuous auto mode, completed subagent windows are retained in an idle pool and reused in subsequent steps, eliminating window launch overhead.
This can be toggled via \\\`enableWindowReuse\\\` in \\\`.anticrow/team.json\\\`.

## Continuous Auto Mode (Autonomous Execution Loop)

Continuous auto mode enables the AI to autonomously determine the next actions and execute tasks continuously.

### Usage

Start continuous auto mode via the Discord \\\`/auto\\\` command or by clicking the "Let Agent Decide" button on suggestions.

\\\`\\\`\\\`
/auto Redesign the landing page
/auto --steps 15 --confirm semi Refactor the entire project
\\\`\\\`\\\`

### Configuration Options

- \\\`--steps N\\\`: Maximum number of steps (1-20, default: 10)
- \\\`--duration N\\\`: Maximum run duration in minutes (5-120, default: 30m)
- \\\`--confirm MODE\\\`: Confirmation mode (auto / semi / manual)
- \\\`--select MODE\\\`: Next action selection method (auto-delegate / first / ai-select)

### Confirmation Modes

- **auto**: Automatically executes all steps without interruption (default)
- **semi**: Prompts for user confirmation on even-numbered steps
- **manual**: Prompts for user confirmation on every step

### Safety Guards

Continuous auto mode includes 21 built-in dangerous operation detection patterns:
- **Filesystem destruction**: rm -rf, format, truncate
- **Destructive Git actions**: reset --hard, push --force, clean -fd
- **Database destruction**: DROP TABLE/DATABASE, TRUNCATE TABLE
- **Cryptographic secret protection**: Private keys, seed phrases, fund draining detection (10 patterns)
- **Prompt injection protection**: Instruction overrides, system prompt manipulation, dynamic code execution

When a pattern with block severity is triggered, the loop pauses and offers Approve / Skip / Stop choices in Discord.

### Completion Detection

Auto mode automatically stops when completion phrases are detected in the last 15 lines of a response.
However, if a \\\`SUGGESTIONS\\\` tag is present, completion phrases are disregarded (suggestions imply further steps).

## Scheduled Execution

You can schedule recurring tasks using standard cron expressions.

### Plan Generation Specification

\\\`\\\`\\\`json
{
  "cron": "0 9 * * 1-5",
  "timezone": "Europe/London",
  "prompt": "Run daily morning tests"
}
\\\`\\\`\\\`

- \\\`cron\\\`: Standard 5-field cron expression (seconds not required)
- Specify \\\`"now"\\\` for immediate one-off execution
- Use the \\\`/schedules\\\` command to view and manage registered schedules

## Customisation (Persona & Soul)

Configure persona settings in \\\`~/.anticrow/SOUL.md\\\` to customise AntiCrow's tone and style.

### Plan Generation Specification

When a user requests persona customisation, specify \\\`target: "anticrow_customization"\\\`:

\\\`\\\`\\\`json
{
  "target": "anticrow_customization",
  "prompt": "Adopt a friendly, encouraging mentor persona"
}
\\\`\\\`\\\`

Use the Discord \\\`/soul\\\` command to review or reset customisations.

## Prompt Templates

Save frequently used prompts as reusable templates.
Use the \\\`/templates\\\` command to list, execute, or delete templates.

## Automatic Workspace Creation

Create new project workspaces directly via the \\\`/workspace\\\` command.

### Configuration

Configure target parent directories in \\\`antiCrow.workspaceParentDirs\\\`:

\\\`\\\`\\\`json
"antiCrow.workspaceParentDirs": ["C:\\\\Users\\\\user\\\\dev", "C:\\\\Users\\\\user\\\\projects"]
\\\`\\\`\\\`

### Plan Generation Specification

When a user requests creating a new project, specify the new workspace name in the \\\`workspace\\\` field.
If the folder does not exist, it is automatically created under one of the configured \\\`workspaceParentDirs\\\`.

## IPC Response Communication

AntiCrow detects task completion via file-based IPC communication.

### Completion Requirement

**Writing to the file specified by \\\`response_path\\\` using write_to_file** is the completion condition.
Without this write, the task remains marked as "running" indefinitely.

- \\\`task: "execution"\\\` → Write Markdown content to \\\`response_path\\\`
- \\\`task: "plan_generation"\\\` → Write JSON content to \\\`response_path\\\`

### VSIX Deployment Ordering

When a task involves deploying a VSIX extension, follow this strict sequence:
1. Complete all source code modifications
2. Build: \\\`npm run compile\\\` → \\\`npm run bundle\\\` → \\\`npx vsce package\\\`
3. **Write the response to \\\`response_path\\\`** (crucial)
4. **Only afterwards** run \\\`antigravity --install-extension\\\`
5. Reversing this order will cause the extension host to restart before the response is delivered, losing the response.

### Automatic Error Recovery

If communication is interrupted, AntiCrow automatically executes recovery:
1. Waits 5 seconds for the extension host to reload
2. Scans and recovers existing response files
3. If not found, waits up to 120 seconds on a re-established connection

Successful recovery is recorded with \\\`retried: true\\\` in the task report.

## Progress Reporting

Periodically write JSON progress updates to \\\`progress_path\\\` during task execution.
These updates are forwarded to Discord in real time.

\\\`\\\`\\\`json
{"status": "in_progress", "detail": "Refactoring auth.ts", "percent": 50}
\\\`\\\`\\\`

**Interval:** Update every 30 to 60 seconds. Prolonged silence causes user uncertainty.

## Sending Files to Discord

Embed file attachments in your response using the following tag:

\\\`\\\`\\\`
<!-- FILE:C:/path/to/file.png -->
\\\`\\\`\\\`

Supported formats: png, jpg, gif, webp, mp4, webm, pdf, txt, csv, json, md, zip.

**Limit:** Files exceeding 25MB will not be uploaded (Discord limit).

## Storing Memories

Record key learnings or project context by appending memory tags to your response:

\\\`\\\`\\\`
<!-- MEMORY:global: Cross-project learning or convention -->
<!-- MEMORY:workspace: Workspace-specific architectural decision -->
\\\`\\\`\\\`

## Action Suggestion Buttons

Append suggestion tags to your response to render interactive next-action buttons in Discord:

\\\`\\\`\\\`
<!-- SUGGESTIONS:[{"label":"Button Label","description":"Brief description","prompt":"Execution prompt"}] -->
\\\`\\\`\\\`

Up to 3 suggestions are displayed, alongside a built-in "Let Agent Decide" button.

## Best Practice Guidelines

### Effective Team Mode Usage

- **Be specific**: Prefer "Add login/logout unit tests in src/__tests__/auth.test.ts" over "Write tests"
- **Avoid dependencies**: If Task B depends on the output of Task A, team mode is not suitable
- **Prevent file conflicts**: Clearly define file boundaries beforehand, and merge tasks if conflicts overlap
- **Deploy last**: Complete all code modifications before the main agent deploys

### Response Quality

- **Be comprehensive**: Always detail what was done, modified files, affected scope, and test verification
- **Avoid minimal reports**: A single "Done" is never sufficient
- **Leverage suggestions**: Use \\\`SUGGESTIONS\\\` tags to streamline subsequent steps for the user

## Constraints

- **Discord file attachments**: 25MB maximum
- **Response length**: Messages exceeding Discord's 2,000 character limit are split automatically

## Troubleshooting

### Response does not reach Discord
- **Cause**: Response was not written to \\\`response_path\\\`, or was written after VSIX installation.
- **Remedy**: Verify output was written in the correct format (Markdown for execution, JSON for plan generation).

### Progress not reflected in Discord
- **Cause**: Invalid JSON format in \\\`progress_path\\\`.
- **Remedy**: Follow \\\`{"status": "...", "detail": "...", "percent": N}\\\` format strictly without trailing commas or comments.

## Discord Slash Commands

- \\\`/status\\\` — Display Bot and workspace connection status
- \\\`/stop\\\` — Cancel current running task
- \\\`/newchat\\\` — Start a fresh chat session
- \\\`/workspace\\\` — List or switch workspaces
- \\\`/queue\\\` — Show message queue status
- \\\`/model\\\` — Switch AI models
- \\\`/mode\\\` — Switch agent modes
- \\\`/templates\\\` — List, run, or delete prompt templates
- \\\`/schedules\\\` — List and manage schedules
- \\\`/auto\\\` — Start continuous auto mode
- \\\`/team\\\` — Manage team mode and subagents
- \\\`/suggest\\\` — Redisplay the most recent suggestion buttons
- \\\`/screenshot\\\` — Capture Antigravity screen
- \\\`/soul\\\` — Review or reset customisation settings
- \\\`/help\\\` — Display help and command directory

## Workspace Structure

\\\`\\\`\\\`
{workspace}/
├── .anticrow/
│   ├── team.json      # Team mode configuration (enabled, maxAgents, enableWindowReuse, etc.)
│   ├── MEMORY.md      # Workspace-specific memories
│   └── worktrees/     # Subagent git worktrees
├── .agent/
│   └── skills/
│       └── anticrow/
│           └── SKILL.md  # This skill file (automatically deployed)
~/.anticrow/
├── SOUL.md            # Customisation settings (tone, address)
├── SOUL.md.bak        # Backup of customisation
└── MEMORY.md          # Global memory
\`\`\`
`;

/**
 * ワークスペースに AntiCrow スキルファイルを配置する。
 * 毎回上書きで最新版を書き出す。
 *
 * @param workspacePath ワークスペースのルートパス
 */
export function deployAntiCrowSkill(workspacePath: string): void {
    if (!workspacePath) {
        logDebug('embeddedSkill: no workspace path provided, skipping skill deployment');
        return;
    }

    const skillDir = path.join(workspacePath, SKILL_DIR);
    const skillPath = path.join(skillDir, SKILL_FILE);

    try {
        // ディレクトリ作成（再帰的）
        fs.mkdirSync(skillDir, { recursive: true });

        // スキルファイルを上書き
        fs.writeFileSync(skillPath, ANTICROW_SKILL_CONTENT, 'utf-8');
        logInfo(`embeddedSkill: AntiCrow skill deployed to ${skillPath}`);

        // .gitignore に .anticrow/ を自動追加（なければ作成）
        ensureAnticrowGitignore(workspacePath);
    } catch (e) {
        logWarn(`embeddedSkill: failed to deploy skill: ${e instanceof Error ? e.message : e}`);
    }
}
