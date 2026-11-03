(() => {
  "use strict";

  const GAME_SECONDS = 30;
  const SOURCE = "arattai-share-app";
  const VERSION = 1;
  const APP_NAME = "Tap Rush";
  const BEST_KEY = "tap-rush-best";
  const CHALLENGE_IMAGE = "Challenge.jpg";

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
  const greetingEl = document.getElementById("greeting");
  const resultEl = document.getElementById("result");
  const resultImg = document.getElementById("resultImg");
  const resultText = document.getElementById("resultText");

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
    resultEl.hidden = true;
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
    resultText.textContent = `Your score: ${score}  |  Best: ${best}`;
    resultEl.hidden = false;
  }

  startBtn.addEventListener("click", startGame);

  let statusTimer = null;
  function setStatus(message, isError = false) {
    statusMsg.textContent = message;
    statusMsg.style.color = isError ? "#ef4444" : "";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (statusMsg.textContent = ""), 4000);
  }

  function getHostOrigin() {
    if (location.ancestorOrigins && location.ancestorOrigins.length) return location.ancestorOrigins[0];
    try {
      return new URL(document.referrer).origin;
    } catch (e) {
      return "*";
    }
  }

  // editable:false makes the host show a read-only send dialog.
  function postToHost(payload) {
    if (window.parent === window) {
      setStatus("Not running inside Arattai; nothing to share to.", true);
      return;
    }
    window.parent.postMessage({ source: SOURCE, version: VERSION, editable: false, ...payload }, getHostOrigin());
    setStatus("Choose a chat in the dialog to send.");
  }

  // Trusted apps only; others get error:"not_allowed" and the game works without context.
  let playerName = "";
  let chatInfo = null;

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== "arattai-host" || data.version !== 1) return;
    if (data.type !== "context" || data.error) return;
    if (data.user && typeof data.user.name === "string") {
      playerName = data.user.name;
      greetingEl.textContent = `Hello ${playerName}`;
      greetingEl.hidden = false;
    }
    if (data.chat) chatInfo = data.chat;
  });

  if (window.parent !== window) {
    window.parent.postMessage(
      { source: SOURCE, version: VERSION, type: "get_context", scope: ["user", "chat"], request_id: "init" },
      getHostOrigin()
    );
  }

  function loadShareImage(path) {
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error("image not found");
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result);
              resolve({ data: dataUrl.split(",")[1], mime: blob.type || "image/jpeg", dataUrl });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      );
  }

  // Cards only accept png/jpeg/webp, so the AVIF celebration image is re-encoded as JPEG.
  function imageToJpegDataUrl(img) {
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  shareBtn.addEventListener("click", () => {
    if (lastScore === null) return;
    const who = playerName ? `${playerName} scored` : "I scored";
    const card = {
      type: "card",
      url: location.origin + location.pathname,
      title: `${who} ${lastScore} in ${APP_NAME}!`,
      description: `Personal best: ${best}. Can you beat it?`,
      cta: "Beat me",
    };
    try {
      if (resultImg.complete && resultImg.naturalWidth) card.image = imageToJpegDataUrl(resultImg);
    } catch (e) {
      // Send the card without a thumbnail.
    }
    postToHost(card);
  });

  challengeBtn.addEventListener("click", async () => {
    const card = {
      type: "card",
      url: location.origin + location.pathname,
      title: lastScore === null ? `Play ${APP_NAME} with me!` : `Beat my ${lastScore} in ${APP_NAME}!`,
      description: "Tap targets for 30 seconds. Think you can score higher?",
      cta: "Play now",
    };
    try {
      card.image = (await loadShareImage(CHALLENGE_IMAGE)).dataUrl;
    } catch (e) {
      // Send the card without a thumbnail.
    }
    postToHost(card);
  });
})();
