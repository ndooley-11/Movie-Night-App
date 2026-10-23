const ADJECTIVES = [
  "amber", "blue", "cedar", "dusty", "ember", "fuzzy", "golden", "happy",
  "ivory", "jolly", "kind", "lucky", "misty", "noble", "olive", "plucky",
  "quiet", "rusty", "silver", "tiny", "umber", "velvet", "windy", "zesty",
];

const NOUNS = [
  "otter", "falcon", "maple", "comet", "pepper", "harbor", "willow", "finch",
  "canyon", "lantern", "meadow", "ripple", "sparrow", "thistle", "ember",
  "galaxy", "pebble", "cricket", "orchid", "beacon", "clover", "marble",
];

const CODE_PATTERN = /^[a-z]+-[a-z]+-\d{2}$/;

export function generateRoomCode() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${adj}-${noun}-${num}`;
}

export function normalizeRoomCode(input) {
  return (input || "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function isValidRoomCode(code) {
  return typeof code === "string" && code.length >= 3 && code.length <= 40 && /^[a-z0-9-]+$/.test(code);
}

export function looksGenerated(code) {
  return CODE_PATTERN.test(code);
}
