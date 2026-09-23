// Lifelong Navigator color system (Ret1re.com brand, "Option A1").
//
// Filing-scenario colors are the data: each filing age keeps one color on every tab and in the
// Lifelong Timeline. Retirement-stage colors are planning context only and deliberately share no
// hue with the scenarios, so no one reads a Go-Go band as "the age-62 line."

// File at 62 = terracotta, Preferred = light blue (intentionally quieter), File at 70 = forest green.
export const SCENARIO_COLORS = {
    age62: '#C2674E',
    preferred: '#8FB0D1',
    age70: '#1F6B52',
    hybrid: '#6E5A86', // "File at 62/70" split strategy
};

// Lighter companions, for secondary series such as "since 70" bars.
export const SCENARIO_TINTS = {
    age62: '#DDA08F',
    preferred: '#C5D7E9',
    age70: '#7FAF98',
    hybrid: '#A898BC',
};

// Darker versions for text and small marks, where the fill colors lack contrast on white.
export const SCENARIO_INK = {
    age62: '#9E4F3A',
    preferred: '#3E6A94',
    age70: '#1F6B52',
    hybrid: '#5A4870',
};

// Warm-stone ramp built from brand sand tokens: Go-Go (deepest) fading to No-Go (palest).
export const STAGE_COLORS = {
    goGo: { bg: '#CFC2AE', text: '#3F3833' },
    slowGo: { bg: '#E0D6C6', text: '#4E4743' },
    noGo: { bg: '#EFE9DF', text: '#6E655D' },
};
export const STAGE_GRIP_COLOR = '#4E4743';
export const STAGE_BORDER_COLOR = '#E6DDD0';

// Non-scenario reference marks.
export const REFERENCE_COLORS = {
    fra: '#4E4743', // Full Retirement Age milestone: a neutral reference point, not a filing choice
    cursor: '#10467A', // brand navy: the "you are looking at this year" line
    marker: '#4E4743', // generic guide lines / annotations
};

// Financial signal system (design-system tokens).
export const SIGNAL_COLORS = {
    gain: '#1E6840',
    gainSoft: '#D6F0E3',
    loss: '#9B2626',
    lossSoft: '#F5E0E0',
    caution: '#A67C00',
    cautionSoft: '#E9D39A',
};

// Neutral chart chrome.
export const CHART_CHROME = {
    ink: '#2D3748',
    axisText: '#4E4743',
    mutedText: '#8C8278',
    grid: '#ECE6DC',
    baseline: '#C8BBAB',
    gap: '#D8CFC2',
};

export const withAlpha = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
