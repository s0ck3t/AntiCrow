// ---------------------------------------------------------------------------
// subagentHandshakeIntegration.test.ts — Subagent Handshake & IPC Integration Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock vscode
vi.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({
            appendLine: () => { },
            dispose: () => { },
        }),
    },
    workspace: {
        getConfiguration: () => ({
            get: (_key: string, defaultValue?: unknown) => defaultValue,
        }),
    },
}));

// Mock logger
vi.mock('../logger', () => ({
    logDebug: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
}));

import { SubagentHandle } from '../subagentHandle';
import { SubagentReceiver } from '../subagentReceiver';
import { isAgentAliveIpc } from '../subagentIpc';

describe('Subagent Handshake & IPC Integration', () => {
    let tmpDir: string;
    let repoRoot: string;
    let ipcDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anticrow-integ-'));
        repoRoot = path.join(tmpDir, 'repo');
        ipcDir = path.join(tmpDir, 'ipc');
        fs.mkdirSync(repoRoot, { recursive: true });
        fs.mkdirSync(ipcDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('successfully completes full spawn, IPC handshake, prompt execution, and teardown lifecycle', async () => {
        const agentName = 'integ-test-subagent-1';
        let receiver: SubagentReceiver | null = null;

        // Simulated CDP bridge: when launchAntigravity is called, simulate the subagent window starting up
        const cdpBridgeMock = {
            launchAntigravity: vi.fn().mockImplementation(async (targetPath: string) => {
                // Verify workspace file generation
                expect(targetPath).toContain('.code-workspace');
                expect(fs.existsSync(targetPath)).toBe(true);

                // Simulate subagent window initialising SubagentReceiver
                receiver = new SubagentReceiver(agentName, ipcDir);
                receiver.setHandler(async (prompt: string) => {
                    return `Processed by subagent: ${prompt}`;
                });
                receiver.start();
            }),
            closeWindow: vi.fn().mockResolvedValue(undefined),
            minimizeWindow: vi.fn().mockResolvedValue(true),
            getPorts: vi.fn(() => [9000]),
            getActiveTargetTitle: vi.fn(() => 'Main Window — Antigravity'),
        };

        const handle = new SubagentHandle(
            agentName,
            repoRoot,
            ipcDir,
            cdpBridgeMock as any,
            {
                launchTimeoutMs: 5000,
                promptTimeoutMs: 5000,
                pollIntervalMs: 50,
            },
        );

        // 1. Spawn subagent (must resolve fast via IPC readiness handshake)
        const spawnStart = Date.now();
        await handle.spawn();
        const spawnElapsed = Date.now() - spawnStart;

        expect(handle.state).toBe('READY');
        expect(spawnElapsed).toBeLessThan(3000);

        // Verify .code-workspace file contains multi-root folders
        const wsFilePath = path.join(repoRoot, '.anticrow', 'subwindows', agentName, `${agentName}.code-workspace`);
        expect(fs.existsSync(wsFilePath)).toBe(true);
        const wsConfig = JSON.parse(fs.readFileSync(wsFilePath, 'utf-8'));
        expect(wsConfig.folders).toHaveLength(2);
        expect(wsConfig.folders[0].name).toBe('repo');

        // 2. Verify subagent is alive via IPC heartbeat
        const alive = await handle.isAlive();
        expect(alive).toBe(true);
        expect(isAgentAliveIpc(ipcDir, agentName)).toBe(true);

        // 3. Send prompt and await response
        const response = await handle.sendPrompt('Compile project and run tests');
        expect(response.status).toBe('success');
        expect(response.from).toBe(agentName);
        expect(response.result).toContain('Processed by subagent:');
        expect(response.result).toContain('Compile project and run tests');
        expect(response.execution_time_ms).toBeGreaterThanOrEqual(0);

        // Handle state after response returns to COMPLETED
        expect(handle.state).toBe('COMPLETED');

        // 4. Test reuse
        await handle.resetForReuse();
        expect(handle.state).toBe('READY');

        // 5. Teardown
        if (receiver) {
            (receiver as SubagentReceiver).stop();
        }
        await handle.close();

        expect(handle.state).toBe('CLEANED');
        expect(isAgentAliveIpc(ipcDir, agentName)).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, '.anticrow', 'subwindows', agentName))).toBe(false);
    });

    it('correctly handles subagent failure or timeout when ready signal is missing', async () => {
        const agentName = 'failing-subagent-2';

        const cdpBridgeMock = {
            launchAntigravity: vi.fn().mockResolvedValue(undefined), // Window opens but never emits ready
            closeWindow: vi.fn().mockResolvedValue(undefined),
            minimizeWindow: vi.fn().mockResolvedValue(false),
            getPorts: vi.fn(() => [9000]),
            getActiveTargetTitle: vi.fn(() => 'Main Window — Antigravity'),
        };

        const handle = new SubagentHandle(
            agentName,
            repoRoot,
            ipcDir,
            cdpBridgeMock as any,
            {
                launchTimeoutMs: 300,
                promptTimeoutMs: 500,
                pollIntervalMs: 50,
                spawnMaxRetries: 1,
            },
        );

        await expect(handle.spawn()).rejects.toThrow('timed out after 1 retry attempts');
        expect(handle.state).toBe('FAILED');
    });
});
