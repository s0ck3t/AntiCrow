// ---------------------------------------------------------------------------
// memorySummarizer.ts — MEMORY.md 自動サマライズモジュール
// ---------------------------------------------------------------------------
// MEMORY.md が一定サイズを超えた場合、古いエントリを
// Antigravity（LLM）に要約させて圧縮する。
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logWarn } from './logger';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

/** サマライズ発動閾値（バイト） */
export const SUMMARIZE_THRESHOLD_BYTES = 50 * 1024; // 50KB

/** 直近エントリ保持件数 */
export const RECENT_ENTRY_COUNT = 5;

/** 要約の最大文字数 */
export const MAX_SUMMARY_CHARS = 1000;

/** Summary section header */
export const SUMMARY_SECTION_HEADER = '## Past Memories (Summary)';
const LEGACY_SUMMARY_SECTION_HEADER = '## 過去の記憶（要約）';

/** Entry delimiter pattern */
const ENTRY_PATTERN = /(?=^### \d{4}-\d{2}-\d{2})/m;

/** Concurrent execution lock */
let summarizing = false;

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

/** CDP/IPC operation interface for summarisation */
export interface SummarizeOps {
    /** Send prompt to Antigravity */
    sendPrompt: (prompt: string) => Promise<void>;
    /** Generate FileIpc response path */
    createMarkdownRequestId: (wsName?: string) => { requestId: string; responsePath: string };
    /** Wait for response */
    waitForResponse: (responsePath: string, timeoutMs: number) => Promise<string>;
    /** Clean up temporary files */
    cleanupTmpFiles?: (excludeFiles?: string[]) => Promise<void>;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

/**
 * Checks MEMORY.md size and triggers summarisation if threshold is exceeded.
 */
export async function trySummarizeIfNeeded(
    filePath: string,
    label: string,
    ops: SummarizeOps,
): Promise<void> {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size <= SUMMARIZE_THRESHOLD_BYTES) { return; }
    } catch { return; }

    if (summarizing) {
        logDebug(`memorySummarizer: already summarizing, skipping for ${label}`);
        return;
    }

    summarizing = true;
    try {
        await doSummarize(filePath, label, ops);
    } catch (e) {
        logWarn(`memorySummarizer: summarize failed for ${label}: ${e instanceof Error ? e.message : e}`);
    } finally {
        summarizing = false;
    }
}

/**
 * Splits MEMORY.md, prompts Antigravity to summarise old entries, and rebuilds the file.
 */
