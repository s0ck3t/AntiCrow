// ---------------------------------------------------------------------------
// planPipeline.test.ts — planPipeline のユニットテスト
// ---------------------------------------------------------------------------
// テスト対象:
//   - resolveReplyContext: 返信コンテキスト解決
//   - applyChoiceSelection: 選択結果の prompt 付加
//   - handleConfirmation: 確認フロー

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TextChannel, Message } from 'discord.js';

// ---------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------

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

vi.mock('../logger', () => ({
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
}));

vi.mock('../embedHelper', () => ({
    EmbedColor: {
        Success: 0x2ecc71,
        Info: 0x3498db,
        Warning: 0xe67e22,
        Danger: 0xe74c3c,
        Progress: 0x3498db,
    },
    buildEmbed: vi.fn(() => ({ toJSON: () => ({}) })),
    sanitizeErrorForDiscord: vi.fn((err: string) => err),
    normalizeHeadings: vi.fn((text: string) => text),
}));

vi.mock('../i18n', () => ({
    t: vi.fn((key: string, ...args: unknown[]) => `${key}:${args.join(',')}`),
}));

vi.mock('../suggestionButtons', () => ({
    AUTO_PROMPT: 'テスト用オートプロンプト',
    buildSuggestionRow: vi.fn(),
    buildSuggestionContent: vi.fn(),
    storeSuggestions: vi.fn(),
}));

vi.mock('../messageQueue', () => ({
    cancelPlanGeneration: vi.fn(),
    enqueueMessage: vi.fn(),
    getActivePlanProgressIntervals: vi.fn(() => []),
    setTeamAbortController: vi.fn(),
}));

vi.mock('../autoModeController', () => ({
    isAutoModeActive: vi.fn(() => false),
    startAutoMode: vi.fn(),
    stopAutoMode: vi.fn(),
    onStepComplete: vi.fn(),
}));

vi.mock('../cdpModels', () => ({
    getCurrentModel: vi.fn(),
}));

vi.mock('../cdpModes', () => ({
    getCurrentMode: vi.fn(),
}));

vi.mock('../configHelper', () => ({
    getResponseTimeout: vi.fn(() => 300000),
}));

vi.mock('../executorResponseHandler', () => ({
    sendTeamResponse: vi.fn(),
}));

vi.mock('../teamConfig', () => ({
    loadTeamConfig: vi.fn(() => ({
        maxAgents: 3,
        enabled: true,
    })),
}));

vi.mock('../discordBot', () => ({
    DiscordBot: vi.fn(),
}));

