/**
 * LangDetect — Offline language detection for Indian languages
 * Detects Telugu, Hindi (Devanagari), and English from text transcripts.
 * Works entirely offline using Unicode script analysis.
 */
const LangDetect = (function () {
  'use strict';

  // Unicode ranges for Indian scripts
  const RANGES = {
    te: { start: 0x0C00, end: 0x0C7F, name: 'Telugu' },
    hi: { start: 0x0900, end: 0x097F, name: 'Devanagari' },
    en: { start: 0x0000, end: 0x007F, name: 'Latin' },
    ta: { start: 0x0B80, end: 0x0BFF, name: 'Tamil' },
    kn: { start: 0x0C80, end: 0x0CFF, name: 'Kannada' },
    ml: { start: 0x0D00, end: 0x0D7F, name: 'Malayalam' },
    bn: { start: 0x0980, end: 0x09FF, name: 'Bengali' },
    gu: { start: 0x0A80, end: 0x0AFF, name: 'Gujarati' },
    pa: { start: 0x0A00, end: 0x0A7F, name: 'Gurmukhi' },
    or: { start: 0x0B00, end: 0x0B7F, name: 'Odia' },
    mr: { start: 0x0900, end: 0x097F, name: 'Marathi' },  // Same as Devanagari
  };

  // Primary languages we support
  const SUPPORTED = ['te', 'hi', 'en'];

  /**
   * Detect the script of a single character
   */
  function charScript(ch) {
    const code = ch.codePointAt(0);
    for (const [lang, range] of Object.entries(RANGES)) {
      if (code >= range.start && code <= range.end) return lang;
    }
    return null;
  }

  /**
   * Get script ratio for a text string
   * Returns { te: 0.6, hi: 0.2, en: 0.2, ... }
   */
  function getScriptRatio(text) {
    if (!text || !text.trim()) return { te: 0, hi: 0, en: 0 };

    const counts = { te: 0, hi: 0, en: 0, other: 0 };
    let total = 0;

    for (const ch of text) {
      // Skip whitespace and common punctuation
      if (/[\s\d.,!?;:'"()\[\]{}\-+*/=<>@#$%^&|\\~`]/.test(ch)) continue;
      // Skip digits
      if (/\d/.test(ch)) continue;

      const script = charScript(ch);
      if (script && counts.hasOwnProperty(script)) {
        counts[script]++;
      } else if (script) {
        counts.other++;
      }
      total++;
    }

    if (total === 0) return { te: 0, hi: 0, en: 0 };

    return {
      te: counts.te / total,
      hi: counts.hi / total,
      en: counts.en / total,
      other: counts.other / total,
    };
  }

  /**
   * Detect if text is code-mixed (multiple scripts significant)
   */
  function isCodeMixed(text) {
    const ratio = getScriptRatio(text);
    const scripts = SUPPORTED.filter(lang => ratio[lang] > 0.15);
    return scripts.length >= 2;
  }

  /**
   * Detect the primary language of a text string
   * Returns 'te', 'hi', or 'en'
   */
  function detectLanguage(text) {
    if (!text || !text.trim()) return 'en';

    const ratio = getScriptRatio(text);

    // If Telugu script dominates
    if (ratio.te > 0.3) return 'te';

    // If Devanagari script dominates
    if (ratio.hi > 0.3) return 'hi';

    // Default to English
    return 'en';
  }

  /**
   * Get language name from code
   */
  function langName(code) {
    const names = { te: 'Telugu', hi: 'Hindi', en: 'English' };
    return names[code] || 'English';
  }

  /**
   * Get language code for SpeechRecognition API
   */
  function toSTTLang(code) {
    const map = { te: 'te-IN', hi: 'hi-IN', en: 'en-IN' };
    return map[code] || 'en-IN';
  }

  /**
   * Get language code for TTS API
   */
  function toTTSLang(code) {
    const map = { te: 'te-IN', hi: 'hi-IN', en: 'en-IN' };
    return map[code] || 'en-IN';
  }

  /**
   * Detect language from a short transcript (optimized for voice commands)
   * Uses higher threshold for short texts to avoid false positives
   */
  function detectCommandLanguage(text) {
    if (!text || !text.trim()) return 'en';

    const trimmed = text.trim();

    // Very short text — use simple heuristics
    if (trimmed.length <= 3) {
      // Check if any Telugu/Devanagari characters present
      for (const ch of trimmed) {
        const code = ch.codePointAt(0);
        if (code >= 0x0C00 && code <= 0x0C7F) return 'te';
        if (code >= 0x0900 && code <= 0x097F) return 'hi';
      }
      return 'en';
    }

    return detectLanguage(trimmed);
  }

  // Public API
  return {
    detect: detectLanguage,
    detectCommand: detectCommandLanguage,
    getScriptRatio,
    isCodeMixed,
    charScript,
    langName,
    toSTTLang,
    toTTSLang,
    SUPPORTED,
  };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.LangDetect = LangDetect;
}
