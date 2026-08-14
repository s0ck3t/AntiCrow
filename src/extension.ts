// ---------------------------------------------------------------------------
// extension.ts — VS Code 拡張エントリポイント（全モジュールの接続点）
// ---------------------------------------------------------------------------
// 責務:
//   1. VS Code ライフサイクル管理 (activate / deactivate)
//   2. コマンド登録
//   3. BridgeContext の構築と各モジュールへの橋渡し
//   4. StatusBar 表示
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { PlanStore } from './planStore';
import { Scheduler } from './scheduler';
import { initLogger, logInfo, logDebug, logWarn, logError, disposeLogger } from './logger';

import { BridgeContext } from './bridgeContext';
import { startBridge, stopBridge, updateStatusBar } from './bridgeLifecycle';
import { checkAndOfferShortcut, createDesktopShortcut } from './shortcutInstaller';


import { SubagentManager } from './subagentManager';
import { SubagentReceiver } from './subagentReceiver';
import { extractWorkspaceName } from './cdpTargets';

// ---------------------------------------------------------------------------
// グローバル BridgeContext
// ---------------------------------------------------------------------------

const ctx: BridgeContext = {
    bot: null,
    cdp: null,
    cdpPool: null,
    fileIpc: null,
    scheduler: null,
    planStore: null,
    executor: null,
    executorPool: null,
    templateStore: null,
    isBotOwner: false,
    globalStoragePath: '',
    extensionPath: '',
    statusBarItem: undefined!,

    lockWatchTimer: null,
    categoryWatchTimer: null,
    healthCheckTimer: null,
    cleanupTimer: null,
    staleRecoveryTimer: null,

    agentRunning: false,
    subagentManager: null,
    subagentReceiver: null,
    teamOrchestrator: null,
};



import * as fs from 'fs';
import * as path from 'path';


// =====================================================================
// activate
// =====================================================================