vi.mock('../bridgeContext', () => ({
    BridgeContext: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート
// ---------------------------------------------------------------------------
import { resolveReplyContext, applyChoiceSelection, dispatchPlan } from '../planPipeline';
import type { BridgeContext } from '../bridgeContext';
import type { Plan } from '../types';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function createMockChannel(overrides: Record<string, unknown> = {}): TextChannel {
    return {
        id: 'test-channel-id',
        send: vi.fn().mockResolvedValue(undefined),
        sendTyping: vi.fn().mockResolvedValue(undefined),
        messages: {
            fetch: vi.fn().mockResolvedValue({
                content: '元のメッセージ内容',
                author: { username: 'test-user' },
            }),
        },
        ...overrides,
    } as unknown as TextChannel;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('planPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // resolveReplyContext
    // -----------------------------------------------------------------------

    describe('resolveReplyContext', () => {
        it('should return original text when no messageRef', async () => {
            const channel = createMockChannel();
            const result = await resolveReplyContext(channel, 'テストメッセージ');
            expect(result).toBe('テストメッセージ');
        });

        it('should return original text when messageRef has no messageId', async () => {
            const channel = createMockChannel();
            const result = await resolveReplyContext(channel, 'テスト', {});
            expect(result).toBe('テスト');
        });

        it('should prepend reply context when messageRef has messageId', async () => {
            const mockMessage = {
                content: '元のメッセージ',
                author: { username: 'lucian' },
            };
            const channel = createMockChannel({
                messages: {
                    fetch: vi.fn().mockResolvedValue(mockMessage),
                } as any,
            });

            const result = await resolveReplyContext(channel, '返信テスト', { messageId: 'msg-123' });
            // 返信コンテキストが付加されているはず
            expect(result).toContain('返信テスト');
        });

        it('should handle fetch error gracefully', async () => {
            const channel = createMockChannel({
                messages: {
                    fetch: vi.fn().mockRejectedValue(new Error('Not found')),
                } as any,
            });

            const result = await resolveReplyContext(channel, 'テスト', { messageId: 'invalid-id' });
            // エラーでも元のテキストが返る
            expect(result).toBe('テスト');
        });
    });

    // -----------------------------------------------------------------------
    // applyChoiceSelection
    // -----------------------------------------------------------------------

    describe('applyChoiceSelection', () => {
        it('should not modify prompt when no selectedChoices', () => {
            const plan = { prompt: 'テストプロンプト', tasks: [] };
            applyChoiceSelection(plan as any);
            expect(plan.prompt).toBe('テストプロンプト');
        });

        it('should not modify prompt when selectedChoices is empty', () => {
            const plan = { prompt: 'テストプロンプト', tasks: [] };
            applyChoiceSelection(plan as any, []);
            expect(plan.prompt).toBe('テストプロンプト');
        });

        it('should not modify prompt for [-1] (全選択)', () => {
            const plan = { prompt: 'テストプロンプト', tasks: [] };
            applyChoiceSelection(plan as any, [-1]);
            expect(plan.prompt).toBe('テストプロンプト');
        });

        it('should prepend selected choices to prompt', () => {
            const plan = {
                prompt: '1. タスクA\n2. タスクB\n3. タスクC',
                tasks: [],
            };
            applyChoiceSelection(plan as any, [0, 2]);
            // 選択結果が先頭に付加される
            expect(plan.prompt).toContain('1');
            expect(plan.prompt).toContain('3');
        });
    });

    // -----------------------------------------------------------------------
    // dispatchPlan (Team Mode)
    // -----------------------------------------------------------------------

    describe('dispatchPlan (Team Mode)', () => {
        it('should use markdown response path and write metadata for integrated team report', async () => {
            const reportReqId = 'req_report_123';
            const reportResponsePath = '/tmp/ipc/req_report_123_response.md';
            const mockFileIpc = {
                createMarkdownRequestId: vi.fn().mockReturnValue({
                    requestId: reportReqId,
                    responsePath: reportResponsePath,
                }),
                writeRequestMeta: vi.fn(),
                registerActiveRequest: vi.fn(),
                unregisterActiveRequest: vi.fn(),
                readProgress: vi.fn().mockResolvedValue(null),
                cleanupProgress: vi.fn().mockResolvedValue(undefined),
                waitForResponse: vi.fn().mockResolvedValue('# Consolidated Team Report\n\nAll tasks completed.'),
            };

            const mockBot = {
                sendToChannel: vi.fn().mockResolvedValue(undefined),
                sendFileToChannel: vi.fn().mockResolvedValue({ sent: true }),
                sendComponentsToChannel: vi.fn().mockResolvedValue(undefined),
            };

            const mockTeamOrchestrator = {
                groupTasks: vi.fn((tasks) => tasks),
                writeInstructionFiles: vi.fn().mockReturnValue([]),
                orchestrateTeam: vi.fn().mockResolvedValue({
                    results: [
                        { agentName: 'subagent-1', success: true, response: 'Done 1', durationMs: 1000 },
                        { agentName: 'subagent-2', success: true, response: 'Done 2', durationMs: 1200 },
                    ],
                    totalDurationMs: 2200,
                    successCount: 2,
                    failCount: 0,
                }),
                writeReportFile: vi.fn().mockReturnValue('/tmp/ipc/req_report_123_all.json'),
                writeReportInstructionFile: vi.fn().mockReturnValue({
                    instructionPath: '/tmp/ipc/tmp_exec_report.json',
                    progressPath: '/tmp/ipc/report_progress.json',
                }),
            };

            const mockActiveCdp = {
                getActiveWorkspaceName: vi.fn().mockReturnValue('test-workspace'),
                ensureCascadePanel: vi.fn().mockResolvedValue(undefined),
                sendPrompt: vi.fn().mockResolvedValue(undefined),
            };

            const ctx: Partial<BridgeContext> = {
                bot: mockBot as any,
                fileIpc: mockFileIpc as any,
                teamOrchestrator: mockTeamOrchestrator as any,
                cdpPool: {
                    getResolvedWorkspacePaths: vi.fn().mockReturnValue({}),
                } as any,
            };

            const plan: Plan = {
                plan_id: 'plan-123',
                timezone: 'UTC',
                source_channel_id: 'test-channel-456',
                notify_channel_id: 'test-channel-456',
                created_at: new Date().toISOString(),
                prompt: 'Run full verification',
                tasks: [
                    'Implement backend changes in manager.py',
                    'Implement frontend screen test in test.dart',
                ],
                cron: null,
                status: 'active',
                choice_mode: 'none',
                requires_confirmation: false,
                discord_templates: {
                    ack: 'Awaiting execution',
                },
            };

            const channel = createMockChannel({ id: 'test-channel-456' });

            const result = await dispatchPlan(
                ctx as BridgeContext,
                plan,
                channel,
                mockActiveCdp as any,
                'test-workspace',
                null,
                true, // isTeamMode
                false, // autoMode
            );

            expect(mockFileIpc.createMarkdownRequestId).toHaveBeenCalledWith('test-workspace');
            expect(mockFileIpc.writeRequestMeta).toHaveBeenCalledWith(reportReqId, 'test-channel-456', 'test-workspace');
            expect(mockActiveCdp.sendPrompt).toHaveBeenCalled();
            expect(mockFileIpc.waitForResponse).toHaveBeenCalledWith(reportResponsePath, 60000);
            expect(mockFileIpc.unregisterActiveRequest).toHaveBeenCalledWith(reportReqId);
            expect(result).toContain('Consolidated Team Report');
        });
    });
});

