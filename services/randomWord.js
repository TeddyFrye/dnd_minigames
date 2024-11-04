// services/randomWord.js

// Word pool for the hacking game
const wordPool = [
  "apple",
  "melon",
  "peach",
  "bloat",
  "toast",
  "float",
  "crack",
  "track",
  "broke",
  "joker",
  "poker",
  "flame",
  "frame",
  "crane",
  "train",
  "brain",
  "drain",
  "plain",
  "grain",
  "grape",
  "grate",
  "crate",
];

/**
 * Generates a random word from a given array of words.
 * @param {Array} arr - Array of words to choose from.
 * @returns {string} - A random word from the array.
 */
export function randomWord(arr = wordPool) {
  let randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

/**
 * Generates a mixed string of words and symbols, including the correct word.
 * @param {Array} words - Array of words to mix with symbols.
 * @param {string} correct - The correct word to ensure it's part of the mixed result.
 * @returns {string} - A string of mixed words and symbols.
 */
export function generateSymbolMix(words, correct) {
  let symbols = [
    "@",
    "#",
    "$",
    "%",
    "^",
    "&",
    "*",
    "(",
    ")",
    "-",
    "+",
    "=",
    "|",
    "{",
    "}",
    "[",
    "]",
    ":",
    ";",
    "?",
  ];
  let mixedArray = [
    ...words,
    ...Array(200)
      .fill()
      .map(() => symbols[Math.floor(Math.random() * symbols.length)]),
  ];
  mixedArray.push(correct);
  mixedArray.sort(() => 0.5 - Math.random());
  return mixedArray.join(" ");
}
