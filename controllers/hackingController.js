import { randomWord, generateSymbolMix } from "../services/randomWord.js";

export const hackingGameController = {
  mainPage: (req, res) => {
    if (!req.session.correctWord || req.query.reset) {
      req.session.correctWord = randomWord();
      req.session.attempts = [];
    }

    const mixedSymbols = generateSymbolMix(req.session.correctWord);

    res.render("games/hacking", {
      attempts: req.session.attempts,
      correctWord: req.session.correctWord,
      mixedSymbols: mixedSymbols,
    });
  },

  guess: (req, res) => {
    const guess = req.body.guess;
    if (guess.length === 5) {
      let feedback = "";
      for (let i = 0; i < guess.length; i++) {
        if (guess[i] === req.session.correctWord[i]) {
          feedback += guess[i];
        } else {
          feedback += "_ ";
        }
      }
      req.session.attempts.push({ guess: guess, feedback: feedback });

      if (feedback === req.session.correctWord) {
        const mixedSymbols = generateSymbolMix(
          wordPool.slice(0, 10),
          req.session.correctWord
        );

        return res.render("win", {
          correctWord: req.session.correctWord,
          mixedSymbols: mixedSymbols,
        });
      } else if (req.session.attempts.length >= 5) {
        const mixedSymbols = generateSymbolMix(req.session.correctWord);

        return res.render("lose", {
          correctWord: req.session.correctWord,
          mixedSymbols: mixedSymbols,
        });
      }
    }
    res.redirect("/hacking");
  },
};
