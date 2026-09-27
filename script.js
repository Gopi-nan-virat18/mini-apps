(() => {
  "use strict";

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB upload cap
  const MAX_CANVAS_DIM = 900;
  const MAX_ATTACHMENTS = 5;

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const dropHint = document.getElementById("dropHint");
  const fileInput = document.getElementById("fileInput");

  /** @type {HTMLImageElement|null} */
  let baseImage = null;
  let textLayers = [];
  let selectedLayerId = null;
  let dragState = null;

  const filters = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 0,
    rotate: 0, // degrees, multiple of 90
    flipH: false,
    flipV: false,
  };

  const attachments = [];

  // ---------- Rendering ----------

  function buildFilterString() {
    return `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%)`;
  }

  function resizeCanvasToImage() {
    if (!baseImage) {
      canvas.width = 640;
      canvas.height = 480;
      return;
    }
    const scale = Math.min(1, MAX_CANVAS_DIM / Math.max(baseImage.naturalWidth, baseImage.naturalHeight));
    canvas.width = Math.round(baseImage.naturalWidth * scale);
    canvas.height = Math.round(baseImage.naturalHeight * scale);
  }

  function measureLayerBox(layer) {
    ctx.font = `${layer.bold ? "bold " : ""}${layer.fontSize}px ${layer.font}`;
    const lines = layer.text.split("\n");
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width), 10);
    const lineHeight = layer.fontSize * 1.2;
    const height = lineHeight * lines.length;
    return {
      left: layer.x - width / 2 - 6,
      right: layer.x + width / 2 + 6,
      top: layer.y - layer.fontSize / 2 - 6,
      bottom: layer.y - layer.fontSize / 2 + height + 6,
    };
  }

  function drawTextLayer(layer, isSelected) {
    ctx.font = `${layer.bold ? "bold " : ""}${layer.fontSize}px ${layer.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, layer.fontSize / 12);
    ctx.strokeStyle = layer.stroke;
    ctx.fillStyle = layer.color;
    const lines = layer.text.split("\n");
    const lineHeight = layer.fontSize * 1.2;
    lines.forEach((line, i) => {
      const y = layer.y + i * lineHeight;
      ctx.strokeText(line, layer.x, y);
      ctx.fillText(line, layer.x, y);
    });

    if (isSelected) {
      const box = measureLayerBox(layer);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1;
      ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.restore();
    }
  }

  function render() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.filter = buildFilterString();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((filters.rotate * Math.PI) / 180);
    ctx.scale(filters.flipH ? -1 : 1, filters.flipV ? -1 : 1);
    if (baseImage) {
      ctx.drawImage(baseImage, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    }
    ctx.restore();

    textLayers.forEach((layer) => drawTextLayer(layer, layer.id === selectedLayerId));
    ctx.restore();

    updateDropHint();
    updateDeleteButtonState();
  }

  function updateDropHint() {
    dropHint.classList.toggle("hidden", !!baseImage);
  }

  // ---------- Text layer management ----------

  function createLayer(overrides = {}) {
    return {
      id: crypto.randomUUID(),
      text: "Your text here",
      x: canvas.width / 2,
      y: canvas.height / 2,
      fontSize: 48,
      color: "#ffffff",
      stroke: "#000000",
      font: "Impact, sans-serif",
      bold: false,
      ...overrides,
    };
  }

  function addLayer(overrides) {
    const layer = createLayer(overrides);
    textLayers.push(layer);
    selectedLayerId = layer.id;
    render();
    refreshLayerPanel();
  }

  function getSelectedLayer() {
    return textLayers.find((l) => l.id === selectedLayerId) || null;
  }

  function deleteSelectedLayer() {
    if (!selectedLayerId) return;
    textLayers = textLayers.filter((l) => l.id !== selectedLayerId);
    selectedLayerId = null;
    render();
    refreshLayerPanel();
  }

  function updateDeleteButtonState() {
    document.getElementById("deleteLayerBtn").disabled = !selectedLayerId;
  }

  // ---------- Canvas pointer interactions ----------

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function hitTest(layer, x, y) {
    const box = measureLayerBox(layer);
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  }

  canvas.addEventListener("pointerdown", (e) => {
    const { x, y } = getCanvasCoords(e);
    for (let i = textLayers.length - 1; i >= 0; i--) {
      const layer = textLayers[i];
      if (hitTest(layer, x, y)) {
        selectedLayerId = layer.id;
        dragState = { id: layer.id, offsetX: x - layer.x, offsetY: y - layer.y };
        canvas.setPointerCapture(e.pointerId);
        render();
        refreshLayerPanel();
        return;
      }
    }
    selectedLayerId = null;
    render();
    refreshLayerPanel();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    const { x, y } = getCanvasCoords(e);
    const layer = textLayers.find((l) => l.id === dragState.id);
    if (!layer) return;
    layer.x = Math.min(Math.max(x - dragState.offsetX, 0), canvas.width);
    layer.y = Math.min(Math.max(y - dragState.offsetY, 0), canvas.height);
    render();
  });

  window.addEventListener("pointerup", () => {
    dragState = null;
  });

  // ---------- Layer panel UI ----------

  const noLayerMsg = document.getElementById("noLayerMsg");
  const layerControls = document.getElementById("layerControls");
  const layerText = document.getElementById("layerText");
  const layerFont = document.getElementById("layerFont");
  const layerSize = document.getElementById("layerSize");
  const layerColor = document.getElementById("layerColor");
  const layerStroke = document.getElementById("layerStroke");
  const layerBold = document.getElementById("layerBold");

  function refreshLayerPanel() {
    const layer = getSelectedLayer();
    const hasLayer = !!layer;
    noLayerMsg.hidden = hasLayer;
    layerControls.hidden = !hasLayer;
    if (!hasLayer) return;
    layerText.value = layer.text;
    layerFont.value = layer.font;
    layerSize.value = layer.fontSize;
    layerColor.value = layer.color;
    layerStroke.value = layer.stroke;
    layerBold.checked = layer.bold;
  }

  function withSelectedLayer(fn) {
    const layer = getSelectedLayer();
    if (!layer) return;
    fn(layer);
    render();
  }

  layerText.addEventListener("input", () => withSelectedLayer((l) => (l.text = layerText.value || " ")));
  layerFont.addEventListener("change", () => withSelectedLayer((l) => (l.font = layerFont.value)));
  layerSize.addEventListener("input", () => withSelectedLayer((l) => (l.fontSize = Number(layerSize.value))));
  layerColor.addEventListener("input", () => withSelectedLayer((l) => (l.color = layerColor.value)));
  layerStroke.addEventListener("input", () => withSelectedLayer((l) => (l.stroke = layerStroke.value)));
  layerBold.addEventListener("change", () => withSelectedLayer((l) => (l.bold = layerBold.checked)));

  document.getElementById("addTextBtn").addEventListener("click", () => addLayer());
  document.getElementById("deleteLayerBtn").addEventListener("click", deleteSelectedLayer);

  document.getElementById("presetMemeBtn").addEventListener("click", () => {
    textLayers = [];
    addLayer({ text: "TOP TEXT", x: canvas.width / 2, y: 48, fontSize: 44 });
    addLayer({ text: "BOTTOM TEXT", x: canvas.width / 2, y: canvas.height - 60, fontSize: 44 });
  });

  // ---------- Image upload ----------

  function loadImageFile(file) {
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.", true);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("Image is too large (max 8MB).", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        baseImage = img;
        resizeCanvasToImage();
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  document.getElementById("uploadBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) loadImageFile(fileInput.files[0]);
  });

  document.getElementById("clearImageBtn").addEventListener("click", () => {
    baseImage = null;
    resizeCanvasToImage();
    render();
  });

  ["dragover", "dragenter"].forEach((evt) =>
    canvas.parentElement.addEventListener(evt, (e) => {
      e.preventDefault();
    })
  );
  canvas.parentElement.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  // ---------- Filters ----------

  function bindRange(id, key, isInt = true) {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      filters[key] = isInt ? Number(el.value) : parseFloat(el.value);
      render();
    });
  }
  bindRange("fBrightness", "brightness");
  bindRange("fContrast", "contrast");
  bindRange("fSaturate", "saturate");
  bindRange("fGrayscale", "grayscale");
  bindRange("fSepia", "sepia");

  document.getElementById("rotateLeftBtn").addEventListener("click", () => {
    filters.rotate = (filters.rotate - 90 + 360) % 360;
    render();
  });
  document.getElementById("rotateRightBtn").addEventListener("click", () => {
    filters.rotate = (filters.rotate + 90) % 360;
    render();
  });
  document.getElementById("flipHBtn").addEventListener("click", () => {
    filters.flipH = !filters.flipH;
    render();
  });
  document.getElementById("flipVBtn").addEventListener("click", () => {
    filters.flipV = !filters.flipV;
    render();
  });
  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    Object.assign(filters, { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, rotate: 0, flipH: false, flipV: false });
    ["fBrightness", "fContrast", "fSaturate"].forEach((id) => (document.getElementById(id).value = 100));
    ["fGrayscale", "fSepia"].forEach((id) => (document.getElementById(id).value = 0));
    render();
  });

  // ---------- Tabs ----------

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll("[data-tab-content]").forEach((c) => (c.hidden = true));
      btn.classList.add("active");
      document.querySelector(`[data-tab-content="${btn.dataset.tab}"]`).hidden = false;
    });
  });

  // ---------- Attachments ----------

  const attachmentsTray = document.getElementById("attachmentsTray");
  const attachCount = document.getElementById("attachCount");

  function renderAttachments() {
    attachmentsTray.innerHTML = "";
    attachments.forEach((att) => {
      const thumb = document.createElement("div");
      thumb.className = "attachment-thumb";
      const img = document.createElement("img");
      img.src = att.dataUrl;
      img.alt = att.name;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `Remove ${att.name}`);
      removeBtn.addEventListener("click", () => {
        const idx = attachments.findIndex((a) => a.id === att.id);
        if (idx !== -1) attachments.splice(idx, 1);
        renderAttachments();
      });
      thumb.append(img, removeBtn);
      attachmentsTray.appendChild(thumb);
    });
    attachCount.textContent = String(attachments.length);
    document.getElementById("addAttachmentBtn").disabled = attachments.length >= MAX_ATTACHMENTS;
  }

  document.getElementById("addAttachmentBtn").addEventListener("click", () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      setStatus(`You can attach up to ${MAX_ATTACHMENTS} images.`, true);
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    attachments.push({ id: crypto.randomUUID(), name: `creation-${attachments.length + 1}.png`, mimeType: "image/png", dataUrl });
    renderAttachments();
    setStatus("Added current image to attachments.");
  });

  // ---------- Download ----------

  document.getElementById("downloadBtn").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `meme-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  // ---------- Share via postMessage ----------

  const statusMsg = document.getElementById("statusMsg");
  let statusTimer = null;
  function setStatus(message, isError = false) {
    statusMsg.textContent = message;
    statusMsg.style.color = isError ? "#ef4444" : "";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (statusMsg.textContent = ""), 4000);
  }

  // The parent (Arattai host) origin is derived from document.referrer when this
  // page is embedded in an iframe. Falls back to "*" only if unknown.
  function getParentOrigin() {
    try {
      if (document.referrer) return new URL(document.referrer).origin;
    } catch (e) {
      /* ignore malformed referrer */
    }
    return "*";
  }

  document.getElementById("shareBtn").addEventListener("click", () => {
    const text = document.getElementById("messageText").value.trim();
    if (!text && attachments.length === 0) {
      setStatus("Add a message or at least one attachment before sharing.", true);
      return;
    }

    const message = {
      source: "arattai-mini-app",
      type: "SHARE_TO_CHAT",
      version: 1,
      payload: {
        text,
        attachments: attachments.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })),
      },
    };

    const targetOrigin = getParentOrigin();
    if (window.parent === window) {
      setStatus("Not running inside a host app; nothing to share to.", true);
      return;
    }
    window.parent.postMessage(message, targetOrigin);
    setStatus("Shared to chat.");
  });

  // Optional: listen for acknowledgements from the host, validating the origin.
  window.addEventListener("message", (event) => {
    const expectedOrigin = getParentOrigin();
    if (expectedOrigin !== "*" && event.origin !== expectedOrigin) return;
    const data = event.data;
    if (data && data.source === "arattai-host" && data.type === "SHARE_ACK") {
      setStatus("Host confirmed message delivery.");
    }
  });

  // ---------- Init ----------

  resizeCanvasToImage();
  render();
  renderAttachments();
})();
