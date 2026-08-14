/**
 * i18n module — Language switching logic and t() helper
 *
 * Retrieves the language from VS Code configuration antiCrow.language via getLanguage(),
 * and returns corresponding messages. Defaults to 'en'.
 */

import { messages as jaMessages, PROMPT_RULES_MD as jaPromptRules, type MessageKey } from './ja';
import { messages as enMessages, PROMPT_RULES_MD as enPromptRules } from './en';

// ---------------------------------------------------------------------------
// Language definitions
// ---------------------------------------------------------------------------

export type Language = 'ja' | 'en';

// Message values can be string or readonly string[] (e.g. dayNames)
type MessageMap = Record<string, string | readonly string[]>;

const messagesMap: Record<Language, MessageMap> = {
    en: enMessages,
    ja: jaMessages,
};

const promptRulesMap: Record<Language, string> = {
    en: enPromptRules,
    ja: jaPromptRules,
};

// ---------------------------------------------------------------------------
// Get current language (lazy evaluation)
// ---------------------------------------------------------------------------

/**
 * Retrieves current language setting.
 * Uses lazy require to avoid circular dependencies with configHelper.
 */
function getCurrentLanguage(): Language {
    try {
        const { getLanguage } = require('../configHelper');
        return getLanguage() as Language;
    } catch {
        return 'en';
    }
}

// ---------------------------------------------------------------------------
// t() helper — Get localised string from message key
// ---------------------------------------------------------------------------

/**
 * Returns localised string corresponding to a message key.
 * Placeholders {0}, {1}, ... or {name} are substituted with arguments.
 *
 * @example
 * t('confirm.title')                    // "📋 **Execution Confirmation**"
 * t('confirm.summary', 'Summary text')  // "**Summary:** Summary text"
 * t('prompt.view_file_instruction', '/path/to/file')
 */
export function t(key: MessageKey, ...args: (string | number)[]): string {
    const lang = getCurrentLanguage();
    const msgs = messagesMap[lang] || messagesMap.en;
    const value = msgs[key];

    if (value === undefined) {
        // Fallback: Check en, then ja, or return key
        const fallback = enMessages[key] || jaMessages[key];
        if (fallback === undefined) { return key; }
        if (typeof fallback === 'string') {
            return replacePlaceholders(fallback, args);
        }
        return String(fallback);
    }

    if (typeof value === 'string') {
        return replacePlaceholders(value, args);
    }

    return value as unknown as string;
}

/**
 * Returns localised array corresponding to an array-type message key.
 */
export function tArray(key: MessageKey): string[] {
    const lang = getCurrentLanguage();
    const msgs = messagesMap[lang] || messagesMap.en;
    const value = msgs[key];

    if (Array.isArray(value)) {
        return value as unknown as string[];
    }
    // Fallback
    const fallback = enMessages[key] || jaMessages[key];
    if (Array.isArray(fallback)) {
        return fallback as unknown as string[];
    }
    return [];
}

/**
 * Returns the full PROMPT_RULES_MD corresponding to the current language.
 */
export function getLocalizedPromptRules(): string {
    const lang = getCurrentLanguage();
    return promptRulesMap[lang] || promptRulesMap.en;
}

// ---------------------------------------------------------------------------
// プレースホルダー置換ユーティリティ
// ---------------------------------------------------------------------------

function replacePlaceholders(template: string, args: (string | number)[]): string {
    if (args.length === 0) { return template; }
    let result = template;
    for (let i = 0; i < args.length; i++) {
        result = result.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
    }
    return result;
}

// 型情報の再エクスポート
export type { MessageKey };