export async function activate(context: vscode.ExtensionContext) {
    const log = initLogger(context.globalStorageUri.fsPath);
    logInfo('Extension activating...');



    // StatusBar
    ctx.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    ctx.statusBarItem.text = '$(circle-slash) AntiCrow';
    ctx.statusBarItem.tooltip = 'AntiCrow — Stopped';
    ctx.statusBarItem.command = 'anti-crow.start';
    ctx.statusBarItem.show();
    context.subscriptions.push(ctx.statusBarItem);


    // -----------------------------------------------------------------
    // 全ウィンドウでワークスペースパスを workspacePaths に自動保存
    // Bot Owner 以外のウィンドウも自分のWSパスを登録することで、
    // Bot Owner の定期チェックでカテゴリが自動作成されるようにする
    // -----------------------------------------------------------------
    {
        try {
            const rawWsName = vscode.workspace.name;
            const currentWsFolders = vscode.workspace.workspaceFolders;
            if (rawWsName && currentWsFolders && currentWsFolders.length > 0) {
                const currentWsName = extractWorkspaceName(rawWsName);
                const { isInvalidWorkspaceName } = await import('./bridgeLifecycle');
                if (!isInvalidWorkspaceName(currentWsName) && !SubagentReceiver.isSubagent(currentWsName)) {
                    const { getConfig, getWorkspacePaths } = await import('./configHelper');
                    const wsPath = currentWsFolders[0].uri.fsPath;
                    const wsPaths = getWorkspacePaths();
                    let modified = false;
                    for (const key of Object.keys(wsPaths)) {
                        if (SubagentReceiver.isSubagent(key) || isInvalidWorkspaceName(key)) {
                            delete wsPaths[key];
                            modified = true;
                        }
                    }
                    if (!wsPaths[currentWsName] || wsPaths[currentWsName] !== wsPath) {
                        wsPaths[currentWsName] = wsPath;
                        modified = true;
                    }
                    if (modified) {
                        await getConfig().update('workspacePaths', wsPaths, vscode.ConfigurationTarget.Global);
                        logDebug(`Extension: auto-saved workspace path: "${currentWsName}" → "${wsPath}"`);
                    }
                }
            }
        } catch (e) {
            logWarn(`Extension: failed to auto-save workspace path (non-fatal): ${e}`);
        }
    }




    // -----------------------------------------------------------------
    // Command: Set Bot Token
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.setToken', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Please enter your Discord Bot Token',
                password: true,
                ignoreFocusOut: true,
            });
            if (token) {
                await context.secrets.store('discord-bot-token', token);
                await vscode.workspace.getConfiguration('antiCrow').update('botToken', true, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('🔐 Bot Token saved securely to SecretStorage.');
                logDebug('Token saved to SecretStorage');

                // Auto-start bridge if autoStart enabled and not yet running
                const cfg = vscode.workspace.getConfiguration('antiCrow');
                if (cfg.get<boolean>('autoStart') && (!ctx.bot || !ctx.bot.isReady())) {
                    startBridge(ctx, context).catch(e => {
                        logError('Auto-start after token set failed', e);
                    });
                }
            }
        })
    );

    // -----------------------------------------------------------------
    // Command: Start
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.start', async () => {
            if (ctx.bot && ctx.bot.isReady()) {
                vscode.window.showInformationMessage('AntiCrow is already running.');
                return;
            }

            try {
                await startBridge(ctx, context);
                vscode.window.showInformationMessage('✅ AntiCrow started successfully.');
            } catch (e) {
                logError('Start failed', e);
                vscode.window.showErrorMessage('Failed to start. Please check logs in the Output panel.');
            }
        })
    );

    // -----------------------------------------------------------------
    // Command: Stop
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.stop', async () => {
            await stopBridge(ctx);
            vscode.window.showInformationMessage('AntiCrow stopped.');
        })
    );

    // -----------------------------------------------------------------
    // Command: Show Plans
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.showPlans', async () => {
            if (!ctx.planStore) {
                vscode.window.showWarningMessage('Bridge is not running.');
                return;
            }
            const plans = ctx.planStore.getAll();
            if (plans.length === 0) {
                vscode.window.showInformationMessage('No registered plans found.');
                return;
            }

            const lines = plans.map(p => {
                const cronStr = p.cron || '(immediate)';
                return `[${p.status}] ${p.plan_id} — ${cronStr} — ${p.human_summary || p.prompt.substring(0, 50)}`;
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `=== AntiCrow — Plans ===\n\n${lines.join('\n')}`,
                language: 'text',
            });
            await vscode.window.showTextDocument(doc);
        })
    );

    // -----------------------------------------------------------------
    // Command: Clear Plans
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.clearPlans', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all plans? This action cannot be undone.',
                { modal: true },
                'Yes'
            );
            if (confirm === 'Yes') {
                ctx.scheduler?.stopAll();
                ctx.planStore?.clearAll();
                vscode.window.showInformationMessage('All plans have been deleted.');
            }
        })
    );



    // -----------------------------------------------------------------
    // Command: Create Desktop Shortcut
    // -----------------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('anti-crow.createShortcut', () => {
            try {
                createDesktopShortcut(context.extensionPath);
                vscode.window.showInformationMessage('✅ Desktop shortcut created successfully.');
            } catch (e) {
                logError('createShortcut command failed', e);
                vscode.window.showErrorMessage('Failed to create shortcut. Please check logs in the Output panel.');
            }
        })
    );

    // -----------------------------------------------------------------
    // First-run: Offer desktop shortcut creation
    // -----------------------------------------------------------------
    checkAndOfferShortcut(context).catch(e => {
        logError('Shortcut offer check failed', e);
    });


    // -----------------------------------------------------------------
    // Auto-start
    // -----------------------------------------------------------------
    const autoStart = vscode.workspace.getConfiguration('antiCrow').get<boolean>('autoStart', true);
    if (autoStart) {
        startBridge(ctx, context).catch(e => {
            logError('Auto-start failed', e);
        });
    }

    // -----------------------------------------------------------------
    // Subagent (Sub-window) initialisation
    // -----------------------------------------------------------------
    const ipcDir = path.join(context.globalStorageUri.fsPath, 'ipc');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const repoRoot = workspaceFolders?.[0]?.uri.fsPath ?? '';
    const windowTitle = vscode.env.appName ? `${vscode.workspace.name ?? ''} - ${vscode.env.appName}` : '';
    const rawWorkspaceName = vscode.workspace.name ?? extractWorkspaceName(windowTitle);
    const workspaceName = extractWorkspaceName(rawWorkspaceName);

    if (SubagentReceiver.isSubagent(workspaceName)) {
        // --- Sub-window: Start SubagentReceiver ---
        logInfo(`[Subagent] Detected as sub-window: "${workspaceName}"`);
        const receiver = new SubagentReceiver(workspaceName, ipcDir);
        receiver.start();
        ctx.subagentReceiver = receiver;
        logInfo('[Subagent] SubagentReceiver 起動完了（ハンドラは startBridge 後に設定）');
    } else if (repoRoot) {
        // --- メインウィンドウ: SubagentManager を作成 ---
        logDebug(`[Subagent] メインウィンドウ: "${workspaceName}"`);
        // SubagentManager は Bridge 起動後に cdpBridge が利用可能になってから初期化
        // ここでは ctx にフラグを立てておき、startBridge 完了後に初期化する
        // → 簡易実装: CdpBridge が null でも作成可能だが、spawn 時に ensureConnected する
    }

    logInfo('Extension activated');
}

// =====================================================================
// deactivate
// =====================================================================

export async function deactivate(): Promise<void> {
    // メッセージキュータイマー停止
    const { disposeMessageQueueTimers } = await import('./messageQueue');
    disposeMessageQueueTimers();

    // サブエージェント停止
    if (ctx.subagentManager) {
        await ctx.subagentManager.dispose();
        ctx.subagentManager = null;
    }
    if (ctx.subagentReceiver) {
        ctx.subagentReceiver.stop();
        ctx.subagentReceiver = null;
    }



    await stopBridge(ctx);
    disposeLogger();
}
