// Server-side bad-word check (English + Tagalog). The app only masks words on screen; this is what
// actually stops a bad comment / reply / message from being saved and gives the sender a strike.

// Caught even when spaced or dotted out ("f.u.c.k", "p u t a n g i n a")
const STRONG = [
  'putangina', 'putang ina', 'tangina', 'tang ina', 'puta', 'pakyu', 'fuck', 'shit', 'bitch',
  'bastard', 'tarantado', 'kupal', 'hindot', 'jakol', 'bwisit', 'lintik', 'siraulo', 'leche',
];
// Short / common-looking words: only counted when they stand alone as a word
const WEAK = [
  'gago', 'tanga', 'bobo', 'ulol', 'damn', 'ass', 'idiot', 'stupid', 'moron', 'loser',
  'inutil', 'hayop', 'buang', 'bugo', 'shunga', 'engot', 'ungas', 'animal',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const URL_RE = /(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(com|net|org|ph|gov)\b\S*)/gi;

const squash = (s) => s.replace(/(.)\1+/g, '$1');                      // "fuuuck" -> "fuck"
const strongSquashed = STRONG.map(w => squash(w.replace(/\s+/g, '')));
const weakSet = new Set(WEAK.map(squash));

function normalize(text) {
  return String(text || '')
    .replace(URL_RE, ' ')
    .toLowerCase()
    .replace(/[0134578@$!]/g, ch => LEET[ch] || ch);
}

/** Returns the matched word, or null when the text is clean. */
function findProfanity(text) {
  const norm = normalize(text);

  // 1) whole words
  for (const token of norm.split(/[^a-z]+/).filter(Boolean)) {
    const t = squash(token);
    if (weakSet.has(t)) return token;
    if (strongSquashed.some(w => t === w || (w.length >= 5 && t.includes(w)))) return token;
  }
  // 2) letters spaced / dotted out ("f u c k", "p.u.t.a.n.g.i.n.a"): join runs of single letters
  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  let run = '';
  for (const tok of [...tokens, '']) {
    if (tok.length === 1) { run += tok; continue; }
    if (run.length >= 4) {
      const g = squash(run);
      if (strongSquashed.some(w => g.includes(w))) return run;
    }
    run = '';
  }
  return null;
}

module.exports = { findProfanity };
