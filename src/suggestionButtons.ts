// ---------------------------------------------------------------------------
// suggestionButtons.ts — インテリジェント提案の Discord UI
// ---------------------------------------------------------------------------
// 責務:
//   1. SuggestionItem[] から Discord ActionRow ボタンを生成
//   2. 提案の一時保存と取得（ボタンクリック時に prompt を復元するため）
// ---------------------------------------------------------------------------

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { SuggestionItem } from './suggestionParser';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ボタン customId のプレフィックス */
export const SUGGEST_BUTTON_PREFIX = 'suggest_';

/** 「エージェントに任せる」ボタンの固定 customId */
export const SUGGEST_AUTO_ID = 'suggest_auto';

/** 「連続オートモードで実行」ボタンの固定 customId（Phase 3: /suggest → /auto 連携） */
export const SUGGEST_AUTO_MODE_ID = 'suggest_auto_mode';

/** AI判断ボタン押下時に実行されるプロンプト */
/** Prompt executed when AI judgment button is clicked */
export const AUTO_PROMPT = 'Evaluate the current situation and execute the next appropriate action according to agent discretion';

// ---------------------------------------------------------------------------
// Temporary store (in-memory)
// ---------------------------------------------------------------------------

/** channelId → SuggestionItem[] map (referenced on button click) */
const pendingSuggestions = new Map<string, { items: SuggestionItem[] }>();

/**
 * Temporarily stores suggestions (retrievable upon button clicks).
 * Managed per channelId. Overwritten when new suggestions arrive.
 */
export function storeSuggestions(channelId: string, items: SuggestionItem[]): void {
    pendingSuggestions.set(channelId, { items });
}

/**
 * Retrieves suggestion by channelId + index.
 * Returns null if suggestions are overwritten by a new response.
 */
export function getSuggestion(channelId: string, index: number): SuggestionItem | null {
    const entry = pendingSuggestions.get(channelId);
    if (!entry) return null;
    return entry.items[index] ?? null;
}

/**
 * Retrieves all suggestions stored for a channelId.
 * Referenced as context when "Let Agent Decide" button is clicked.
 */
export function getAllSuggestions(channelId: string): SuggestionItem[] | null {
    const entry = pendingSuggestions.get(channelId);
    if (!entry) return null;
    return entry.items;
}

// ---------------------------------------------------------------------------
// Discord UI Builder
// ---------------------------------------------------------------------------

/** Emoji prefix */
const SUGGESTION_EMOJIS = ['💡', '🔧', '🚀'];

/**
 * Generates Discord ActionRow button row from suggestion items.
 * Returns null if there are no suggestions.
 * @param wsKey Workspace key. When specified, embeds into customId as `{baseId}:{wsKey}`
 */
export function buildSuggestionRow(
    items: SuggestionItem[],
    wsKey?: string,
): ActionRowBuilder<ButtonBuilder> | null {
    if (items.length === 0) return null;

    /** Helper to append `:wsKey` if wsKey exists */
    const withWs = (baseId: string) => wsKey ? `${baseId}:${wsKey}` : baseId;

    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 0; i < items.length && i < 3; i++) {
        const emoji = SUGGESTION_EMOJIS[i] || '💡';
        const button = new ButtonBuilder()
            .setCustomId(withWs(`${SUGGEST_BUTTON_PREFIX}${i}`))
            .setLabel(items[i].label)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji);
        row.addComponents(button);
    }

    // Append "🤖 Let Agent Decide" button to the end
    const autoButton = new ButtonBuilder()
        .setCustomId(withWs(SUGGEST_AUTO_ID))
        .setLabel('Let Agent Decide')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🤖');
    row.addComponents(autoButton);

    // Phase 3: Append "🔄 Run in Continuous Auto Mode" button (/suggest → /auto)
    // Discord ActionRow limit is 5 buttons. Suggestions (up to 3) + auto + auto_mode = 5.
    const currentButtonCount = Math.min(items.length, 3) + 1; // suggestion buttons + autoButton
    if (currentButtonCount < 5) {
        const autoModeButton = new ButtonBuilder()
            .setCustomId(withWs(SUGGEST_AUTO_MODE_ID))
            .setLabel('Run in Continuous Auto Mode')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄');
        row.addComponents(autoModeButton);
    }

    return row;
}

/**
 * Generates content text with descriptions from suggestion items.
 * If any suggestion has a description, renders as a numbered list above buttons.
 * Otherwise returns default heading.
 */
export function buildSuggestionContent(items: SuggestionItem[]): string {
    const hasDescription = items.some(item => item.description);
    if (!hasDescription) {
        return '💡 **Next Action Suggestions**';
    }

    const lines = ['💡 **Next Action Suggestions**', ''];
    for (let i = 0; i < items.length && i < 3; i++) {
        const emoji = SUGGESTION_EMOJIS[i] || '💡';
        const desc = items[i].description || items[i].label;
        lines.push(`${emoji} **${items[i].label}** — ${desc}`);
    }
    return lines.join('\n');
}
