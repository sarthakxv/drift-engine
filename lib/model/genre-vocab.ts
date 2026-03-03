/**
 * 64 super-genre vocabulary for mapping Spotify's freeform genre strings
 * to a fixed-dimension binary vector.
 *
 * Each super-genre has an index (0–63) and a list of keywords used for
 * substring matching against Spotify genre strings.
 */

export const GENRE_DIM = 64;

export interface SuperGenre {
  index: number;
  id: string;
  keywords: string[];
}

export const SUPER_GENRES: SuperGenre[] = [
  // Pop family (0–3)
  { index: 0, id: "pop", keywords: ["pop"] },
  { index: 1, id: "indie-pop", keywords: ["indie pop", "indietronica", "chamber pop"] },
  { index: 2, id: "synth-pop", keywords: ["synth pop", "synthpop", "electropop", "synthwave", "retrowave"] },
  { index: 3, id: "k-pop", keywords: ["k-pop", "kpop", "korean"] },

  // Rock family (4–11)
  { index: 4, id: "rock", keywords: ["rock"] },
  { index: 5, id: "alt-rock", keywords: ["alt rock", "alternative rock", "alt-rock"] },
  { index: 6, id: "indie-rock", keywords: ["indie rock", "indie"] },
  { index: 7, id: "punk", keywords: ["punk", "hardcore", "pop punk", "skate punk"] },
  { index: 8, id: "post-punk", keywords: ["post-punk", "post punk", "darkwave", "goth"] },
  { index: 9, id: "metal", keywords: ["metal", "death metal", "black metal", "doom metal", "thrash"] },
  { index: 10, id: "hard-rock", keywords: ["hard rock", "stoner rock", "southern rock"] },
  { index: 11, id: "classic-rock", keywords: ["classic rock", "arena rock", "album rock"] },

  // Hip-hop family (12–15)
  { index: 12, id: "hip-hop", keywords: ["hip hop", "hip-hop", "rap", "boom bap"] },
  { index: 13, id: "trap", keywords: ["trap", "plugg"] },
  { index: 14, id: "conscious-rap", keywords: ["conscious", "underground hip hop", "political hip hop"] },
  { index: 15, id: "drill", keywords: ["drill"] },

  // R&B / Soul family (16–20)
  { index: 16, id: "r-and-b", keywords: ["r&b", "rnb", "rhythm and blues"] },
  { index: 17, id: "neo-soul", keywords: ["neo soul", "neo-soul"] },
  { index: 18, id: "soul", keywords: ["soul"] },
  { index: 19, id: "funk", keywords: ["funk", "p-funk", "g-funk"] },
  { index: 20, id: "motown", keywords: ["motown", "northern soul"] },

  // Electronic family (21–28)
  { index: 21, id: "electronic", keywords: ["electronic", "electronica"] },
  { index: 22, id: "house", keywords: ["house", "deep house", "tech house", "acid house"] },
  { index: 23, id: "techno", keywords: ["techno", "minimal techno", "detroit techno"] },
  { index: 24, id: "drum-and-bass", keywords: ["drum and bass", "dnb", "jungle", "liquid funk"] },
  { index: 25, id: "dubstep", keywords: ["dubstep", "brostep", "riddim"] },
  { index: 26, id: "ambient", keywords: ["ambient", "dark ambient", "drone"] },
  { index: 27, id: "idm", keywords: ["idm", "intelligent dance", "glitch"] },
  { index: 28, id: "trance", keywords: ["trance", "psytrance", "progressive trance", "goa"] },

  // Jazz family (29–32)
  { index: 29, id: "jazz", keywords: ["jazz"] },
  { index: 30, id: "smooth-jazz", keywords: ["smooth jazz"] },
  { index: 31, id: "bebop", keywords: ["bebop", "hard bop", "bop"] },
  { index: 32, id: "fusion", keywords: ["fusion", "jazz fusion", "jazz rock"] },

  // Classical family (33–36)
  { index: 33, id: "classical", keywords: ["classical"] },
  { index: 34, id: "orchestral", keywords: ["orchestral", "symphony", "philharmonic"] },
  { index: 35, id: "chamber", keywords: ["chamber", "string quartet"] },
  { index: 36, id: "opera", keywords: ["opera", "operetta"] },

  // Folk / Acoustic family (37–40)
  { index: 37, id: "folk", keywords: ["folk"] },
  { index: 38, id: "americana", keywords: ["americana", "roots"] },
  { index: 39, id: "singer-songwriter", keywords: ["singer-songwriter", "singer songwriter"] },
  { index: 40, id: "acoustic", keywords: ["acoustic"] },

  // Country (41–42)
  { index: 41, id: "country", keywords: ["country"] },
  { index: 42, id: "bluegrass", keywords: ["bluegrass", "newgrass"] },

  // Blues (43–44)
  { index: 43, id: "blues", keywords: ["blues"] },
  { index: 44, id: "delta-blues", keywords: ["delta blues", "chicago blues", "electric blues"] },

  // Caribbean / African (45–48)
  { index: 45, id: "reggae", keywords: ["reggae", "roots reggae", "dub"] },
  { index: 46, id: "dancehall", keywords: ["dancehall", "ragga", "soca"] },
  { index: 47, id: "afrobeats", keywords: ["afrobeats", "afrobeat", "afro house"] },
  { index: 48, id: "afro-pop", keywords: ["afro pop", "afropop", "afro-pop"] },

  // Latin family (49–52)
  { index: 49, id: "latin", keywords: ["latin"] },
  { index: 50, id: "reggaeton", keywords: ["reggaeton", "perreo", "urbano"] },
  { index: 51, id: "bossa-nova", keywords: ["bossa nova", "mpb", "tropicalia", "samba"] },
  { index: 52, id: "salsa", keywords: ["salsa", "cumbia", "merengue", "bachata"] },

  // World (53–55)
  { index: 53, id: "world", keywords: ["world", "global"] },
  { index: 54, id: "middle-eastern", keywords: ["middle eastern", "arabic", "turkish", "persian"] },
  { index: 55, id: "indian", keywords: ["indian", "bollywood", "carnatic", "hindustani", "filmi"] },

  // Experimental (56–58)
  { index: 56, id: "experimental", keywords: ["experimental", "art"] },
  { index: 57, id: "noise", keywords: ["noise", "harsh noise", "power electronics"] },
  { index: 58, id: "avant-garde", keywords: ["avant-garde", "avant garde", "free improvisation"] },

  // Other distinct genres (59–63)
  { index: 59, id: "soundtrack", keywords: ["soundtrack", "score", "cinematic", "film"] },
  { index: 60, id: "lo-fi", keywords: ["lo-fi", "lofi", "lo fi", "chillhop"] },
  { index: 61, id: "emo", keywords: ["emo", "midwest emo", "screamo"] },
  { index: 62, id: "grunge", keywords: ["grunge"] },
  { index: 63, id: "shoegaze", keywords: ["shoegaze", "dream pop", "ethereal", "new wave", "nu gaze"] },
];

