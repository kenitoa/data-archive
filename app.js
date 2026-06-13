const state = {
  index: null,
  selectedDate: "",
  selectedSource: "",
  loadedMode: "latest",
  articles: [],
  query: "",
  sort: "newest",
};

const colors = ["#7c5cff", "#55d6ff", "#b49cff", "#7aa7ff", "#d8d2ff", "#8ee7ff"];
const neonColors = [0x7c5cff, 0x55d6ff, 0xb49cff, 0x7aa7ff, 0xd8d2ff, 0x8ee7ff];
const threeGraph = {
  THREE: null,
  renderer: null,
  scene: null,
  camera: null,
  group: null,
  animationId: 0,
  loading: false,
  failed: false,
};

const elements = {
  generatedAt: document.querySelector("#generatedAt"),
  archiveWindow: document.querySelector("#archiveWindow"),
  totalCount: document.querySelector("#totalCount"),
  dateCount: document.querySelector("#dateCount"),
  selectedCount: document.querySelector("#selectedCount"),
  topSource: document.querySelector("#topSource"),
  dateTimeline: document.querySelector("#dateTimeline"),
  sourceList: document.querySelector("#sourceList"),
  visualTitle: document.querySelector("#visualTitle"),
  visualCaption: document.querySelector("#visualCaption"),
  canvas: document.querySelector("#archiveCanvas"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  loadAllButton: document.querySelector("#loadAllButton"),
  clearSourceButton: document.querySelector("#clearSourceButton"),
  articleGrid: document.querySelector("#articleGrid"),
  modal: document.querySelector("#articleModal"),
  modalSource: document.querySelector("#modalSource"),
  modalTitle: document.querySelector("#modalTitle"),
  modalMeta: document.querySelector("#modalMeta"),
  modalContent: document.querySelector("#modalContent"),
  modalLink: document.querySelector("#modalLink"),
  closeModal: document.querySelector("#closeModal"),
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "대기 중";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function cacheBust(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

async function fetchJson(path) {
  const response = await fetch(cacheBust(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 응답 오류 ${response.status}`);
  return response.json();
}

function getWindowLabel(item) {
  const windowInfo = item?.window || {};
  if (!windowInfo.start || !windowInfo.end) return "07:00 기준";
  return `${windowInfo.start.slice(5, 16).replace("T", " ")} - ${windowInfo.end.slice(5, 16).replace("T", " ")}`;
}

function getArticleText(article) {
  return [article.title, article.source_name, article.summary, article.content_text, article.source_url]
    .join(" ")
    .toLowerCase();
}

function sourceCounts(articles) {
  const map = new Map();
  articles.forEach((article) => {
    const source = article.source_name || "출처 미분류";
    map.set(source, (map.get(source) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"));
}

function filteredArticles() {
  const query = state.query.trim().toLowerCase();
  let list = state.articles.filter((article) => {
    const sourceOk = !state.selectedSource || (article.source_name || "출처 미분류") === state.selectedSource;
    const queryOk = !query || getArticleText(article).includes(query);
    return sourceOk && queryOk;
  });

  list = [...list].sort((a, b) => {
    if (state.sort === "source") {
      return String(a.source_name || "").localeCompare(String(b.source_name || ""), "ko-KR");
    }
    if (state.sort === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""), "ko-KR");
    }
    if (state.sort === "longest") {
      return String(b.content_text || "").length - String(a.content_text || "").length;
    }
    return String(b.archived_at || b.created_at || "").localeCompare(String(a.archived_at || a.created_at || ""));
  });

  return list;
}

function updateOverview() {
  const counts = sourceCounts(state.articles);
  const selected = filteredArticles();
  elements.totalCount.textContent = formatNumber(state.index?.total_count || 0);
  elements.dateCount.textContent = formatNumber((state.index?.dates || []).length);
  elements.selectedCount.textContent = formatNumber(selected.length);
  elements.topSource.textContent = counts[0] ? counts[0][0] : "-";
  elements.generatedAt.textContent = formatDateTime(state.index?.generated_at);
  elements.archiveWindow.textContent = state.index?.archive_window?.rule || "전날 07:00부터 당일 07:00까지";
}

function renderDates() {
  if (!elements.dateTimeline) return;
  const dates = state.index?.dates || [];
  elements.dateTimeline.innerHTML = "";

  if (!dates.length) {
    elements.dateTimeline.innerHTML = '<div class="empty-state">아직 생성된 날짜 JSON이 없습니다.</div>';
    return;
  }

  dates.forEach((item) => {
    const button = document.createElement("button");
    button.className = "date-node";
    button.type = "button";
    button.setAttribute("aria-pressed", item.date === state.selectedDate && state.loadedMode !== "all");
    button.innerHTML = `
      <span>
        <span class="date-label"></span>
        <span class="date-window"></span>
      </span>
      <span class="date-count"></span>
    `;
    button.querySelector(".date-label").textContent = item.label || item.date || "날짜 없음";
    button.querySelector(".date-window").textContent = getWindowLabel(item);
    button.querySelector(".date-count").textContent = formatNumber(item.count || 0);
    button.addEventListener("click", () => selectDate(item.date));
    elements.dateTimeline.appendChild(button);
  });
}

function renderSources() {
  if (!elements.sourceList) return;
  const counts = sourceCounts(state.articles);
  elements.sourceList.innerHTML = "";

  if (!counts.length) {
    elements.sourceList.innerHTML = '<div class="empty-state">출처 통계를 만들 데이터가 없습니다.</div>';
    return;
  }

  const max = counts[0][1] || 1;
  counts.slice(0, 12).forEach(([source, count]) => {
    const button = document.createElement("button");
    button.className = "source-node";
    button.type = "button";
    button.setAttribute("aria-pressed", source === state.selectedSource);
    button.innerHTML = `
      <span class="source-row"><span></span><strong></strong></span>
      <span class="source-bar"><span></span></span>
    `;
    button.querySelector(".source-row span").textContent = source;
    button.querySelector(".source-row strong").textContent = formatNumber(count);
    button.querySelector(".source-bar span").style.width = `${Math.max(8, (count / max) * 100)}%`;
    button.addEventListener("click", () => {
      state.selectedSource = state.selectedSource === source ? "" : source;
      renderAll();
    });
    elements.sourceList.appendChild(button);
  });
}

function drawCanvas() {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.max(220, Math.floor(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);

  const panel = (x, y, panelWidth, panelHeight, radius, fill, stroke) => {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + panelWidth - radius, y);
    context.quadraticCurveTo(x + panelWidth, y, x + panelWidth, y + radius);
    context.lineTo(x + panelWidth, y + panelHeight - radius);
    context.quadraticCurveTo(x + panelWidth, y + panelHeight, x + panelWidth - radius, y + panelHeight);
    context.lineTo(x + radius, y + panelHeight);
    context.quadraticCurveTo(x, y + panelHeight, x, y + panelHeight - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.stroke();
    }
  };

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#090b18");
  background.addColorStop(0.5, "#141026");
  background.addColorStop(1, "#071b24");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  for (let i = 0; i < 9; i += 1) {
    const x = -width * 0.15 + i * (width / 7);
    const beam = context.createLinearGradient(x, height, x + width * 0.28, 0);
    beam.addColorStop(0, "rgba(30, 184, 220, 0)");
    beam.addColorStop(0.48, "rgba(30, 184, 220, 0.18)");
    beam.addColorStop(1, "rgba(150, 86, 255, 0)");
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + 34, height);
    context.lineTo(x + width * 0.28 + 34, 0);
    context.lineTo(x + width * 0.28, 0);
    context.closePath();
    context.fill();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;
  for (let x = 24; x < width; x += 34) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 24; y < height; y += 34) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const articles = filteredArticles();
  const counts = sourceCounts(articles);
  const dates = state.index?.dates || [];
  const maxDateCount = Math.max(1, ...dates.map((item) => item.count || 0));
  const maxSource = Math.max(1, ...counts.map((item) => item[1]));

  panel(18, 18, width * 0.52, height - 36, 18, "rgba(255, 255, 255, 0.09)", "rgba(255, 255, 255, 0.2)");
  panel(width * 0.58, 28, width * 0.36, height * 0.42, 18, "rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.22)");
  panel(width * 0.58, height * 0.56, width * 0.36, height * 0.3, 18, "rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.18)");

  context.fillStyle = "rgba(255, 255, 255, 0.86)";
  context.font = "700 13px Arial";
  context.fillText("ARCHIVE CALENDAR", 38, 48);
  context.fillText("SOURCE FIELD", width * 0.61, 58);
  context.fillText("SIGNAL FLOW", width * 0.61, height * 0.62);

  const calendar = dates.slice(0, 35).reverse();
  const cellGap = 7;
  const columns = 7;
  const cellSize = Math.max(18, Math.min(42, (width * 0.46 - cellGap * (columns - 1)) / columns));
  const startX = 38;
  const startY = 72;
  calendar.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + col * (cellSize + cellGap);
    const y = startY + row * (cellSize + cellGap);
    const strength = Math.max(0.12, (item.count || 0) / maxDateCount);
    const selected = item.date === state.selectedDate || state.loadedMode === "all";
    const fill = selected
      ? `rgba(140, 92, 255, ${0.35 + strength * 0.42})`
      : `rgba(28, 191, 218, ${0.12 + strength * 0.34})`;
    panel(x, y, cellSize, cellSize, 8, fill, selected ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.16)");
    context.fillStyle = selected ? "#ffffff" : "rgba(255, 255, 255, 0.66)";
    context.font = "700 10px Arial";
    context.fillText(String(item.label || "").slice(-2), x + 8, y + cellSize - 10);
  });

  const centerX = width * 0.76;
  const centerY = height * 0.29;
  context.shadowBlur = 28;
  context.shadowColor = "rgba(37, 218, 233, 0.48)";
  context.fillStyle = "rgba(37, 218, 233, 0.88)";
  context.beginPath();
  context.arc(centerX, centerY, 14, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  counts.slice(0, 9).forEach(([source, count], index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, counts.slice(0, 9).length);
    const radius = 42 + (count / maxSource) * Math.min(width, height) * 0.16;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const color = colors[index % colors.length];
    context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(x, y);
    context.stroke();
    context.shadowBlur = 18;
    context.shadowColor = color;
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, 5 + (count / maxSource) * 12, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    if (index < 5) {
      context.fillStyle = "rgba(255, 255, 255, 0.76)";
      context.font = "11px Arial";
      context.fillText(source.slice(0, 11), x + 12, y + 4);
    }
  });

  const flowX = width * 0.62;
  const flowY = height * 0.72;
  const flowW = width * 0.28;
  const flowH = height * 0.12;
  context.lineWidth = 3;
  context.strokeStyle = "rgba(37, 218, 233, 0.9)";
  context.shadowBlur = 16;
  context.shadowColor = "rgba(37, 218, 233, 0.7)";
  context.beginPath();
  context.moveTo(flowX, flowY);
  context.bezierCurveTo(flowX + flowW * 0.22, flowY - flowH, flowX + flowW * 0.55, flowY + flowH, flowX + flowW, flowY - flowH * 0.2);
  context.stroke();
  context.strokeStyle = "rgba(184, 91, 255, 0.9)";
  context.beginPath();
  context.moveTo(flowX, flowY + 28);
  context.bezierCurveTo(flowX + flowW * 0.24, flowY + flowH * 1.15, flowX + flowW * 0.62, flowY - flowH * 0.8, flowX + flowW, flowY + 20);
  context.stroke();
  context.shadowBlur = 0;

  context.fillStyle = "rgba(255, 255, 255, 0.76)";
  context.font = "700 22px Arial";
  context.fillText(String(articles.length), flowX, flowY + 78);
  context.font = "12px Arial";
  context.fillText("visible articles", flowX + 54, flowY + 76);
}

function articleCard(article) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "article-card";
  const length = String(article.content_text || "").length;
  button.innerHTML = `
    <span class="article-source"></span>
    <h3></h3>
    <p></p>
    <span class="article-foot">
      <span></span>
      <span class="signal-chip"></span>
    </span>
  `;
  button.querySelector(".article-source").textContent = article.source_name || "출처 미분류";
  button.querySelector("h3").textContent = article.title || "제목 없음";
  button.querySelector("p").textContent = article.summary || article.content_text || "요약이 없습니다.";
  button.querySelector(".article-foot span:first-child").textContent = article.date || "";
  button.querySelector(".signal-chip").textContent = `${formatNumber(length)}자`;
  button.addEventListener("click", () => openArticle(article));
  return button;
}

function renderArticles() {
  const list = filteredArticles();
  elements.articleGrid.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.articles.length
      ? "현재 검색/출처 조건에 맞는 기사가 없습니다."
      : "선택한 범위에 표시할 보관 기사가 없습니다.";
    elements.articleGrid.appendChild(empty);
    return;
  }

  list.forEach((article) => elements.articleGrid.appendChild(articleCard(article)));
}

function renderVisualText() {
  const modeLabel = state.loadedMode === "all" ? "전체 날짜" : state.selectedDate || "선택 없음";
  const counts = sourceCounts(state.articles);
  elements.visualTitle.textContent = `${modeLabel} 3D Signal Line`;
  elements.visualCaption.textContent = counts.length
    ? `출처 ${formatNumber(counts.length)}곳, 기사 ${formatNumber(filteredArticles().length)}개가 현재 화면에 반영됩니다.`
    : "날짜 JSON이 생성되면 기사량과 출처 분포가 여기에 표시됩니다.";
}

function renderAll() {
  updateOverview();
  renderDates();
  renderSources();
  renderVisualText();
  renderArticles();
  requestAnimationFrame(renderGraph);
}

async function renderGraph() {
  if (threeGraph.failed) {
    drawCanvas();
    return;
  }

  if (!threeGraph.THREE && !threeGraph.loading) {
    threeGraph.loading = true;
    try {
      threeGraph.THREE = await import("https://unpkg.com/three@0.166.1/build/three.module.js");
      initializeThreeGraph();
    } catch (error) {
      threeGraph.failed = true;
      drawCanvas();
      return;
    } finally {
      threeGraph.loading = false;
    }
  }

  if (!threeGraph.THREE) return;
  updateThreeGraph();
}

function initializeThreeGraph() {
  const THREE = threeGraph.THREE;
  const canvas = elements.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070914, 14, 36);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 7.2, 13.5);
  camera.lookAt(0, 0.4, 0);

  const ambient = new THREE.AmbientLight(0x7c5cff, 1.15);
  const key = new THREE.DirectionalLight(0x55d6ff, 2.2);
  key.position.set(-4, 7, 6);
  const rim = new THREE.PointLight(0x7c5cff, 26, 22);
  rim.position.set(5, 4, -4);
  scene.add(ambient, key, rim);

  const group = new THREE.Group();
  scene.add(group);

  threeGraph.renderer = renderer;
  threeGraph.scene = scene;
  threeGraph.camera = camera;
  threeGraph.group = group;
}

function disposeThreeObject(object) {
  if (object.geometry) object.geometry.dispose();
  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material.dispose();
    }
  }
}

function clearThreeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse(disposeThreeObject);
  }
}

function resizeThreeRenderer() {
  const rect = elements.canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));
  threeGraph.renderer.setSize(width, height, false);
  threeGraph.camera.aspect = width / height;
  threeGraph.camera.updateProjectionMatrix();
}

function updateThreeGraph() {
  const THREE = threeGraph.THREE;
  const group = threeGraph.group;
  clearThreeGroup(group);
  resizeThreeRenderer();

  const dates = (state.index?.dates || []).slice(0, 26).reverse();
  const articles = filteredArticles();
  const counts = sourceCounts(articles).slice(0, 8);
  const maxDateCount = Math.max(1, ...dates.map((item) => item.count || 0));
  const maxSource = Math.max(1, ...counts.map((item) => item[1]));

  const grid = new THREE.GridHelper(18, 18, 0x55d6ff, 0x27304d);
  grid.position.y = -1.1;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  group.add(grid);

  const backGrid = new THREE.GridHelper(18, 18, 0x7c5cff, 0x27304d);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.z = -5.6;
  backGrid.material.transparent = true;
  backGrid.material.opacity = 0.16;
  group.add(backGrid);

  const axisMaterial = new THREE.LineBasicMaterial({ color: 0xb49cff, transparent: true, opacity: 0.28 });
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-8, -1, 0),
    new THREE.Vector3(8, -1, 0),
    new THREE.Vector3(-8, -1, -5),
    new THREE.Vector3(-8, 5.8, -5),
    new THREE.Vector3(-8, -1, -5),
    new THREE.Vector3(8, -1, -5),
  ]);
  group.add(new THREE.LineSegments(axisGeometry, axisMaterial));

  const datePoints = dates.length
    ? dates.map((item, index) => {
        const x = -7.4 + (index / Math.max(1, dates.length - 1)) * 14.8;
        const y = -0.7 + ((item.count || 0) / maxDateCount) * 5.6;
        const z = Math.sin(index * 0.82) * 1.8;
        return new THREE.Vector3(x, y, z);
      })
    : [
        new THREE.Vector3(-6, -0.2, 0),
        new THREE.Vector3(-2, 1.2, -1.1),
        new THREE.Vector3(2, 0.4, 1.4),
        new THREE.Vector3(6, 1.8, 0),
      ];

  const curve = new THREE.CatmullRomCurve3(datePoints);
  const tube = new THREE.TubeGeometry(curve, 180, 0.075, 12, false);
  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d2ff,
    emissive: 0x7c5cff,
    emissiveIntensity: 1.45,
    metalness: 0.18,
    roughness: 0.22,
  });
  group.add(new THREE.Mesh(tube, lineMaterial));

  const glowTube = new THREE.TubeGeometry(curve, 180, 0.18, 12, false);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x55d6ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(glowTube, glowMaterial));

  datePoints.forEach((point, index) => {
    const selected = dates[index]?.date === state.selectedDate || state.loadedMode === "all";
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(selected ? 0.18 : 0.12, 18, 18),
      new THREE.MeshStandardMaterial({
        color: selected ? 0xffffff : neonColors[index % neonColors.length],
        emissive: selected ? 0x7c5cff : neonColors[index % neonColors.length],
        emissiveIntensity: selected ? 1.8 : 0.9,
        roughness: 0.2,
      }),
    );
    sphere.position.copy(point);
    group.add(sphere);

    const dropGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(point.x, -1.05, point.z),
      new THREE.Vector3(point.x, point.y, point.z),
    ]);
    const drop = new THREE.Line(
      dropGeometry,
      new THREE.LineBasicMaterial({ color: 0x7aa7ff, transparent: true, opacity: 0.32 }),
    );
    group.add(drop);
  });

  counts.forEach(([source, count], index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, counts.length);
    const radius = 2.2 + (count / maxSource) * 3.4;
    const start = new THREE.Vector3(0, 0.4, 0);
    const end = new THREE.Vector3(Math.cos(angle) * radius, 0.25 + (count / maxSource) * 2.2, -3.2 + Math.sin(angle) * radius);
    const sourceCurve = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(end.x * 0.4, 1.4, end.z * 0.45),
      end,
    ]);
    const sourceTube = new THREE.TubeGeometry(sourceCurve, 56, 0.035 + (count / maxSource) * 0.05, 10, false);
    group.add(
      new THREE.Mesh(
        sourceTube,
        new THREE.MeshBasicMaterial({
          color: index % 2 ? 0x55d6ff : 0x7c5cff,
          transparent: true,
          opacity: 0.86,
        }),
      ),
    );

    const sourceNode = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 + (count / maxSource) * 0.28, 0.18, 0.34 + (count / maxSource) * 0.28),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? 0xb49cff : 0x8ee7ff,
        emissive: index % 2 ? 0x7c5cff : 0x55d6ff,
        emissiveIntensity: 1.1,
        roughness: 0.35,
      }),
    );
    sourceNode.position.copy(end);
    sourceNode.rotation.y = angle;
    group.add(sourceNode);
  });

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 11),
    new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -1.12;
  group.add(plate);

  group.rotation.x = -0.08;
  group.rotation.y = -0.36;

  cancelAnimationFrame(threeGraph.animationId);
  const animate = (time) => {
    group.rotation.y = -0.36 + Math.sin(time * 0.00028) * 0.08;
    threeGraph.renderer.render(threeGraph.scene, threeGraph.camera);
    threeGraph.animationId = requestAnimationFrame(animate);
  };
  animate(0);
}

async function selectDate(date) {
  const item = (state.index?.dates || []).find((entry) => entry.date === date);
  if (!item) return;
  state.selectedDate = date;
  state.loadedMode = "latest";
  state.selectedSource = "";
  elements.articleGrid.innerHTML = '<div class="empty-state">날짜 파일을 불러오는 중입니다.</div>';
  const payload = await fetchJson(item.file);
  state.articles = Array.isArray(payload.articles) ? payload.articles : [];
  renderAll();
}

async function loadAllDates() {
  const dates = state.index?.dates || [];
  if (!dates.length) return;
  state.loadedMode = "all";
  state.selectedDate = "";
  state.selectedSource = "";
  elements.articleGrid.innerHTML = '<div class="empty-state">전체 날짜 데이터를 불러오는 중입니다.</div>';
  const payloads = await Promise.all(dates.map((item) => fetchJson(item.file)));
  state.articles = payloads.flatMap((payload) => (Array.isArray(payload.articles) ? payload.articles : []));
  renderAll();
}

function openArticle(article) {
  elements.modalSource.textContent = article.source_name || "출처 미분류";
  elements.modalTitle.textContent = article.title || "제목 없음";
  elements.modalMeta.textContent = `${article.date || ""} / 문장 ${formatNumber(article.sentence_count || 0)}개`;
  elements.modalContent.innerHTML = "";
  const paragraphs = String(article.content_text || article.summary || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    paragraphs.push("본문 데이터가 없습니다.");
  }

  paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    elements.modalContent.appendChild(p);
  });

  const href = article.source_url || article.url || "";
  elements.modalLink.href = href || "#";
  elements.modalLink.style.display = href ? "inline-flex" : "none";
  elements.modal.classList.add("is-open");
  elements.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  elements.modal.classList.remove("is-open");
  elements.modal.setAttribute("aria-hidden", "true");
}

async function loadArchive() {
  try {
    elements.generatedAt.textContent = "불러오는 중";
    elements.articleGrid.innerHTML = '<div class="empty-state">main.json을 확인하는 중입니다.</div>';
    state.index = await fetchJson("main.json");
    const dates = state.index.dates || [];
    if (dates.length) {
      await selectDate(dates[0].date);
    } else {
      state.articles = [];
      state.selectedDate = "";
      state.selectedSource = "";
      renderAll();
    }
  } catch (error) {
    elements.generatedAt.textContent = "오류";
    elements.articleGrid.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = `데이터를 불러오지 못했습니다. ${error.message || error}`;
    elements.articleGrid.appendChild(empty);
  }
}

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  renderAll();
});

elements.sortSelect.addEventListener("change", () => {
  state.sort = elements.sortSelect.value;
  renderAll();
});

elements.refreshButton.addEventListener("click", loadArchive);
elements.loadAllButton?.addEventListener("click", loadAllDates);
elements.clearSourceButton?.addEventListener("click", () => {
  state.selectedSource = "";
  renderAll();
});

elements.closeModal.addEventListener("click", closeModal);
elements.modal.addEventListener("click", (event) => {
  if (event.target === elements.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
window.addEventListener("resize", () => requestAnimationFrame(renderGraph));

loadArchive();
