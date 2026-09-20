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
  released: false,
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();
let activeCell = null;
let toastTimer = null;

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stageWrap: document.querySelector(".stage-wrap"),
  stage: document.querySelector("#stage"),
  proofPopover: document.querySelector("#proofPopover"),
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
  releaseBadge: document.querySelector("#releaseBadge"),
  usageList: document.querySelector("#usageList"),
  proofList: document.querySelector("#proofList"),
  proofProgress: document.querySelector("#proofProgress"),
  releaseState: document.querySelector("#releaseState"),
  releaseBtn: document.querySelector("#releaseBtn"),
  releaseHint: document.querySelector("#releaseHint"),
  shortageList: document.querySelector("#shortageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  toast: document.querySelector("#toast")
};

function normalizePlacement(raw) {
  return {
    row: Number(raw.row),
    col: Number(raw.col),
    typeId: raw.typeId,
    // 旧草稿/旧状态没有校样字段，一律按待校处理
    status: raw.status === "confirmed" ? "confirmed" : "pending",
    worn: Boolean(raw.worn)
  };
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...(parsed.settings || {}) }
    };
    merged.inventory = Array.isArray(merged.inventory) ? merged.inventory : [];
    merged.placements = (Array.isArray(merged.placements) ? merged.placements : [])
      .map(normalizePlacement)
      // 字模已不存在的落字无法校样，丢弃
      .filter((p) => merged.inventory.some((item) => item.id === p.typeId));
    merged.drafts = Array.isArray(merged.drafts) ? merged.drafts : [];
    // 放行状态必须与逐格状态一致，刷新后做一致性校验
    merged.released =
      Boolean(parsed.released) &&
      merged.placements.length > 0 &&
      merged.placements.every((p) => p.status === "confirmed");
    return merged;
  } catch {
    return structuredClone(defaultState);
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

function findPlacement(row, col) {
  return state.placements.find((item) => item.row === row && item.col === col) || null;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function getProgress() {
  const total = state.placements.length;
  const confirmed = state.placements.filter((p) => p.status === "confirmed").length;
  return { total, confirmed, pending: total - confirmed };
}

function showToast(message, kind = "") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${kind}`;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
    els.toast.classList.remove("show");
  }, 2400);
}

// 放行后的任何新增/替换/移动/移除都使放行失效，涉及格子退回待校
function invalidateRelease(message = "放行后的版面发生改动，涉及格子已退回待校，需重新逐格确认后放行。") {
  if (!state.released) return;
  state.released = false;
  showToast(message, "warn");
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
      const remaining = item.quantity - used;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
            <em class="remain ${remaining <= 0 ? "zero" : ""}">余量 ${remaining}</em>
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
  const releasedClass = state.released ? "released" : "";
  els.stage.className = `stage ${state.settings.paperSize} ${releasedClass}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      if (!placement || !type) {
        cells.push(`
          <button class="cell ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列，空格"></button>
        `);
        continue;
      }
      const flags = `
        <span class="cell-flags">
          ${placement.worn ? '<i class="flag worn" title="磨损">磨</i>' : ""}
          ${placement.status === "confirmed" ? '<i class="flag ok" title="已确认">✓</i>' : '<i class="flag pend" title="待校">待</i>'}
        </span>`;
      cells.push(`
        <button class="cell used ${placement.status} ${placement.worn ? "worn" : ""} ${vertical}"
          draggable="true" data-row="${row}" data-col="${col}" type="button"
          aria-label="第${row + 1}行第${col + 1}列，${escapeHtml(type.char)}，${placement.status === "confirmed" ? "已确认" : "待校"}${placement.worn ? "，磨损" : ""}">
          <span class="cell-glyph">${escapeHtml(type.char)}</span>
          ${flags}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderProofAndUsage() {
  const usage = getUsage();
  const usedItems = state.inventory.filter((item) => usage[item.id]);
  const { total, confirmed, pending } = getProgress();
  els.placedCount.textContent = `${total}个落字`;

  const shortages = usedItems.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处缺字` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  els.shortageList.innerHTML = shortages
    .map(
      (item) => `
        <div class="shortage-item">
          <strong>缺 ${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
          <span>需 ${usage[item.id]} / 存 ${item.quantity}</span>
        </div>`
    )
    .join("");

  // 放行进度与导出闸门
  els.proofProgress.textContent = total ? `${confirmed}/${total} 格已确认` : "版面为空";
  if (state.released) {
    els.releaseState.textContent = "已放行";
    els.releaseState.className = "release-state ok";
    els.releaseBadge.textContent = "已放行 · 可导出";
    els.releaseBadge.className = "badge ok";
  } else if (total === 0) {
    els.releaseState.textContent = "无落字";
    els.releaseState.className = "release-state";
    els.releaseBadge.textContent = "空白版面";
    els.releaseBadge.className = "badge neutral";
  } else {
    els.releaseState.textContent = pending ? `待校 ${pending} 格` : "可放行";
    els.releaseState.className = `release-state ${pending ? "pending" : "ready"}`;
    els.releaseBadge.textContent = `待校样 ${confirmed}/${total}`;
    els.releaseBadge.className = "badge warn";
  }
  const canRelease = total > 0 && pending === 0 && !state.released;
  els.releaseBtn.disabled = !canRelease;
  els.releaseBtn.textContent = state.released ? "已放行" : "放行版面";
  els.releaseHint.textContent = state.released
    ? "版面已放行，可导出预览图；再改动落字将退回待校。"
    : total === 0
      ? "落字后逐格确认，全部确认才能放行导出。"
      : pending
        ? `还有 ${pending} 格待确认，全部确认后方可放行。`
        : "全部格子已确认，可以放行。";
  els.exportBtn.disabled = !state.released;
  els.exportBtn.title = state.released ? "导出预览图" : "请先逐格确认并放行版面";

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  els.usageList.innerHTML =
    usedItems
      .map((item) => {
        const used = usage[item.id];
        const remaining = item.quantity - used;
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>用${used}/${item.quantity} · 余${remaining}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;

  const ordered = [...state.placements].sort((a, b) => a.row - b.row || a.col - b.col);
  els.proofList.innerHTML = ordered
    .map((p) => {
      const type = state.inventory.find((item) => item.id === p.typeId);
      if (!type) return "";
      return `
        <article class="proof-item ${p.status} ${p.worn ? "worn" : ""}" data-proof-open="${placementKey(p.row, p.col)}">
          <span class="proof-glyph">${escapeHtml(type.char)}</span>
          <div class="proof-meta">
            <strong>${escapeHtml(type.char)} · ${escapeHtml(type.style)}</strong>
            <span>第${p.row + 1}行第${p.col + 1}列${p.worn ? " · 磨损" : ""} · ${p.status === "confirmed" ? "已确认" : "待校"}</span>
          </div>
          <button type="button" data-proof-toggle="${placementKey(p.row, p.col)}">${p.status === "confirmed" ? "撤回" : "确认"}</button>
        </article>
      `;
    })
    .join("") || `<p class="empty">落字后在此逐格校样确认。</p>`;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map((draft) => {
        const confirmed = draft.placements.filter((p) => p.status === "confirmed").length;
        return `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · 已校 ${confirmed}/${draft.placements.length} · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderPopover() {
  if (!activeCell) return;
  const { row, col } = activeCell;
  const placement = findPlacement(row, col);
  const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
  if (!placement || !type) {
    closePopover();
    return;
  }
  const usage = getUsage();
  const alternatives = state.inventory.filter((item) => item.char === type.char && item.style !== type.style);

  els.proofPopover.innerHTML = `
    <div class="proof-head">
      <strong>第${row + 1}行第${col + 1}列 · 校样</strong>
      <button class="mini-btn" type="button" data-action="close" title="关闭">×</button>
    </div>
    <div class="proof-type">
      <span class="glyph" style="font-size:${Math.min(type.size, 30)}px">${escapeHtml(type.char)}</span>
      <div class="proof-type-meta">
        <strong>${escapeHtml(type.char)} · ${escapeHtml(type.style)}</strong>
        <span>${type.size}px · ${escapeHtml(type.wear)} · ${placement.status === "confirmed" ? "已确认" : "待校"}${placement.worn ? " · 已标磨损" : ""}</span>
      </div>
    </div>
    <label class="proof-check">
      <input type="checkbox" data-action="worn-check" ${placement.worn ? "checked" : ""} />
      标记该格字模磨损
    </label>
    <div class="replace-block">
      <p class="replace-title">同字不同风格字模替换</p>
      ${
        alternatives.length
          ? alternatives
              .map((alt) => {
                const remaining = alt.quantity - (usage[alt.id] || 0);
                return `
                  <div class="replace-row ${remaining <= 0 ? "short" : ""}">
                    <span class="replace-glyph">${escapeHtml(alt.char)}</span>
                    <div class="proof-meta">
                      <strong>${escapeHtml(alt.style)}</strong>
                      <span>${alt.size}px · ${escapeHtml(alt.wear)} · 余量 ${remaining}/${alt.quantity}</span>
                    </div>
                    <button type="button" data-action="replace" data-type-id="${alt.id}" ${remaining <= 0 ? 'class="danger"' : ""}>替换</button>
                  </div>`;
              })
              .join("")
          : `<p class="empty">字模库中没有「${escapeHtml(type.char)}」字的其他风格字模，可先在左侧字模库加入。</p>`
      }
    </div>
    <div class="proof-foot">
      <button type="button" class="primary" data-action="toggle-confirm">${placement.status === "confirmed" ? "取消确认" : "确认此格"}</button>
      <button type="button" class="danger-btn" data-action="remove">移除落字</button>
    </div>
    <p class="proof-note">替换会先释放原字模余量再占用替字模；余量不足时整次拒绝，版面、余量与校样状态保持不变。</p>
  `;
  els.proofPopover.hidden = false;
  positionPopover();
}

function positionPopover() {
  if (!activeCell) return;
  const { row, col } = activeCell;
  const cell = els.stage.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) {
    closePopover();
    return;
  }
  const wrapRect = els.stageWrap.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  const width = els.proofPopover.offsetWidth;
  const height = els.proofPopover.offsetHeight;
  let left = rect.left - wrapRect.left + rect.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, els.stageWrap.clientWidth - width - 8));
  const below = rect.bottom - wrapRect.top + 10;
  const above = rect.top - wrapRect.top - height - 10;
  const top = below + height <= els.stageWrap.clientHeight ? below : Math.max(8, above);
  els.proofPopover.style.left = `${left}px`;
  els.proofPopover.style.top = `${top}px`;
}

function openPopover(row, col) {
  activeCell = { row, col };
  renderPopover();
}

function closePopover() {
  activeCell = null;
  els.proofPopover.hidden = true;
  els.proofPopover.innerHTML = "";
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderProofAndUsage();
  renderDrafts();
  if (activeCell) renderPopover();
}

// 在空格落字 / 向格子拖入字模：新内容一律待校；不做余量拦截（缺字仅提醒），
// 余量整次拒绝只适用于"磨损替字"。
function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) {
    showToast("请先在左侧选择一枚字模。", "warn");
    return;
  }
  const existing = findPlacement(row, col);
  if (existing) {
    if (existing.typeId === typeId) return;
    existing.typeId = typeId;
    existing.status = "pending";
    existing.worn = false;
  } else {
    state.placements.push({ row, col, typeId, status: "pending", worn: false });
  }
  invalidateRelease();
  renderAll();
}

// 已落字的格子可整体拖动到其他格子；涉及的格子（含交换双方）都退回待校
function applyMove(srcRow, srcCol, dstRow, dstCol) {
  if (srcRow === dstRow && srcCol === dstCol) return;
  const src = findPlacement(srcRow, srcCol);
  if (!src) return;
  const dst = findPlacement(dstRow, dstCol);
  if (dst) {
    const srcType = src.typeId;
    const srcWorn = src.worn;
    const dstType = dst.typeId;
    const dstWorn = dst.worn;
    src.typeId = dstType;
    src.worn = dstWorn;
    src.status = "pending";
    dst.typeId = srcType;
    dst.worn = srcWorn;
    dst.status = "pending";
  } else {
    state.placements = state.placements.filter((p) => p !== src);
    state.placements.push({ row: dstRow, col: dstCol, typeId: src.typeId, worn: src.worn, status: "pending" });
  }
  invalidateRelease();
  closePopover();
  renderAll();
}

function replaceWithAlternative(row, col, newTypeId) {
  const placement = findPlacement(row, col);
  if (!placement || placement.typeId === newTypeId) return;
  const target = state.inventory.find((item) => item.id === newTypeId);
  if (!target) return;
  const original = state.inventory.find((item) => item.id === placement.typeId);
  if (!original || original.char !== target.char) {
    showToast("只能替换为同字的其他风格字模。", "warn");
    return;
  }
  const usage = getUsage();
  const targetUsed = usage[target.id] || 0;
  // 原子校验：替字模余量不足则整次拒绝，什么都不改
  if (targetUsed + 1 > target.quantity) {
    showToast(
      `「${target.char} · ${target.style}」余量不足（仅剩 ${target.quantity - targetUsed} 枚），整次拒绝：版面、余量与校样状态均未改动。`,
      "error"
    );
    return;
  }
  placement.typeId = target.id;
  placement.status = "pending";
  placement.worn = false;
  invalidateRelease("已放行版面中的替字使该格退回待校，需重新确认后放行。");
  showToast(`已替换为「${target.char} · ${target.style}」，原字模余量已释放，该格回到待校。`, "ok");
  renderAll();
}

function toggleWorn(row, col, worn) {
  const placement = findPlacement(row, col);
  if (!placement) return;
  placement.worn = worn;
  renderAll();
}

function toggleConfirm(row, col) {
  const placement = findPlacement(row, col);
  if (!placement) return;
  placement.status = placement.status === "confirmed" ? "pending" : "confirmed";
  renderAll();
}

function removePlacement(row, col) {
  state.placements = state.placements.filter((p) => !(p.row === row && p.col === col));
  invalidateRelease();
  closePopover();
  renderAll();
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
    // 每格校样状态与磨损标记随草稿保存
    placements: structuredClone(state.placements.map(normalizePlacement)),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  showToast("草稿已保存（含每格校样状态）。", "ok");
  renderAll();
}

function releaseBoard() {
  const { total, pending } = getProgress();
  if (total === 0) {
    showToast("版面为空，无法放行。", "warn");
    return;
  }
  if (pending > 0) {
    showToast(`还有 ${pending} 格未确认，不能放行。`, "warn");
    return;
  }
  state.released = true;
  showToast("版面已放行，可以导出预览图。", "ok");
  renderAll();
}

function exportPreview() {
  if (!state.released) {
    showToast("版面尚未放行：请逐格确认全部格子并放行后再导出。", "error");
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
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
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
  const { cols, rows } = getGrid();
  const before = state.placements.length;
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  if (state.placements.length !== before) invalidateRelease("纸张尺寸变化移除了界外落字，放行已失效。");
  closePopover();
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
  if (activeCell) positionPopover();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.releaseBtn.addEventListener("click", releaseBoard);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  state.released = false;
  closePopover();
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    const removedCount = state.placements.filter((item) => item.typeId === typeId).length;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    if (removedCount) invalidateRelease("删除字模移除了相关落字，放行已失效。");
    closePopover();
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
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
  event.dataTransfer.effectAllowed = "copy";
});

// 已落字的格子拖动：携带格位，落位时整体移动
els.stage.addEventListener("dragstart", (event) => {
  const cell = event.target.closest(".cell.used");
  if (!cell) return;
  event.dataTransfer.setData("application/x-move-cell", `${cell.dataset.row}:${cell.dataset.col}`);
  event.dataTransfer.effectAllowed = "move";
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const moveData = event.dataTransfer.getData("application/x-move-cell");
  if (moveData) {
    const [srcRow, srcCol] = moveData.split(":").map(Number);
    applyMove(srcRow, srcCol, row, col);
    return;
  }
  const typeId = event.dataTransfer.getData("text/plain");
  if (typeId) placeType(row, col, typeId);
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.stopPropagation();
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (cell.classList.contains("used")) {
    if (activeCell && activeCell.row === row && activeCell.col === col) {
      closePopover();
    } else {
      openPopover(row, col);
    }
  } else {
    closePopover();
    placeType(row, col);
  }
});

// 校样弹层内操作
els.proofPopover.addEventListener("click", (event) => {
  if (!activeCell) return;
  event.stopPropagation();
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const { row, col } = activeCell;
  const action = actionEl.dataset.action;
  if (action === "close") {
    closePopover();
  } else if (action === "replace") {
    replaceWithAlternative(row, col, actionEl.dataset.typeId);
  } else if (action === "toggle-confirm") {
    toggleConfirm(row, col);
  } else if (action === "remove") {
    removePlacement(row, col);
  }
});

els.proofPopover.addEventListener("change", (event) => {
  if (!activeCell) return;
  if (event.target.dataset.action === "worn-check") {
    toggleWorn(activeCell.row, activeCell.col, event.target.checked);
  }
});

// 逐格校样列表：按钮确认/撤回，点条目打开该格弹层
els.proofList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-proof-toggle]");
  if (toggle) {
    event.stopPropagation();
    const [row, col] = toggle.dataset.proofToggle.split(":").map(Number);
    toggleConfirm(row, col);
    return;
  }
  const item = event.target.closest("[data-proof-open]");
  if (item) {
    const [row, col] = item.dataset.proofOpen.split(":").map(Number);
    if (findPlacement(row, col)) openPopover(row, col);
  }
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    // 旧草稿缺少状态字段时按待校处理
    state.placements = structuredClone(draft.placements)
      .map(normalizePlacement)
      .filter((p) => state.inventory.some((item) => item.id === p.typeId));
    state.released = false;
    closePopover();
    renderAll();
    showToast("草稿已载入，逐格校样状态已恢复，确认全部格子后可放行。", "ok");
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

// 点击弹层与格子之外的区域关闭弹层
document.addEventListener("click", (event) => {
  if (activeCell && !els.proofPopover.contains(event.target)) closePopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePopover();
});
window.addEventListener("resize", () => {
  if (activeCell) positionPopover();
});

renderAll();
