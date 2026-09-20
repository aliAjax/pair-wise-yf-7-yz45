const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

// 每处落字：status "待校"（默认）或 "已确认"；worn 标记磨损。
// 旧数据缺少 status 时一律按待校处理。
function normalizePlacement(placement) {
  return {
    row: Number(placement.row),
    col: Number(placement.col),
    typeId: placement.typeId,
    status: placement.status === "已确认" ? "已确认" : "待校",
    worn: Boolean(placement.worn)
  };
}

let state = loadState();
let proofCell = null;

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  proofBadge: document.querySelector("#proofBadge"),
  proofSummary: document.querySelector("#proofSummary"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  proofBackdrop: document.querySelector("#proofBackdrop"),
  proofBody: document.querySelector("#proofBody"),
  toast: document.querySelector("#toast")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    const fresh = structuredClone(defaultState);
    fresh.placements = [];
    return fresh;
  }
  try {
    const parsed = JSON.parse(saved);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
    merged.placements = (parsed.placements || []).map(normalizePlacement);
    merged.drafts = (parsed.drafts || []).map((draft) => ({
      ...draft,
      placements: (draft.placements || []).map(normalizePlacement)
    }));
    return merged;
  } catch {
    const fresh = structuredClone(defaultState);
    fresh.placements = [];
    return fresh;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getPlacement(row, col) {
  return state.placements.find((item) => item.row === row && item.col === col) || null;
}

function getTypeById(typeId) {
  return state.inventory.find((item) => item.id === typeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

// 占用之外还剩多少余量；负数即超用
function getAvailable(typeId) {
  const item = getTypeById(typeId);
  if (!item) return 0;
  const used = state.placements.reduce((sum, placement) => (placement.typeId === typeId ? sum + 1 : sum), 0);
  return item.quantity - used;
}

function isReleased() {
  return state.placements.length > 0 && state.placements.every((placement) => placement.status === "已确认");
}

// 放行后若改动的是“移除”，被移除格已不存在、无处可退回，
// 仅在移除时版面仍处于放行状态时，把仍在版面的格子整体退回待校，使放行失效；
// 若版面本就待校（例如先新增过又删掉新格），其余格子状态保持不变。
function invalidateReleaseAfterRemoval(wasReleased) {
  if (!wasReleased) return;
  state.placements.forEach((placement) => {
    placement.status = "待校";
  });
}

// 放行后新增/移动/替换落字：只让受影响格子退回待校
function touchPlacement(placement) {
  placement.status = "待校";
  placement.worn = false;
}

let toastTimer = null;
function showToast(message, tone = "info") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${tone}`;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
    els.toast.className = "toast";
  }, 2200);
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const available = item.quantity - used;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      const short = available <= 0 ? "short" : "";
      return `
        <article class="type-card ${selected} ${short}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 余量${available}（已用${used}/${item.quantity}）</span>
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const released = isReleased();
  if (released) els.stage.classList.add("released");
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? getTypeById(placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      if (placement) {
        const confirmed = placement.status === "已确认" ? "confirmed" : "pending";
        const worn = placement.worn ? "worn" : "";
        const missing = type ? "" : "missing";
        cells.push(`
          <button class="cell used ${vertical} ${confirmed} ${worn} ${missing}" draggable="true" data-row="${row}" data-col="${col}" data-placement="1" type="button" aria-label="第${row + 1}行第${col + 1}列 ${placement.status}">
            <span class="cell-glyph" style="font-size:${type ? Math.min(type.size, 30) : 24}px">${type ? escapeHtml(type.char) : "？"}</span>
            <span class="cell-dot" title="${placement.status}${placement.worn ? " · 磨损" : ""}"></span>
          </button>
        `);
      } else {
        cells.push(`
          <button class="cell ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列 空格">
            <span class="cell-glyph"></span>
          </button>
        `);
      }
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderProofPanel() {
  const usage = getUsage();
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = entries.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}款缺字` : "余量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  const total = state.placements.length;
  const confirmedCount = state.placements.filter((placement) => placement.status === "已确认").length;
  const released = isReleased();
  if (total === 0) {
    els.proofBadge.textContent = "未落字";
    els.proofBadge.className = "badge muted";
  } else if (released) {
    els.proofBadge.textContent = "已放行 · 可导出";
    els.proofBadge.className = "badge ok";
  } else {
    els.proofBadge.textContent = `待校 ${total - confirmedCount}/${total}`;
    els.proofBadge.className = "badge pending";
  }

  els.proofSummary.innerHTML = total
    ? `<div class="proof-bar" title="已确认 ${confirmedCount} / ${total}">
         <span style="width:${total ? (confirmedCount / total) * 100 : 0}%"></span>
       </div>
       <p class="proof-line">校样进度 <strong>${confirmedCount}/${total}</strong>${released ? " · 版面已放行" : " · 逐格确认后放行"}</p>`
    : `<p class="empty">还没有落字。</p>`;

  els.exportBtn.disabled = !released;
  els.exportBtn.title = released ? "" : "全部格子确认后版面放行，才允许导出";

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const available = item.quantity - used;
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity} · 余量${available}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">落字后在此核对余量。</p>`;
}

function renderProofDialog() {
  if (!proofCell) return;
  const placement = getPlacement(proofCell.row, proofCell.col);
  if (!placement) {
    closeProof();
    return;
  }
  const type = getTypeById(placement.typeId);
  const candidates = type
    ? state.inventory
        .filter((item) => item.char === type.char && item.id !== type.id && item.style !== type.style)
        .sort((a, b) => a.style.localeCompare(b.style, "zh-CN"))
    : [];

  els.proofBody.innerHTML = `
    <div class="proof-current ${type ? "" : "missing"}">
      <div class="proof-glyph">${type ? escapeHtml(type.char) : "？"}</div>
      <div class="proof-current-meta">
        <strong>${type ? `${escapeHtml(type.char)} · ${escapeHtml(type.style)}` : "字模已从库中删除"}</strong>
        <span>第${placement.row + 1}行 · 第${placement.col + 1}列</span>
        <span class="proof-status ${placement.status === "已确认" ? "ok" : "pending"}">${placement.status}${placement.worn ? " · 已标记磨损" : ""}</span>
      </div>
    </div>
    ${
      type
        ? `<div class="proof-actions">
             <button type="button" data-proof-worn class="${placement.worn ? "danger" : ""}">${placement.worn ? "取消磨损标记" : "标记磨损"}</button>
             <button type="button" data-proof-confirm>${placement.status === "已确认" ? "退回待校" : "确认此格"}</button>
             <button type="button" data-proof-remove class="ghost danger-text">移除落字</button>
           </div>`
        : `<div class="proof-actions">
             <button type="button" data-proof-remove class="danger">移除残留落字</button>
           </div>`
    }
    ${
      type
        ? `<h4 class="proof-subhead">同字换字（不同风格，替换后原字模余量释放）</h4>
           <div class="candidate-list">
             ${
               candidates
                 .map((item) => {
                   const available = getAvailable(item.id);
                   const blocked = available <= 0;
                   return `
                     <button type="button" class="candidate" data-proof-replace="${item.id}" ${blocked ? "disabled" : ""}>
                       <span class="candidate-glyph">${escapeHtml(item.char)}</span>
                       <span class="candidate-meta">
                         <strong>${escapeHtml(item.style)}</strong>
                         <span>${item.size}px · ${escapeHtml(item.wear)}</span>
                         <span class="candidate-stock ${blocked ? "short" : ""}">余量${available}${blocked ? "，整次拒绝" : ""}</span>
                       </span>
                     </button>
                   `;
                 })
                 .join("") || `<p class="empty">字模库中没有其他风格的「${escapeHtml(type.char)}」字模。</p>`
             }
           </div>`
        : ""
    }
  `;
}

function openProof(row, col) {
  if (!getPlacement(row, col)) return;
  proofCell = { row, col };
  renderProofDialog();
  els.proofBackdrop.hidden = false;
}

function closeProof() {
  proofCell = null;
  els.proofBackdrop.hidden = true;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map((draft) => {
        const confirmed = draft.placements.filter((placement) => placement.status === "已确认").length;
        return `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · 校样${confirmed}/${draft.placements.length} · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderProofPanel();
  renderDrafts();
  if (proofCell) {
    if (!getPlacement(proofCell.row, proofCell.col)) {
      closeProof();
    } else {
      renderProofDialog();
    }
  }
}

// 空格落字：新格默认待校
function addPlacement(row, col, typeId) {
  if (!typeId) {
    showToast("请先在左侧选择一枚字模", "warn");
    return;
  }
  if (getPlacement(row, col)) return;
  state.placements.push({ row, col, typeId, status: "待校", worn: false });
  renderAll();
}

// 替换（同字不同风格，也覆盖拖拽换字模）：余量不足整次拒绝，版面、余量、校样状态不变
function replacePlacement(row, col, nextTypeId) {
  const placement = getPlacement(row, col);
  if (!placement || placement.typeId === nextTypeId) return true;
  if (!getTypeById(nextTypeId)) return false;
  if (getAvailable(nextTypeId) <= 0) {
    const next = getTypeById(nextTypeId);
    showToast(`「${next.char} · ${next.style}」余量不足，换字整次拒绝`, "error");
    return false;
  }
  placement.typeId = nextTypeId;
  touchPlacement(placement);
  renderAll();
  return true;
}

function removePlacement(row, col) {
  const index = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (index < 0) return;
  const wasReleased = isReleased();
  state.placements.splice(index, 1);
  invalidateReleaseAfterRemoval(wasReleased);
  closeProof();
  renderAll();
}

// 拖拽格内字模：目标空格为移动；目标有字则两格互换。移动不改变各字模总占用，无需余量校验。
function movePlacement(fromRow, fromCol, toRow, toCol) {
  const source = getPlacement(fromRow, fromCol);
  const target = getPlacement(toRow, toCol);
  if (!source) return;
  if (target) {
    const sourceTypeId = source.typeId;
    source.typeId = target.typeId;
    target.typeId = sourceTypeId;
    touchPlacement(source);
    touchPlacement(target);
  } else {
    source.row = toRow;
    source.col = toCol;
    touchPlacement(source);
  }
  renderAll();
}

function handleDropOnCell(row, col, payload) {
  if (!payload) return;
  if (payload.kind === "type") {
    const placement = getPlacement(row, col);
    if (!placement) {
      addPlacement(row, col, payload.typeId);
    } else {
      replacePlacement(row, col, payload.typeId);
    }
  } else if (payload.kind === "placement") {
    movePlacement(payload.row, payload.col, row, col);
  }
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
  showToast("草稿已保存（含每格校样状态）", "ok");
}

function exportPreview() {
  if (!isReleased()) {
    showToast("尚未放行：请逐格确认全部落字后再导出", "error");
    return;
  }
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = getTypeById(placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = placement.worn ? "#7a6d5c" : "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { rows, cols } = getGrid();
  const wasReleased = isReleased();
  const kept = state.placements.filter((item) => item.row < rows && item.col < cols);
  const removed = kept.length !== state.placements.length;
  state.placements = kept;
  // 纸张改变导致落字被移除，按放行后移除处理
  if (removed) invalidateReleaseAfterRemoval(wasReleased);
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  closeProof();
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    const wasReleased = isReleased();
    const removed = state.placements.some((item) => item.typeId === typeId);
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (removed) invalidateReleaseAfterRemoval(wasReleased);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("application/x-movable-type", card.dataset.typeId);
  event.dataTransfer.setData("text/plain", `type:${card.dataset.typeId}`);
});

els.stage.addEventListener("dragstart", (event) => {
  const cell = event.target.closest(".cell[data-placement]");
  if (!cell) return;
  const payload = JSON.stringify({ kind: "placement", row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
  event.dataTransfer.setData("application/x-placement", payload);
  event.dataTransfer.setData("text/plain", `placement:${cell.dataset.row}:${cell.dataset.col}`);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

function parseDropPayload(dataTransfer) {
  const appPayload = dataTransfer.getData("application/x-placement");
  if (appPayload) {
    try {
      return JSON.parse(appPayload);
    } catch {
      // fall through to text parsing
    }
  }
  const typeId = dataTransfer.getData("application/x-movable-type");
  if (typeId) return { kind: "type", typeId };
  const text = dataTransfer.getData("text/plain");
  if (text.startsWith("placement:")) {
    const [, row, col] = text.split(":");
    return { kind: "placement", row: Number(row), col: Number(col) };
  }
  if (text.startsWith("type:")) return { kind: "type", typeId: text.slice(5) };
  if (text) return { kind: "type", typeId: text };
  return null;
}

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  handleDropOnCell(Number(cell.dataset.row), Number(cell.dataset.col), parseDropPayload(event.dataTransfer));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (cell.dataset.placement) {
    openProof(row, col);
  } else {
    addPlacement(row, col, state.selectedTypeId);
  }
});

els.proofBackdrop.addEventListener("click", (event) => {
  if (event.target === els.proofBackdrop || event.target.closest("[data-proof-close]")) {
    closeProof();
  }
});

els.proofBody.addEventListener("click", (event) => {
  if (!proofCell) return;
  const { row, col } = proofCell;
  const replaceButton = event.target.closest("[data-proof-replace]");
  if (replaceButton) {
    replacePlacement(row, col, replaceButton.dataset.proofReplace);
    return;
  }
  if (event.target.closest("[data-proof-worn]")) {
    const placement = getPlacement(row, col);
    if (placement) {
      placement.worn = !placement.worn;
      renderAll();
    }
    return;
  }
  if (event.target.closest("[data-proof-confirm]")) {
    const placement = getPlacement(row, col);
    if (placement) {
      placement.status = placement.status === "已确认" ? "待校" : "已确认";
      if (isReleased()) showToast("全部确认完成，版面已放行，可导出", "ok");
      renderAll();
    }
    return;
  }
  if (event.target.closest("[data-proof-remove]")) {
    removePlacement(row, col);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.proofBackdrop.hidden) closeProof();
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    // 旧草稿缺少每格状态，normalizePlacement 统一按待校处理
    state.placements = structuredClone(draft.placements).map(normalizePlacement);
    closeProof();
    renderAll();
    showToast("草稿已载入（旧草稿无状态的格子按待校处理）", "ok");
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();
