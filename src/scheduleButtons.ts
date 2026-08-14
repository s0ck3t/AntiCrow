// ---------------------------------------------------------------------------
// scheduleButtons.ts — Discord インタラクティブボタン UI for スケジュール管理
// ---------------------------------------------------------------------------

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { Plan } from './types';
import { DateTime } from 'luxon';
import { getTimezone } from './configHelper';

// -----------------------------------------------------------------------
// 次回実行時刻の簡易算出
// -----------------------------------------------------------------------

/**
 * cron 式から次回実行時刻の表示用文字列を返す。
 * node-cron は nextDate() を持たないため、luxon で簡易推定する。
 */
export function getNextRunDisplay(cron: string, timezone: string = getTimezone()): string {
    try {
        const parts = cron.split(/\s+/);
        if (parts.length !== 5) { return '—'; }

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        const now = DateTime.now().setZone(timezone);

        // 簡易推定: 分と時が固定の場合のみ正確に計算
        if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            // 毎日 HH:MM のパターン
            let next = now.set({ hour: parseInt(hour), minute: parseInt(minute), second: 0, millisecond: 0 });
            if (next <= now) { next = next.plus({ days: 1 }); }
            return next.toFormat('MM/dd HH:mm');
        }

        if (minute !== '*' && hour === '*') {
            // 毎時 XX 分のパターン
            let next = now.set({ minute: parseInt(minute), second: 0, millisecond: 0 });
            if (next <= now) { next = next.plus({ hours: 1 }); }
            return next.toFormat('HH:mm');
        }

        // */N 分パターン
        const everyMatch = minute.match(/^\*\/(\d+)$/);
        if (everyMatch && hour === '*') {
            const interval = parseInt(everyMatch[1]);
            const currentMin = now.minute;
            const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
            let next = now.set({ minute: nextMin % 60, second: 0, millisecond: 0 });
            if (nextMin >= 60) { next = next.plus({ hours: 1 }).set({ minute: nextMin % 60 }); }
            return next.toFormat('HH:mm');
        }

        return 'Follows cron schedule';
    } catch {
        return '—';
    }
}

// -----------------------------------------------------------------------
// cron 式の人間可読表示
// -----------------------------------------------------------------------

export function cronToHuman(cron: string): string {
    const parts = cron.split(/\s+/);
    if (parts.length !== 5) { return cron; }

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    // */N min
    const everyMatch = minute.match(/^\*\/(\d+)$/);
    if (everyMatch && hour === '*') {
        return `Every ${everyMatch[1]} min`;
    }

    // Every minute
    if (minute === '*' && hour === '*') { return 'Every minute'; }

    // Every hour
    if (minute !== '*' && hour === '*') {
        return `Hourly at :${minute.padStart(2, '0')}`;
    }

    // Daily
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && dayOfWeek === '*') {
        return `Daily at ${hour}:${minute.padStart(2, '0')}`;
    }

    // Weekly
    if (dayOfWeek !== '*') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
        return `Every ${dayName} at ${hour}:${minute.padStart(2, '0')}`;
    }

    // Monthly
    if (dayOfMonth !== '*') {
        return `Monthly on day ${dayOfMonth} at ${hour}:${minute.padStart(2, '0')}`;
    }

    return cron;
}

// -----------------------------------------------------------------------
// 自然文 → cron 式変換（簡易パーサー）
// -----------------------------------------------------------------------

const DAY_MAP: Record<string, string> = {
    '月': '1', '火': '2', '水': '3', '木': '4', '金': '5', '土': '6', '日': '0',
    '月曜': '1', '火曜': '2', '水曜': '3', '木曜': '4', '金曜': '5', '土曜': '6', '日曜': '0',
    '月曜日': '1', '火曜日': '2', '水曜日': '3', '木曜日': '4', '金曜日': '5', '土曜日': '6', '日曜日': '0',
};

/**
 * 自然文のスケジュール指示を cron 式に変換する。
 * 対応パターン:
 *   - 「毎日9時」「毎日 09:30」→ 分 時 * * *
 *   - 「毎時」「毎時15分」→ 分 * * * *
 *   - 「N分おき」「N時間おき」→ * /N パターン
 *   - 「毎週月曜の10時」「毎週水曜 14:30」→ 分 時 * * 曜日
 *   - 「平日の18時」→ 分 時 * * 1-5
 *   - 「毎月1日の9時」→ 分 時 日 * *
 *   - 既に cron 式（5項目）の場合はそのまま返す
 * 変換不能な場合は null を返す。
 */
