// ---------------------------------------------------------------------------
// subagentReceiver.ts — サブウィンドウ側のプロンプト受信ロジック
// ---------------------------------------------------------------------------
// 設計書: docs/subagent-communication-design.md v1.1 §13.1
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logWarn, logError } from './logger';
import { SubagentPrompt, SubagentResponse } from './subagentTypes';
import {
    watchPrompts,
    writeResponse,
    validateIpcPath,
    writeReady,
    writeHeartbeat,
    cleanupAgentIpc,
} from './subagentIpc';

/**
 * サブエージェント側で動作するプロンプト受信クラス。
 * メインエージェントからのプロンプトを fs.watch() で検知し、
 * コールバックを呼び出してレスポンスを返す。
 */
export class SubagentReceiver {
    private stopWatcher: (() => void) | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private myName: string;
    private ipcDir: string;
    private handler: ((prompt: string) => Promise<string>) | null = null;

    constructor(myName: string, ipcDir: string) {
        this.myName = SubagentReceiver.normalizeAgentName(myName);
        this.ipcDir = ipcDir;
    }

    /**
     * サブエージェント名を正規化する。
     * (Workspace) / (ワークスペース) サフィックスの除去など。
     */
    static normalizeAgentName(name: string): string {
        return (name || '').replace(/\s*\((?:Workspace|ワークスペース)\)\s*$/i, '').trim();
    }

    /**
     * プロンプト受信ハンドラを設定する。
     * ハンドラはプロンプト文字列を受け取り、結果文字列を返す。
     */
    setHandler(handler: (prompt: string) => Promise<string>): void {
        this.handler = handler;
        // ハンドラ設定完了時に ready 状態を更新
        this.emitReady();
    }

    /**
     * 準備完了シグナルを IPC ディレクトリに書き込む。
     */
    private emitReady(): void {
        try {
            writeReady(this.ipcDir, {
                type: 'subagent_ready',
                name: this.myName,
                timestamp: Date.now(),
                pid: typeof process !== 'undefined' ? process.pid : undefined,
            });
            writeHeartbeat(this.ipcDir, this.myName);
            logDebug(`[SubagentReceiver] 準備完了シグナル送出: "${this.myName}"`);
        } catch (err) {
            logWarn(`[SubagentReceiver] 準備完了シグナル送出失敗: ${err}`);
        }
    }

    /**
     * プロンプト監視を開始する。
     */
    start(): void {
        if (this.stopWatcher) {
            logWarn('[SubagentReceiver] 既に監視中です');
            return;
        }

        logDebug(`[SubagentReceiver] 監視開始: myName="${this.myName}"`);

        // 準備完了通知を送信
        this.emitReady();

        // 定期ハートビート開始（5秒間隔）
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setInterval(() => {
                writeHeartbeat(this.ipcDir, this.myName);
            }, 5000);
        }

        this.stopWatcher = watchPrompts(
            this.ipcDir,
            this.myName,
            (prompt, filePath) => this.handlePrompt(prompt, filePath),
        );
    }

    /**
     * プロンプト監視を停止する。
     */
    stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        // IPC 準備完了/ハートビートファイルをクリーンアップ
        cleanupAgentIpc(this.ipcDir, this.myName);

        if (this.stopWatcher) {
            this.stopWatcher();
            this.stopWatcher = null;
            logDebug('[SubagentReceiver] 監視停止');
        }
    }

    /**
     * 自分がサブエージェントとして動作中かどうかを判定する。
     * ワークスペース名に "-subagent-" が含まれていればサブエージェント。
     */
    static isSubagent(workspaceName: string): boolean {
        const clean = SubagentReceiver.normalizeAgentName(workspaceName);
        return clean.includes('-subagent-');
    }

    // -----------------------------------------------------------------------
    // 内部処理
    // -----------------------------------------------------------------------

    private async handlePrompt(prompt: SubagentPrompt, filePath: string): Promise<void> {
        const startTime = Date.now();
        logDebug(`[SubagentReceiver] ────── プロンプト処理開始 ──────`);
        logDebug(`[SubagentReceiver] from=${prompt.from}, to=${prompt.to}, callback=${path.basename(prompt.callback_path)}`);
        logDebug(`[SubagentReceiver] prompt(150chars)="${prompt.prompt.substring(0, 150)}${prompt.prompt.length > 150 ? '...' : ''}"`);
        logDebug(`[SubagentReceiver] timeout_ms=${prompt.timeout_ms}, handler=${this.handler ? 'set' : 'null'}`);

        let response: SubagentResponse;

        try {
            // If handler is not set, wait for startBridge to complete (max 30s)
            if (!this.handler) {
                logWarn(`[SubagentReceiver] ⚠️ Handler not set — waiting for startBridge (max 30s)...`);
                const maxWaitMs = 30_000;
                const pollMs = 1_000;
                const waitStart = Date.now();
                while (!this.handler && Date.now() - waitStart < maxWaitMs) {
                    await new Promise(r => setTimeout(r, pollMs));
                }
                if (!this.handler) {
                    throw new Error(`Handler not set after waiting ${maxWaitMs / 1000}s. startBridge may not have finished.`);
                }
                logDebug(`[SubagentReceiver] ✅ Handler configured (${Date.now() - waitStart}ms wait)`);
            }

            logDebug(`[SubagentReceiver] ハンドラ呼び出し開始...`);
            const result = await this.handler(prompt.prompt);

            const executionTimeMs = Date.now() - startTime;
            logDebug(`[SubagentReceiver] ✅ プロンプト処理成功: from=${prompt.from}, result=${result.length} chars, elapsed=${Math.round(executionTimeMs / 1000)}秒`);
            response = {
                type: 'subagent_response',
                from: this.myName,
                timestamp: Date.now(),
                status: 'success',
                result,
                execution_time_ms: executionTimeMs,
            };
        } catch (err) {
            const executionTimeMs = Date.now() - startTime;
            logError(`[SubagentReceiver] ❌ プロンプト処理エラー (elapsed=${Math.round(executionTimeMs / 1000)}秒): ${err}`);
            response = {
                type: 'subagent_response',
                from: this.myName,
                timestamp: Date.now(),
                status: 'error',
                result: '',
                execution_time_ms: executionTimeMs,
                error: String(err),
            };
        }

        // レスポンスを callback_path に書き込み
        logDebug(`[SubagentReceiver] レスポンス書き込み開始: status=${response.status}, callback=${prompt.callback_path}`);
        try {
            if (!validateIpcPath(prompt.callback_path, this.ipcDir)) {
                logError(`[SubagentReceiver] パストラバーサル検出: ${prompt.callback_path}`);
                return;
            }
            writeResponse(prompt.callback_path, response, this.ipcDir);
            // 書き込み後の存在確認
            const written = fs.existsSync(prompt.callback_path);
            logDebug(`[SubagentReceiver] レスポンス書き込み完了: status=${response.status}, path=${path.basename(prompt.callback_path)}, exists=${written}, size=${written ? fs.statSync(prompt.callback_path).size : 0}`);
        } catch (err) {
            logError(`[SubagentReceiver] レスポンス書き込みエラー: ${err}`);
        }

        // 処理済みプロンプトファイルを削除
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logDebug(`[SubagentReceiver] プロンプトファイル削除: ${path.basename(filePath)}`);
            }
        } catch (err) {
            logWarn(`[SubagentReceiver] プロンプトファイル削除失敗: ${err}`);
        }
        logDebug(`[SubagentReceiver] ────── 処理完了 ──────`);
    }
}