async function doSummarize(
    filePath: string,
    label: string,
    ops: SummarizeOps,
): Promise<void> {
    logDebug(`memorySummarizer: starting summarize for ${label} (${filePath})`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const { header, oldEntries, recentEntries, existingSummary } = splitMemoryContent(content);

    if (oldEntries.length === 0) {
        logDebug(`memorySummarizer: no old entries to summarize for ${label}`);
        return;
    }

    const oldText = oldEntries.join('\n').trim();
    logDebug(`memorySummarizer: ${oldEntries.length} old entries (${oldText.length} chars), ${recentEntries.length} recent entries`);

    const contextPrefix = existingSummary
        ? `The following is a past summary. Please re-summarise the entire content including this:\n${existingSummary}\n\nThe following are additional old memories:\n`
        : '';

    const summaryText = await requestSummaryFromAntigravity(
        contextPrefix + oldText,
        label,
        ops,
    );

    if (!summaryText) {
        logWarn(`memorySummarizer: failed to get summary from Antigravity for ${label}`);
        return;
    }

    const newContent = rebuildMemoryContent(header, summaryText, recentEntries);
    fs.writeFileSync(filePath, newContent, 'utf-8');
    logDebug(`memorySummarizer: summarized ${label} memory — old ${oldEntries.length} entries → ${summaryText.length} chars summary`);
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Parses and splits MEMORY.md content.
 */
export function splitMemoryContent(content: string): {
    header: string;
    oldEntries: string[];
    recentEntries: string[];
    existingSummary: string | null;
} {
    let existingSummary: string | null = null;
    let cleanContent = content;

    let summaryStart = content.indexOf(SUMMARY_SECTION_HEADER);
    let matchedHeader = SUMMARY_SECTION_HEADER;
    if (summaryStart === -1) {
        summaryStart = content.indexOf(LEGACY_SUMMARY_SECTION_HEADER);
        matchedHeader = LEGACY_SUMMARY_SECTION_HEADER;
    }

    if (summaryStart !== -1) {
        const afterHeader = content.indexOf('\n', summaryStart);
        if (afterHeader !== -1) {
            const rest = content.substring(afterHeader + 1);
            const nextSectionMatch = rest.match(/^(#{2,3}\s)/m);
            if (nextSectionMatch && nextSectionMatch.index !== undefined) {
                existingSummary = rest.substring(0, nextSectionMatch.index).trim();
                cleanContent = content.substring(0, summaryStart) + rest.substring(nextSectionMatch.index);
            } else {
                existingSummary = rest.trim();
                cleanContent = content.substring(0, summaryStart);
            }
        }
    }

    const parts = cleanContent.split(ENTRY_PATTERN);
    const header = parts[0];
    const allEntries = parts.slice(1);

    const splitIdx = Math.max(0, allEntries.length - RECENT_ENTRY_COUNT);
    const oldEntries = allEntries.slice(0, splitIdx);
    const recentEntries = allEntries.slice(splitIdx);

    return { header, oldEntries, recentEntries, existingSummary };
}

/**
 * Rebuilds MEMORY.md content from header, summary text, and recent entries.
 */
export function rebuildMemoryContent(
    header: string,
    summaryText: string,
    recentEntries: string[],
): string {
    const parts: string[] = [header.trimEnd()];
    parts.push('');
    parts.push(SUMMARY_SECTION_HEADER);
    parts.push(summaryText.trim());
    parts.push('');
    if (recentEntries.length > 0) {
        parts.push(recentEntries.join('').trimEnd());
        parts.push('');
    }
    return parts.join('\n');
}

/**
 * Requests old memory summarisation from Antigravity.
 */
async function requestSummaryFromAntigravity(
    oldText: string,
    label: string,
    ops: SummarizeOps,
): Promise<string | null> {
    const TIMEOUT_MS = 180_000; // 3 min timeout

    const { responsePath } = ops.createMarkdownRequestId();
    const prompt = buildSummarizePrompt(oldText, responsePath);

    const tmpPath = responsePath.replace(/_response\.md$/, '_summary_prompt.txt');
    fs.writeFileSync(tmpPath, prompt, 'utf-8');
    logDebug(`memorySummarizer: summary prompt written to ${tmpPath}`);

    try {
        const instruction = `Please read the following file using the view_file tool and follow its instructions. File path: ${tmpPath}`;
        await ops.sendPrompt(instruction);
        logDebug(`memorySummarizer: summary prompt sent to Antigravity for ${label}`);

        const response = await ops.waitForResponse(responsePath, TIMEOUT_MS);
        logDebug(`memorySummarizer: received summary response (${response.length} chars) for ${label}`);

        const summary = response.trim();
        if (summary.length === 0) { return null; }

        if (summary.length > MAX_SUMMARY_CHARS * 1.5) {
            return summary.substring(0, MAX_SUMMARY_CHARS) + '\n\n(Summary truncated due to excessive length)';
        }
        return summary;
    } catch (e) {
        logWarn(`memorySummarizer: Antigravity summary request failed for ${label}: ${e instanceof Error ? e.message : e}`);
        return null;
    } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
}

/**
 * Builds summarisation prompt.
 */
function buildSummarizePrompt(oldText: string, responsePath: string): string {
    return `{
    "task": "memory_summarize",
    "instruction": "Summarise the following old memory entries in concise English within ${MAX_SUMMARY_CHARS} characters.",
    "constraints": [
        "Prioritise retaining key technical decisions, bug fix patterns, and architectural principles",
        "Omit specific dates and summarise the essence of the lessons learned concisely",
        "Format as bullet points, grouped logically by category",
        "Output the summary text only, without conversational preamble or closing remarks",
        "Keep within ${MAX_SUMMARY_CHARS} characters"
    ],
    "old_entries": ${JSON.stringify(oldText)},
    "output": {
        "method": "write_to_file",
        "path": ${JSON.stringify(responsePath)},
        "format": "Write summary text only. Output as plain text (Markdown bullet points), not JSON."
    }
}`;
}

// -------------------------------------------------------------------------
// Testing helpers
// -------------------------------------------------------------------------

/** テスト用: summarizing フラグをリセット */
export function _resetSummarizingFlag(): void {
    summarizing = false;
}