export function naturalTextToCron(text: string): string | null {
    const t = text.trim();

    // 既に cron 式（5項目）の場合
    if (/^[0-9*\/,-]+\s+[0-9*\/,-]+\s+[0-9*\/,-]+\s+[0-9*\/,-]+\s+[0-9*\/,-]+$/.test(t)) {
        return t;
    }

    // 時刻パース補助: 「9時」「09:30」「9時30分」→ { hour, minute }
    const parseTime = (s: string): { hour: number; minute: number } | null => {
        // HH:MM or H:MM
        const colonMatch = s.match(/(\d{1,2}):(\d{2})/);
        if (colonMatch) {
            return { hour: parseInt(colonMatch[1]), minute: parseInt(colonMatch[2]) };
        }
        // N時M分
        const hmMatch = s.match(/(\d{1,2})\s*時\s*(\d{1,2})\s*分/);
        if (hmMatch) {
            return { hour: parseInt(hmMatch[1]), minute: parseInt(hmMatch[2]) };
        }
        // N時（分省略=0）
        const hMatch = s.match(/(\d{1,2})\s*時/);
        if (hMatch) {
            return { hour: parseInt(hMatch[1]), minute: 0 };
        }
        return null;
    };

    // N分おき / N分ごと / N分毎 / N分間隔
    const everyMinMatch = t.match(/(\d+)\s*分\s*(おき|ごと|毎|間隔)/);
    if (everyMinMatch) {
        const n = parseInt(everyMinMatch[1]);
        if (n >= 1 && n <= 59) {
            return `*/${n} * * * *`;
        }
    }

    // N時間おき / N時間ごと / N時間毎 / N時間間隔
    const everyHourMatch = t.match(/(\d+)\s*時間\s*(おき|ごと|毎|間隔)/);
    if (everyHourMatch) {
        const n = parseInt(everyHourMatch[1]);
        if (n >= 1 && n <= 23) {
            return `0 */${n} * * *`;
        }
    }

    // 毎時 / 毎時N分
    if (/毎時/.test(t)) {
        const minMatch = t.match(/(\d{1,2})\s*分/);
        const minute = minMatch ? parseInt(minMatch[1]) : 0;
        return `${minute} * * * *`;
    }

    // 毎月N日
    const monthlyMatch = t.match(/毎月\s*(\d{1,2})\s*日/);
    if (monthlyMatch) {
        const day = parseInt(monthlyMatch[1]);
        const time = parseTime(t);
        const h = time?.hour ?? 0;
        const m = time?.minute ?? 0;
        return `${m} ${h} ${day} * *`;
    }

    // 平日
    if (/平日/.test(t)) {
        const time = parseTime(t);
        const h = time?.hour ?? 9;
        const m = time?.minute ?? 0;
        return `${m} ${h} * * 1-5`;
    }

    // 毎週 + 曜日
    const weeklyMatch = t.match(/毎週\s*([月火水木金土日](?:曜(?:日)?)?)/)
        || t.match(/([月火水木金土日](?:曜(?:日)?)?)\s*(?:の|に)?/);
    if (weeklyMatch) {
        const dayKey = weeklyMatch[1];
        const dow = DAY_MAP[dayKey];
        if (dow !== undefined) {
            const time = parseTime(t);
            const h = time?.hour ?? 0;
            const m = time?.minute ?? 0;
            return `${m} ${h} * * ${dow}`;
        }
    }

    // 毎日 + 時刻
    if (/毎日|毎朝|毎晩|毎夜|毎夕/.test(t)) {
        const time = parseTime(t);
        if (time) {
            return `${time.minute} ${time.hour} * * *`;
        }
        // 毎朝/毎晩のデフォルト
        if (/毎朝/.test(t)) return '0 9 * * *';
        if (/毎晩|毎夜/.test(t)) return '0 21 * * *';
        if (/毎夕/.test(t)) return '0 18 * * *';
        // 毎日（時刻省略）→ 毎日0時
        return '0 0 * * *';
    }

    // 時刻のみ（「9時」「14:30」）→ 毎日と解釈
    const time = parseTime(t);
    if (time) {
        return `${time.minute} ${time.hour} * * *`;
    }

    return null;
}

// -----------------------------------------------------------------------
// 状態バッジ
// -----------------------------------------------------------------------

function statusBadge(status: string, wsName?: string, runningWsNames?: Set<string>): string {
    if (status === 'active') {
        if (runningWsNames && wsName && !runningWsNames.has(wsName)) {
            return '🟡'; // Waiting for connection
        }
        return '🟢'; // Running
    }
    if (status === 'paused') return '🔴';
    if (status === 'pending_confirmation') return '⏳';
    if (status === 'completed') return '✅';
    return '❓';
}

// -----------------------------------------------------------------------
// スケジュール一覧 Embed + ボタン
// -----------------------------------------------------------------------

