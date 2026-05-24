export interface Theme {
  id: string;
  name: string;
  desc: string;
  bgMain: string;       // e.g., "bg-[#0a0a0a]" or "bg-black"
  bgHeader: string;     // e.g., "bg-[#0d0d0d]/80"
  bgNav: string;        // e.g., "bg-[#0d0d0d]"
  bgCard: string;       // list item or card backgrounds
  border: string;       // standard borders
  borderActive: string; // active tab / highlighted borders
  textMain: string;     // default body text
  textMuted: string;    // muted text
  accentText: string;   // e.g., "text-rose-500" or "text-emerald-400"
  accentBg: string;     // e.g., "bg-rose-600 hover:bg-rose-500"
  accentBorder: string; // e.g., "border-rose-900/30"
  badgeBg: string;      // e.g., "bg-rose-600"
  badgeText: string;    // badge text color
  bubbleMe: string;     // our chat bubbles
  bubbleOther: string;  // incoming message bubbles
  ghostAccent: string;  // ghost mode accent color
  glowClass: string;    // glowing box shadow effect class (if any)
}

export const THEMES: Record<string, Theme> = {
  ghostwire: {
    id: 'ghostwire',
    name: 'GhostWire Classic',
    desc: 'Tactical twilight dark mode with rose red accents.',
    bgMain: 'bg-[#0a0a0a]',
    bgHeader: 'bg-[#0d0d0d]/80',
    bgNav: 'bg-[#0d0d0d]',
    bgCard: 'bg-zinc-900/40 border border-zinc-900',
    border: 'border-zinc-900',
    borderActive: 'border-zinc-800',
    textMain: 'text-white',
    textMuted: 'text-zinc-500',
    accentText: 'text-rose-500',
    accentBg: 'bg-white hover:bg-zinc-200 text-black',
    accentBorder: 'border-rose-900/30',
    badgeBg: 'bg-blue-500',
    badgeText: 'text-white',
    bubbleMe: 'bg-zinc-900 text-white border border-zinc-850',
    bubbleOther: 'bg-[#0d0d0d] text-zinc-300 border border-zinc-900/40',
    ghostAccent: 'text-blue-400',
    glowClass: 'shadow-[0_0_15px_rgba(244,63,94,0.15)]'
  },
  override: {
    id: 'override',
    name: 'Neon Override',
    desc: 'Pure ink-black backplane with searing neon red contrast.',
    bgMain: 'bg-black',
    bgHeader: 'bg-[#050505]/95',
    bgNav: 'bg-[#030303]',
    bgCard: 'bg-zinc-950 border border-zinc-800',
    border: 'border-zinc-800',
    borderActive: 'border-zinc-600',
    textMain: 'text-slate-100',
    textMuted: 'text-zinc-400',
    accentText: 'text-red-500',
    accentBg: 'bg-red-600 hover:bg-red-500 text-white',
    accentBorder: 'border-red-500/40',
    badgeBg: 'bg-red-600',
    badgeText: 'text-white',
    bubbleMe: 'bg-red-950/40 text-rose-100 border border-red-900/50',
    bubbleOther: 'bg-zinc-900 text-zinc-100 border border-zinc-850',
    ghostAccent: 'text-sky-400',
    glowClass: 'shadow-[0_0_20px_rgba(239,68,68,0.35)]'
  },
  monochrome: {
    id: 'monochrome',
    name: 'OLED Monochrome',
    desc: 'Ultra high-contrast clinical white-on-black layout.',
    bgMain: 'bg-black',
    bgHeader: 'bg-black',
    bgNav: 'bg-black border-t border-zinc-800',
    bgCard: 'bg-black border-2 border-zinc-700',
    border: 'border-zinc-800',
    borderActive: 'border-white',
    textMain: 'text-white',
    textMuted: 'text-zinc-300',
    accentText: 'text-white font-black',
    accentBg: 'bg-white hover:bg-zinc-200 text-black',
    accentBorder: 'border-white',
    badgeBg: 'bg-white',
    badgeText: 'text-black',
    bubbleMe: 'bg-zinc-900 text-white border-2 border-zinc-600',
    bubbleOther: 'bg-black text-white border-2 border-zinc-700',
    ghostAccent: 'text-white underline',
    glowClass: 'shadow-[0_0_15px_rgba(255,255,255,0.25)]'
  },
  spectre: {
    id: 'spectre',
    name: 'Spectre Green',
    desc: 'Luminous cybermint interface with reactive data bounds.',
    bgMain: 'bg-black',
    bgHeader: 'bg-[#020503]/90',
    bgNav: 'bg-[#010402]',
    bgCard: 'bg-zinc-950/80 border border-emerald-950 hover:border-emerald-900',
    border: 'border-zinc-900',
    borderActive: 'border-emerald-900',
    textMain: 'text-zinc-100',
    textMuted: 'text-zinc-500',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-600 hover:bg-emerald-500 text-black font-black',
    accentBorder: 'border-emerald-600/30',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-black',
    bubbleMe: 'bg-emerald-950/30 text-emerald-200 border border-emerald-900/50',
    bubbleOther: 'bg-zinc-950 text-zinc-300 border border-zinc-900',
    ghostAccent: 'text-teal-400',
    glowClass: 'shadow-[0_0_15px_rgba(52,211,153,0.25)]'
  },
  amethyst: {
    id: 'amethyst',
    name: 'GhostWire Amethyst',
    desc: 'Electric purple highlight notes in an obsidian backplane.',
    bgMain: 'bg-black',
    bgHeader: 'bg-[#06040a]/90',
    bgNav: 'bg-[#040207]',
    bgCard: 'bg-zinc-950 border border-purple-950/50 hover:border-purple-900/50',
    border: 'border-zinc-900',
    borderActive: 'border-purple-900',
    textMain: 'text-slate-100',
    textMuted: 'text-zinc-500',
    accentText: 'text-purple-400',
    accentBg: 'bg-purple-600 hover:bg-purple-500 text-white',
    accentBorder: 'border-purple-600/30',
    badgeBg: 'bg-purple-500',
    badgeText: 'text-white',
    bubbleMe: 'bg-purple-950/30 text-purple-200 border border-purple-900/40',
    bubbleOther: 'bg-zinc-950 text-zinc-300 border border-zinc-900',
    ghostAccent: 'text-fuchsia-400',
    glowClass: 'shadow-[0_0_20px_rgba(168,85,247,0.2)]'
  }
};

export const getTheme = (themeId: string | null | undefined): Theme => {
  return THEMES[themeId || ''] || THEMES.ghostwire;
};
