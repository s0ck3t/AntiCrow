// ---------------------------------------------------------------------------
// modeButtons.ts — Discord インタラクティブボタン UI for モード管理
// ---------------------------------------------------------------------------

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

// -----------------------------------------------------------------------
// モード一覧 Embed + 切替ボタン
// -----------------------------------------------------------------------

export function buildModeListEmbed(
    modes: string[],
    currentMode: string | null,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
        .setTitle('⚡ Mode Management')
        .setColor(0x5865F2)
        .setTimestamp();

    if (modes.length === 0 && !currentMode) {
        embed.setDescription(
            'Could not retrieve mode information.\n' +
            'Please ensure the chat panel is open.',
        );
        return { embeds: [embed], components: [] };
    }

    // Current mode
    const currentDisplay = currentMode || 'Unknown';
    embed.setDescription(`**Current Mode:** ${currentDisplay}`);

    // Add modes list to field
    if (modes.length > 0) {
        const normalizedCurrent = currentMode?.trim().toLowerCase() || '';
        const modeList = modes.map((m) => {
            const mLower = m.trim().toLowerCase();
            const isCurrent = normalizedCurrent.length > 0 && (
                mLower === normalizedCurrent ||
                mLower.includes(normalizedCurrent) ||
                normalizedCurrent.includes(mLower)
            );
            return `${isCurrent ? '✅' : '⬜'} ${m}`;
        }).join('\n');

        embed.addFields({
            name: `📋 Available Modes (${modes.length})`,
            value: modeList.length > 1024 ? modeList.substring(0, 1021) + '...' : modeList,
        });
    }

    // Create buttons (switch button per mode)
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Group modes into ActionRows of 5
    const normalizedCurrentBtn = currentMode?.trim().toLowerCase() || '';
    const displayModes = modes.slice(0, 20);
    for (let i = 0; i < displayModes.length; i += 5) {
        if (components.length >= 4) break; // Reserve 1 row for refresh

        const row = new ActionRowBuilder<ButtonBuilder>();
        const chunk = displayModes.slice(i, i + 5);

        for (let j = 0; j < chunk.length; j++) {
            const mode = chunk[j];
            const modeLower = mode.trim().toLowerCase();
            const isCurrent = normalizedCurrentBtn.length > 0 && (
                modeLower === normalizedCurrentBtn ||
                modeLower.includes(normalizedCurrentBtn) ||
                normalizedCurrentBtn.includes(modeLower)
            );
            // Index-based custom_id for uniqueness
            const modeIndex = i + j;

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mode_select_${modeIndex}`)
                    .setLabel(mode.length > 20 ? mode.substring(0, 17) + '...' : mode)
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
                .setCustomId('mode_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary),
        );
        components.push(refreshRow);
    }

    return { embeds: [embed], components };
}

// -----------------------------------------------------------------------
// Mode Switch Result Embed
// -----------------------------------------------------------------------

export function buildModeSwitchResultEmbed(
    modeName: string,
    success: boolean,
): EmbedBuilder {
    if (success) {
        return new EmbedBuilder()
            .setTitle('✅ Mode Switched')
            .setDescription(`Switched to **${modeName}**.`)
            .setColor(0x57F287)
            .setTimestamp();
    } else {
        return new EmbedBuilder()
            .setTitle('❌ Mode Switch Failed')
            .setDescription(
                `Failed to switch to **${modeName}**.\n` +
                'Please ensure the chat panel is open and try again.',
            )
            .setColor(0xED4245)
            .setTimestamp();
    }
}
