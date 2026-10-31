(() => {
  "use strict";

  const GAME_SECONDS = 30;
  const SOURCE = "arattai-share-app";
  const VERSION = 1;
  const APP_NAME = "Tap Rush";
  const BEST_KEY = "tap-rush-best";

  const arena = document.getElementById("arena");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");
  const scoreEl = document.getElementById("score");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const shareBtn = document.getElementById("shareBtn");
  const challengeBtn = document.getElementById("challengeBtn");
  const statusMsg = document.getElementById("statusMsg");

  let score = 0;
  let timeLeft = GAME_SECONDS;
  let timerId = null;
  let target = null;
  let targetTimeout = null;
  let lastScore = null;
  let best = Number(localStorage.getItem(BEST_KEY)) || 0;
  bestEl.textContent = best;

  const params = new URLSearchParams(location.search);
  if (params.get("theme") === "light") document.documentElement.dataset.theme = "light";

  function clearTarget() {
    clearTimeout(targetTimeout);
    if (target) target.remove();
    target = null;
  }

  function spawnTarget() {
    clearTarget();
    const rect = arena.getBoundingClientRect();
    const bonus = Math.random() < 0.15;
    const size = Math.round(rect.width * (bonus ? 0.1 : 0.14));
    const pad = size / 2 + 4;
    const x = pad + Math.random() * (rect.width - pad * 2);
    const y = pad + Math.random() * (rect.height - pad * 2);

    target = document.createElement("button");
    target.type = "button";
    target.className = "target" + (bonus ? " bonus" : "");
    target.setAttribute("aria-label", "Target");
    Object.assign(target.style, { width: size + "px", height: size + "px", left: x + "px", top: y + "px" });
    target.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      score += bonus ? 3 : 1;
      scoreEl.textContent = score;
      spawnTarget();
    });
    arena.appendChild(target);

    targetTimeout = setTimeout(spawnTarget, bonus ? 700 : 1200);
  }

  function startGame() {
    score = 0;
    timeLeft = GAME_SECONDS;
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    overlay.hidden = true;
    shareBtn.disabled = true;
    challengeBtn.disabled = true;
    spawnTarget();
    timerId = setInterval(() => {
      timeLeft -= 1;
      timeEl.textContent = timeLeft;
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function endGame() {
    clearInterval(timerId);
    clearTarget();
    lastScore = score;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
    }
    overlayText.textContent = `Time's up!\nScore: ${score}\nBest: ${best}`;
    startBtn.textContent = "Play Again";
    overlay.hidden = false;
    shareBtn.disabled = false;
    challengeBtn.disabled = false;
  }

  startBtn.addEventListener("click", startGame);

  let statusTimer = null;
  function setStatus(message, isError = false) {
    statusMsg.textContent = message;
    statusMsg.style.color = isError ? "#ef4444" : "";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (statusMsg.textContent = ""), 4000);
  }

  // editable:false makes the host show a read-only send dialog.
  function postToHost(payload) {
    if (window.parent === window) {
      setStatus("Not running inside Arattai; nothing to share to.", true);
      return;
    }
    window.parent.postMessage({ source: SOURCE, version: VERSION, editable: false, ...payload }, location.origin);
    setStatus("Choose a chat in the dialog to send.");
  }

  shareBtn.addEventListener("click", () => {
    if (lastScore === null) return;
    postToHost({
      type: "message",
      format: "text",
      title: `${APP_NAME} score`,
      text: `I scored ${lastScore} in ${APP_NAME}! Personal best: ${best}. Can you beat me?`,
    });
  });

  challengeBtn.addEventListener("click", () => {
    if (lastScore === null) return;
    postToHost({
      type: "card",
      url: location.origin + location.pathname,
      title: `Beat my ${lastScore} in ${APP_NAME}!`,
    });
  });
})();
