// ---------------------------------------------------------------------------
// cdpWindowManager.ts — ウィンドウ制御・ポート管理ロジック
// ---------------------------------------------------------------------------
// cdpBridge.ts から分離。closeWindow / minimizeWindow / findFreePort / isPortInUse
// の実装をヘルパー関数として提供。
// ---------------------------------------------------------------------------

import * as path from 'path';
import * as net from 'net';
import { logDebug, logError, logWarn } from './logger';
import { CdpConnection } from './cdpConnection';
import {
    DiscoveredInstance,
    discoverInstances,
    extractWorkspaceName,
} from './cdpTargets';

// ---------------------------------------------------------------------------
// ポート管理
// ---------------------------------------------------------------------------

/**
 * ポート範囲から空きポートを探す。
 * 全ポートを並列に TCP チェックし、最初の空きポートを返す。
 */
export async function findFreePort(ports: number[]): Promise<number> {
    const results = await Promise.allSettled(
        ports.map(async (port) => ({
            port,
            inUse: await isPortInUse(port),
        })),
    );
    for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.inUse) {
            logDebug(`CDP: found free port ${result.value.port} for launch`);
            return result.value.port;
        }
    }
    // 全ポートが使用中の場合はデフォルトの最初のポートで試行
    logWarn(`CDP: all ports in range are in use, falling back to ${ports[0]}`);
    return ports[0];
}

/** ポートが使用中かどうかを TCP 接続でチェックする */
export function isPortInUse(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(300);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);  // 接続成功 = 使用中
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false); // 接続失敗 = 空き
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false); // タイムアウト = 空き
        });
        socket.connect(port, '127.0.0.1');
    });
}

// ---------------------------------------------------------------------------
// closeWindow
// ---------------------------------------------------------------------------

/**
 * 指定ワークスペース名の Antigravity ウィンドウを閉じる。
 * VSCode API の workbench.action.closeWindow を CDP 経由で実行する。
 *
 * メインウィンドウ（現在接続中のターゲット）は閉じないようガードする。
 * 一時的な CdpConnection を作成して実行するため、現在の接続には影響しない。
 *
 * @param conn 現在のメイン CdpConnection（メインウィンドウの判定に使用）
 * @param ports CDP ポート一覧
 * @param workspaceName 閉じたいウィンドウのワークスペース名
 * @returns true: ウィンドウを閉じた, false: ターゲットが見つからない or 失敗
 */
export async function closeWindow(
    conn: CdpConnection,
    ports: number[],
    workspaceName: string,
): Promise<boolean> {
    logDebug(`[closeWindow] Closing window for workspace "${workspaceName}"`);

    try {
        // 1. Discover all targets
        const instances = await discoverInstances(ports);
        if (instances.length === 0) {
            logWarn('[closeWindow] Target not found');
            return false;
        }

        // 2. Match by workspace name (4 strategies equivalent to matchesSubagent)
        let targetInstance: DiscoveredInstance | undefined;
        for (const inst of instances) {
            const wsName = extractWorkspaceName(inst.title);
            const matches =
                wsName === workspaceName ||
                inst.title.includes(workspaceName) ||
                inst.title.includes(path.basename(workspaceName));
            if (matches) {
                targetInstance = inst;
                logDebug(`[closeWindow] Match: wsName="${wsName}", title="${inst.title.substring(0, 80)}"`);
                break;
            }
        }

        if (!targetInstance) {
            logWarn(`[closeWindow] Target for workspace "${workspaceName}" not found`);
            logDebug(`[closeWindow] Available targets: ${instances.map(i => `"${extractWorkspaceName(i.title) || i.title}"`).join(', ')}`);
            return false;
        }

        // 3. Guard against closing main window (currently connected)
        const currentWsName = conn ? extractWorkspaceName(conn.getActiveTargetTitle() ?? '') : null;
        if (currentWsName === workspaceName) {
            logWarn(`[closeWindow] Workspace "${workspaceName}" is the main window. Skipping close`);
            return false;
        }

        logDebug(`[closeWindow] Found target: "${targetInstance.title}" (${targetInstance.wsUrl})`);

        // 4. Create temporary CdpConnection
        const tempConn = new CdpConnection(ports);
        try {
            await tempConn.connectToUrl(targetInstance.wsUrl);
            logDebug('[closeWindow] Temporary connection established');

            // 5a. Close window via window.close() (first priority)
            let closed = false;
            try {
                const evalJs = `
                    (async () => {
                        try {
                            window.close();
                            return { success: true, method: 'window.close' };
                        } catch (e) {
                            return { success: false, error: String(e) };
                        }
                    })()
                `;
                const result = await tempConn.evaluate(evalJs);
                logDebug(`[closeWindow] window.close() result: ${JSON.stringify(result)}`);
                closed = true;
            } catch (err) {
                logDebug(`[closeWindow] window.close() failed: ${err}`);
            }

            // 5b. Fallback: process.exit(0)
            if (!closed) {
                try {
                    await tempConn.evaluate('process.exit(0)');
                    logDebug('[closeWindow] Terminated with process.exit(0)');
                    closed = true;
                } catch {
                    logDebug('[closeWindow] Executed process.exit(0) (disconnection expected)');
                    closed = true;
                }
            }

            // 5c. Fallback: Browser.close CDP command
            if (!closed) {
                try {
                    await tempConn.send('Browser.close', {});
                    logDebug('[closeWindow] Closed via Browser.close');
                    closed = true;
                } catch (err) {
                    logDebug(`[closeWindow] Browser.close failed: ${err}`);
                }
            }

            // 6. Wait for window to close and file locks to release
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 7. Verify window actually closed
            try {
                const remainingInstances = await discoverInstances(ports);
                const stillExists = remainingInstances.some(inst => {
                    const wsName = extractWorkspaceName(inst.title);
                    return wsName === workspaceName ||
                        inst.title.includes(workspaceName);
                });
                if (stillExists) {
                    logWarn(`[closeWindow] Window for workspace "${workspaceName}" still exists`);
                    return false;
                }
            } catch {
                // Ignore verification errors
            }

            logDebug(`[closeWindow] Closed window for workspace "${workspaceName}"`);
            return true;
        } finally {
            // Clean up temporary connection
            try {
                tempConn.fullDisconnect();
            } catch {
                // Ignore disconnect errors
            }
        }
    } catch (err) {
        logError(`[closeWindow] Error: ${err}`);
        return false;
    }
}