// Precompute a lookup: keyword → index list, sorted longest-first for greedy matching
const keywordIndex: Array<[string, number]> = [];
for (const g of SUPER_GENRES) {
  for (const kw of g.keywords) {
    keywordIndex.push([kw.toLowerCase(), g.index]);
  }
}
keywordIndex.sort((a, b) => b[0].length - a[0].length);

/**
 * Map a single Spotify genre string to matching super-genre indices.
 * Returns an array of indices (typically 1–3).
 */
export function mapGenreString(spotifyGenre: string): number[] {
  const lower = spotifyGenre.toLowerCase();
  const matched = new Set<number>();

  for (const [kw, idx] of keywordIndex) {
    if (lower.includes(kw)) {
      matched.add(idx);
    }
  }

  return Array.from(matched);
}

/**
 * Build a 64-dim binary genre vector from an array of Spotify genre strings.
 * Returns a Float32Array of 0s and 1s.
 */
export function buildGenreVector(spotifyGenres: string[]): Float32Array {
  const vec = new Float32Array(GENRE_DIM);
  for (const genre of spotifyGenres) {
    for (const idx of mapGenreString(genre)) {
      vec[idx] = 1;
    }
  }
  return vec;
}

/**
 * Get the human-readable super-genre IDs for a binary genre vector.
 */
export function getActiveGenreIds(genreVector: Float32Array | number[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < GENRE_DIM; i++) {
    if (genreVector[i] > 0) {
      ids.push(SUPER_GENRES[i].id);
    }
  }
  return ids;
}
