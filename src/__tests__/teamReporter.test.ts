// ---------------------------------------------------------------------------
// teamReporter.test.ts — Unit tests for team reporter module
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({
            appendLine: () => { },
            dispose: () => { },
        }),
    },
    Uri: {
        file: (p: string) => ({ fsPath: p }),
    },
}));

vi.mock('../logger', () => ({
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
}));

import { writeReportFile, writeReportInstructionFile } from '../teamReporter';
import { FileIpc } from '../fileIpc';

describe('teamReporter', () => {
    let tempDir: string;
    let fileIpc: FileIpc;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anticrow-test-reporter-'));
        fileIpc = new FileIpc({ fsPath: tempDir } as any);
        await fileIpc.init();
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    describe('writeReportFile', () => {
        it('should correctly structure and write aggregated team report JSON', () => {
            const requestId = 'req_test_123';
            const results = [
                {
                    agentName: 'subagent-1',
                    success: true,
                    response: 'Backend changes completed and tested.',
                    durationMs: 12000,
                },
                {
                    agentName: 'subagent-2',
                    success: false,
                    response: 'Frontend test failed.',
                    durationMs: 15000,
                },
            ];
            const instructions = [
                {
                    persona: '',
                    agentIndex: 1,
                    task: 'Implement backend prompt enhancements',
                    response_path: '',
                    progress_path: '',
                    context: '',
                    timestamp: Date.now(),
                    requestId,
                    totalAgents: 2,
                },
                {
                    persona: '',
                    agentIndex: 2,
                    task: 'Implement frontend cache alignment',
                    response_path: '',
                    progress_path: '',
                    context: '',
                    timestamp: Date.now(),
                    requestId,
                    totalAgents: 2,
                },
            ];

            const reportPath = writeReportFile(fileIpc, requestId, results, instructions, '');
            expect(fs.existsSync(reportPath)).toBe(true);

            const content = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            expect(content.type).toBe('team_report');
            expect(content.requestId).toBe(requestId);
            expect(content.summary.totalAgents).toBe(2);
            expect(content.summary.successCount).toBe(1);
            expect(content.summary.failureCount).toBe(1);
            expect(content.summary.allSucceeded).toBe(false);
            expect(content.reports).toHaveLength(2);
            expect(content.reports[0].agentName).toBe('subagent-1');
            expect(content.reports[0].success).toBe(true);
            expect(content.reports[1].agentName).toBe('subagent-2');
            expect(content.reports[1].success).toBe(false);
        });
    });

    describe('writeReportInstructionFile', () => {
        it('should write instruction file pointing to markdown response path', () => {
            const teamRequestId = '1786788414127';
            const reportPath = path.join(fileIpc.getIpcDir(), `req_${teamRequestId}_report_all.json`);
            const { responsePath: reportResponsePath } = fileIpc.createMarkdownRequestId();

            const { instructionPath, progressPath } = writeReportInstructionFile(
                fileIpc,
                teamRequestId,
                reportPath,
                reportResponsePath,
            );

            expect(fs.existsSync(instructionPath)).toBe(true);
            expect(reportResponsePath.endsWith('.md')).toBe(true);

            const instructionContent = JSON.parse(fs.readFileSync(instructionPath, 'utf-8'));
            expect(instructionContent.task).toBe('execution');
            expect(instructionContent.context.role).toBe('main_agent_report');
            expect(instructionContent.context.report_path).toBe(reportPath);
            expect(instructionContent.output.response_path).toBe(reportResponsePath);
            expect(instructionContent.output.format).toBe('markdown');
            expect(instructionContent.progress.path).toBe(progressPath);
            expect(instructionContent.prompt).toContain('synthesise a consolidated report');
        });
    });
});
