// ---------------------------------------------------------------------------
// modelButtons.ts — Discord インタラクティブボタン UI for モデル管理
// ---------------------------------------------------------------------------

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { ModelQuota } from './quotaProvider';

// -----------------------------------------------------------------------
// クォータヘルパー
// -----------------------------------------------------------------------

function quotaEmoji(percentage: number): string {
    if (percentage <= 0) return '🔴';
    if (percentage <= 20) return '🟠';
    if (percentage <= 50) return '🟡';
    return '🟢';
}

function findQuota(modelName: string, quotas?: ModelQuota[]): ModelQuota | undefined {
    if (!quotas || quotas.length === 0) { return undefined; }
    const lower = modelName.toLowerCase();
    // 1. 完全一致
    const exact = quotas.find(q =>
        q.displayName.toLowerCase() === lower ||
        q.name.toLowerCase() === lower,
    );
    if (exact) { return exact; }
    // 2. 部分一致（モデル名がクォータ名に含まれる or その逆）
    return quotas.find(q => {
        const dn = q.displayName.toLowerCase();
        const n = q.name.toLowerCase();
        return dn.includes(lower) || lower.includes(dn) ||
            n.includes(lower) || lower.includes(n);
    });
}

function formatResetTime(q: ModelQuota): string {
    if (!q.timeUntilResetFormatted || q.timeUntilResetFormatted === 'N/A') return '';
    return ` ⏳${q.timeUntilResetFormatted}`;
}

// -----------------------------------------------------------------------
// モデル一覧 Embed + 切替ボタン
// -----------------------------------------------------------------------

export function buildModelListEmbed(
    models: string[],
    currentModel: string | null,
    quotas?: ModelQuota[],
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
        .setTitle('🤖 Model Management')
        .setColor(0x5865F2)
        .setTimestamp();

    if (models.length === 0 && !currentModel) {
        embed.setDescription(
            'Could not retrieve model information.\n' +
            'Please ensure the chat panel is open.',
        );
        return { embeds: [embed], components: [] };
    }

    // Current model
    const currentDisplay = currentModel || 'Unknown';
    const currentQuota = currentModel ? findQuota(currentModel, quotas) : undefined;
    const currentExtra = currentQuota ? ` (${quotaEmoji(currentQuota.remainingPercentage)} ${currentQuota.remainingPercentage}%${formatResetTime(currentQuota)})` : '';
    embed.setDescription(`**Current Model:** ${currentDisplay}${currentExtra}`);

    // Add models list to field
    if (models.length > 0) {
        const normalizedCurrent = currentModel?.trim().toLowerCase() || '';
        const modelList = models.map((m) => {
            const mLower = m.trim().toLowerCase();
            const isCurrent = normalizedCurrent.length > 0 && (
                mLower === normalizedCurrent ||
                mLower.includes(normalizedCurrent) ||
                normalizedCurrent.includes(mLower)
            );
            const q = findQuota(m, quotas);
            const quotaStr = q ? ` ${quotaEmoji(q.remainingPercentage)} ${q.remainingPercentage}%${formatResetTime(q)}` : '';
            return `${isCurrent ? '✅' : '⬜'} ${m}${quotaStr}`;
        }).join('\n');

        embed.addFields({
            name: `📋 Available Models (${models.length})`,
            value: modelList.length > 1024 ? modelList.substring(0, 1021) + '...' : modelList,
        });
    }

    // Create buttons (switch button per model)
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Group models into ActionRows of 5 (1 row = 5 buttons, max 4 rows = 20 models)
    const normalizedCurrentBtn = currentModel?.trim().toLowerCase() || '';
    const displayModels = models.slice(0, 20);
    for (let i = 0; i < displayModels.length; i += 5) {
        if (components.length >= 4) break; // Reserve 1 row for refresh

        const row = new ActionRowBuilder<ButtonBuilder>();
        const chunk = displayModels.slice(i, i + 5);

        for (let j = 0; j < chunk.length; j++) {
            const model = chunk[j];
            const modelLower = model.trim().toLowerCase();
            const isCurrent = normalizedCurrentBtn.length > 0 && (
                modelLower === normalizedCurrentBtn ||
                modelLower.includes(normalizedCurrentBtn) ||
                normalizedCurrentBtn.includes(modelLower)
            );
            // Index-based custom_id for uniqueness
            const modelIndex = i + j;

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`model_select_${modelIndex}`)
                    .setLabel(model.length > 20 ? model.substring(0, 17) + '...' : model)
                    .setStyle(isCurrent ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(!!isCurrent),
            );
        }

        components.push(row);
    }

    // Refresh button
    if (components.length < 5) {
        const refreshRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('model_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary),
        );
        components.push(refreshRow);
    }

    return { embeds: [embed], components };
}

// -----------------------------------------------------------------------
// Model Switch Result Embed
// -----------------------------------------------------------------------

export function buildModelSwitchResultEmbed(
    modelName: string,
    success: boolean,
): EmbedBuilder {
    if (success) {
        return new EmbedBuilder()
            .setTitle('✅ Model Switched')
            .setDescription(`Switched to **${modelName}**.`)
            .setColor(0x57F287)
            .setTimestamp();
    } else {
        return new EmbedBuilder()
            .setTitle('❌ Model Switch Failed')
            .setDescription(
                `Failed to switch to **${modelName}**.\n` +
                'Please ensure the chat panel is open and try again.',
            )
            .setColor(0xED4245)
            .setTimestamp();
    }
}