// ---------------------------------------------------------------------------
// minimizeWindow
// ---------------------------------------------------------------------------

/**
 * Minimises a subagent window.
 *
 * Uses CDP Browser.getWindowForTarget → Browser.setWindowBounds.
 * Runs on a temporary CdpConnection without affecting current connection.
 * Best effort: does not throw on failure.
 *
 * @param ports CDP port list
 * @param workspaceName Workspace name of the window to minimise
 * @returns true: minimised successfully, false: failed
 */
export async function minimizeWindow(
    ports: number[],
    workspaceName: string,
): Promise<boolean> {
    logDebug(`[minimizeWindow] Minimising window for workspace "${workspaceName}"`);

    try {
        // 1. Discover all targets
        const instances = await discoverInstances(ports);
        if (instances.length === 0) {
            logWarn('[minimizeWindow] Target not found');
            return false;
        }

        // 2. Match by workspace name
        let targetInstance: DiscoveredInstance | undefined;
        for (const inst of instances) {
            const wsName = extractWorkspaceName(inst.title);
            if (wsName === workspaceName) {
                targetInstance = inst;
                break;
            }
        }

        if (!targetInstance) {
            logWarn(`[minimizeWindow] Target for workspace "${workspaceName}" not found`);
            return false;
        }

        logDebug(`[minimizeWindow] Found target: "${targetInstance.title}" (${targetInstance.wsUrl})`);

        // 3. Connect via temporary CdpConnection
        const tempConn = new CdpConnection(ports);
        try {
            await tempConn.connectToUrl(targetInstance.wsUrl);
            logDebug('[minimizeWindow] Temporary connection established');

            // 4. Get windowId via Browser.getWindowForTarget
            let windowId: number | undefined;
            try {
                const windowResult = await tempConn.send('Browser.getWindowForTarget', {
                    targetId: targetInstance.id,
                }) as { windowId?: number; bounds?: unknown };
                windowId = windowResult?.windowId;
                logDebug(`[minimizeWindow] windowId=${windowId}`);
            } catch (err) {
                logDebug(`[minimizeWindow] Browser.getWindowForTarget failed: ${err}`);
            }

            if (windowId !== undefined) {
                // 5a. Minimise via Browser.setWindowBounds
                try {
                    await tempConn.send('Browser.setWindowBounds', {
                        windowId,
                        bounds: { windowState: 'minimized' },
                    });
                    logDebug(`[minimizeWindow] Minimised window for workspace "${workspaceName}" (CDP)`);
                    return true;
                } catch (err) {
                    logDebug(`[minimizeWindow] Browser.setWindowBounds failed: ${err}`);
                }
            }

            // 5b. Fallback: Electron BrowserWindow API
            const evalJs = `
                (function() {
                    try {
                        var electron = require('electron');
                        if (electron && electron.remote) {
                            var win = electron.remote.getCurrentWindow();
                            if (win) {
                                win.minimize();
                                return { success: true, method: 'electron.remote' };
                            }
                        }
                    } catch(e) {}
                    try {
                        var mainModule = process.mainModule || require.main;
                        if (mainModule) {
                            var BrowserWindow = mainModule.require('electron').BrowserWindow;
                            var wins = BrowserWindow.getAllWindows();
                            if (wins && wins.length > 0) {
                                wins[0].minimize();
                                return { success: true, method: 'BrowserWindow.getAllWindows' };
                            }
                        }
                    } catch(e2) {}
                    return { success: false, error: 'No minimize method available' };
                })()
            `;

            const result = await tempConn.evaluate(evalJs);
            const resultObj = result as { success?: boolean; method?: string; error?: string } | null;
            logDebug(`[minimizeWindow] Fallback result: ${JSON.stringify(result)}`);

            if (resultObj?.success) {
                logDebug(`[minimizeWindow] Minimised window for workspace "${workspaceName}" (${resultObj.method})`);
                return true;
            }

            logWarn(`[minimizeWindow] Could not minimise window for workspace "${workspaceName}"`);
            return false;
        } finally {
            try {
                tempConn.fullDisconnect();
            } catch {
                // Ignore disconnect errors
            }
        }
    } catch (err) {
        logWarn(`[minimizeWindow] Error: ${err}`);
        return false;
    }
}
