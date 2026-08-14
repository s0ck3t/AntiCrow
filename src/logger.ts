import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** ログレベル定義（数値が大きいほど重要） */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

let channel: vscode.OutputChannel | undefined;
let currentLevel: LogLevel = LogLevel.DEBUG;
let logFilePath: string | undefined;

/** OutputChannel を初期化して返す。既に作成済みならそのまま返す。 */
export function initLogger(storagePath?: string): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('AntiCrow');
    }
    if (storagePath) {
        try {
            fs.mkdirSync(storagePath, { recursive: true });
            logFilePath = path.join(storagePath, 'anticrow.log');
        } catch { /* ignore */ }
    }
    return channel;
}

/** ログレベルを設定する。設定レベル未満のメッセージは出力されない。 */
export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

/** 現在のログレベルを取得する */
export function getLogLevel(): LogLevel {
    return currentLevel;
}

/** ISO 8601 形式のタイムスタンプ文字列を返す */
function ts(): string {
    return new Date().toISOString();
}

function writeLog(line: string): void {
    channel?.appendLine(line);
    if (logFilePath) {
        try {
            fs.appendFileSync(logFilePath, line + '\n');
        } catch { /* ignore */ }
    }
}

/** INFO レベルのログを出力する */
export function logInfo(msg: string): void {
    if (currentLevel > LogLevel.INFO) { return; }
    writeLog(`[INFO  ${ts()}] ${msg}`);
}

/** WARN レベルの警告ログを出力する */
export function logWarn(msg: string): void {
    if (currentLevel > LogLevel.WARN) { return; }
    writeLog(`[WARN  ${ts()}] ${msg}`);
}

/** ERROR レベルのエラーログを出力する。err が Error の場合はメッセージも付与する。常に出力される。 */
export function logError(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? ` | ${err.message}` : '';
    writeLog(`[ERROR ${ts()}] ${msg}${detail}`);
}

/** DEBUG レベルの詳細ログを出力する */
export function logDebug(msg: string): void {
    if (currentLevel > LogLevel.DEBUG) { return; }
    writeLog(`[DEBUG ${ts()}] ${msg}`);
}

/** OutputChannel を破棄してリソースを解放する */
export function disposeLogger(): void {
    channel?.dispose();
    channel = undefined;
}
