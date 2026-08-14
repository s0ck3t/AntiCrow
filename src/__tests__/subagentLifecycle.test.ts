// ---------------------------------------------------------------------------
// subagentLifecycle.test.ts — Subagent lifecycle and handler tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vscode mock
vi.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({
            appendLine: () => { },
            dispose: () => { },
        }),
    },
    workspace: {
        name: 'blender-mcp-subagent-1 (Workspace)',
        workspaceFolders: [{ uri: { fsPath: '/test/repo' } }],
        getConfiguration: () => ({
            get: (_key: string, defaultValue?: unknown) => defaultValue,
            update: vi.fn(),
        }),
    },
    ConfigurationTarget: { Global: 1 },
    commands: { registerCommand: vi.fn() },
    extensions: { getExtension: vi.fn() },
    Uri: { file: (p: string) => ({ fsPath: p }) },
}));

// logger mock
vi.mock('../logger', () => ({
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
}));

// i18n mock
vi.mock('../i18n', () => ({
    t: vi.fn((key: string, ...args: any[]) => `${key}:${args.join(',')}`),
    tArray: vi.fn(() => []),
}));

// instructionBuilder mock
const mockWriteInstructionJson = vi.fn();
vi.mock('../instructionBuilder', () => ({
    writeInstructionJson: (...args: any[]) => mockWriteInstructionJson(...args),
}));

// subagentReceiver mock
class MockSubagentReceiver {
    handler: ((prompt: string) => Promise<string>) | null = null;
    setHandler(fn: (prompt: string) => Promise<string>) {
        this.handler = fn;
    }
}

import { setupSubagentReceiverHandler } from '../bridgeLifecycle';
import { SubagentReceiver } from '../subagentReceiver';

describe('SubagentReceiver handler in bridgeLifecycle', () => {
    let mockReceiver: MockSubagentReceiver;
    let mockCdp: any;
    let mockFileIpc: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockReceiver = new MockSubagentReceiver();
        mockCdp = {
            startNewChat: vi.fn().mockResolvedValue(undefined),
            sendPrompt: vi.fn().mockResolvedValue(undefined),
        };
        mockFileIpc = {
            getIpcDir: vi.fn(() => '/test/ipc'),
            createMarkdownRequestId: vi.fn((wsName: string) => ({
                requestId: `req_${wsName}_123`,
                responsePath: `/test/ipc/req_${wsName}_123_response.md`,
            })),
            waitForResponse: vi.fn().mockResolvedValue('Task execution successful'),
        };
    });

    it('sets up handler and processes prompt successfully', async () => {
        setupSubagentReceiverHandler(mockReceiver as any, mockCdp, mockFileIpc);
        expect(mockReceiver.handler).not.toBeNull();

        const result = await mockReceiver.handler!('Create pirate ship in Blender');

        expect(mockWriteInstructionJson).toHaveBeenCalledWith(
            expect.stringContaining('req_blender-mcp-subagent-1_123_instruction.json'),
            expect.objectContaining({
                prompt: 'Create pirate ship in Blender',
                workspaceName: 'blender-mcp-subagent-1',
            })
        );
        expect(mockCdp.startNewChat).toHaveBeenCalled();
        expect(mockCdp.sendPrompt).toHaveBeenCalledWith(
            expect.stringContaining('prompt.view_file_instruction:')
        );
        expect(mockFileIpc.waitForResponse).toHaveBeenCalledWith(
            '/test/ipc/req_blender-mcp-subagent-1_123_response.md',
            expect.any(Number)
        );
        expect(result).toBe('Task execution successful');
    });

    it('handles empty responses appropriately', async () => {
        mockFileIpc.waitForResponse.mockResolvedValue('');
        setupSubagentReceiverHandler(mockReceiver as any, mockCdp, mockFileIpc);

        const result = await mockReceiver.handler!('Some prompt');
        expect(result).toContain('bridge.cascadeEmptyResponse');
    });

    it('catches and reports timeout errors', async () => {
        mockFileIpc.waitForResponse.mockRejectedValue(new Error('Operation timeout after 900000ms'));
        setupSubagentReceiverHandler(mockReceiver as any, mockCdp, mockFileIpc);

        const result = await mockReceiver.handler!('Some prompt');
        expect(result).toContain('bridge.cascadeTimeout:Operation timeout');
    });
});