export function buildScheduleListEmbed(
    plans: Plan[],
    timezone: string = getTimezone(),
    runningWsNames?: Set<string>,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const scheduledPlans = plans.filter(p => p.cron);

    const guideText = [
        '\n📖 **Variables Guide**',
        '**Built-in variables:** `{{date}}` `{{time}}` `{{datetime}}` `{{year}}` `{{month}}` `{{day}}`',
        '**Environment variables:** `{{env:VARIABLE_NAME}}` — Expands OS environment variables',
        '> ⚠️ Custom arguments (`{{xxx}}`) cannot be used in scheduled tasks because modal input is unavailable',
    ].join('\n');

    const newButton = new ButtonBuilder()
        .setCustomId('sched_new')
        .setLabel('➕ New Schedule')
        .setStyle(ButtonStyle.Success);

    const embed = new EmbedBuilder()
        .setTitle('📅 Schedule Management')
        .setColor(0x5865F2)
        .setTimestamp();

    if (scheduledPlans.length === 0) {
        embed.setDescription('No scheduled tasks registered.\nYou can add a schedule using the "➕ New Schedule" button.' + guideText);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(newButton);
        return { embeds: [embed], components: [row] };
    }

    // Group by workspace
    const grouped = new Map<string, Plan[]>();
    for (const plan of scheduledPlans) {
        const wsKey = plan.workspace_name || 'Unassigned';
        if (!grouped.has(wsKey)) { grouped.set(wsKey, []); }
        grouped.get(wsKey)!.push(plan);
    }

    const wsCount = grouped.size;
    embed.setDescription(`${scheduledPlans.length} schedule(s) (${wsCount} workspace(s))` + guideText);

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    let fieldCount = 0;

    for (const [wsName, wsPlans] of grouped) {
        // Workspace section header
        if (fieldCount < 25) {
            embed.addFields({
                name: `📁 ${wsName}`,
                value: `${wsPlans.length} schedule(s)`,
            });
            fieldCount++;
        }

        for (const plan of wsPlans.slice(0, 10)) {
            if (fieldCount >= 25) { break; } // Discord Embed limit

            const badge = statusBadge(plan.status, plan.workspace_name, runningWsNames);
            const humanCron = cronToHuman(plan.cron!);
            const nextRun = plan.status === 'active'
                ? getNextRunDisplay(plan.cron!, timezone)
                : '(Paused)';
            const summary = plan.human_summary || plan.prompt.substring(0, 60);
            const execCount = plan.execution_count || 0;
            const lastExec = plan.last_executed_at
                ? DateTime.fromISO(plan.last_executed_at).setZone(timezone).toFormat('MM/dd HH:mm')
                : 'None';

            embed.addFields({
                name: `${badge} ${summary}`,
                value: [
                    `📁 ${wsName}`,
                    `⏰ \`${plan.cron}\` (${humanCron})`,
                    `▶️ Next: ${nextRun} | Runs: ${execCount} | Last: ${lastExec}`,
                    `🆔 \`${plan.plan_id.substring(0, 8)}...\``,
                ].join('\n'),
            });
            fieldCount++;

            const toggleLabel = plan.status === 'active' ? '⏸️ Pause' : '▶️ Resume';
            const toggleStyle = plan.status === 'active' ? ButtonStyle.Secondary : ButtonStyle.Success;

            if (components.length < 5) { // ActionRow limit 5
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sched_run_${plan.plan_id}`)
                        .setLabel('▶️ Run Now')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`sched_edit_${plan.plan_id}`)
                        .setLabel('✏️ Edit')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`sched_toggle_${plan.plan_id}`)
                        .setLabel(toggleLabel)
                        .setStyle(toggleStyle),
                    new ButtonBuilder()
                        .setCustomId(`sched_delete_${plan.plan_id}`)
                        .setLabel('🗑️ Delete')
                        .setStyle(ButtonStyle.Danger),
                );
                components.push(row);
            }
        }
    }

    // Action row: New + Refresh
    const refreshButton = new ButtonBuilder()
        .setCustomId('sched_list')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary);

    if (components.length < 5) {
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(newButton, refreshButton);
        components.push(actionRow);
    } else if (components.length > 0) {
        const lastRow = components[components.length - 1];
        if (lastRow.components.length < 4) {
            lastRow.addComponents(newButton, refreshButton);
        } else if (lastRow.components.length < 5) {
            lastRow.addComponents(refreshButton);
        }
    }

    return { embeds: [embed], components };
}

// -----------------------------------------------------------------------
// 削除確認 Embed
// -----------------------------------------------------------------------

export function buildDeleteConfirmEmbed(
    plan: Plan,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Deletion')
        .setDescription([
            `**${plan.human_summary || plan.prompt.substring(0, 60)}**`,
            '',
            `cron: \`${plan.cron}\``,
            `ID: \`${plan.plan_id}\``,
            '',
            'This action cannot be undone. Are you sure you want to delete this schedule?',
        ].join('\n'))
        .setColor(0xED4245);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`sched_confirm_delete_${plan.plan_id}`)
            .setLabel('✅ Delete')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('sched_cancel_delete')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
}
