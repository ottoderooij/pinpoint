// ================= Settings =================
const ROUNDS = 5;
const MAX_ZOOM_OUTS = 5;
const ZOOM_STEP = 2;            // map zoom levels removed per zoom-out
const ZOOM_PENALTY = 0.12;      // each zoom-out takes 12% off the round score
const MAX_ROUND_SCORE = 1000;

const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIB = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
const STREET_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREET_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// ================= Helpers =================
const $ = (id) => document.getElementById(id);

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Puzzle number: days since launch, so everyone shares "Pinpoint #12".
function puzzleNumber() {
  const launch = new Date(2026, 8, 30); // 30 Sept 2026
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - launch) / 86400000) + 1;
}

// Seeded random so everyone gets the same 5 places on the same day.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickLocations(random) {
  const pool = [...LOCATIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, ROUNDS);
}

// Distance between two points on Earth in km (haversine formula).
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function scoreFor(km, zoomOuts) {
  const base = MAX_ROUND_SCORE * Math.exp(-km / 1000);
  const multiplier = 1 - ZOOM_PENALTY * zoomOuts;
  return Math.round(base * multiplier);
}

function emojiFor(score) {
  if (score >= 800) return "🟩";
  if (score >= 500) return "🟨";
  if (score >= 200) return "🟧";
  return "🟥";
}

function formatKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

// ================= Saved stats (localStorage) =================
const STORAGE_KEY = "pinpoint-stats";

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable (private mode) - the game still works, just without history.
  }
}

function recordDailyResult(total, rounds) {
  const stats = loadStats();
  const today = todayKey();
  if (stats.lastPlayed === today) return stats;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  stats.streak = stats.lastPlayed === todayKey(yesterday) ? (stats.streak || 0) + 1 : 1;
  stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);
  stats.played = (stats.played || 0) + 1;
  stats.best = Math.max(stats.best || 0, total);
  stats.lastPlayed = today;
  stats.today = { total, rounds, squares: rounds.map((r) => emojiFor(r.score)).join(""), postedTo: [] };
  saveStats(stats);
  return stats;
}

function renderStats(el) {
  const s = loadStats();
  el.innerHTML = `
    <div><b>${s.played || 0}</b>played</div>
    <div><b>${s.streak || 0}🔥</b>streak</div>
    <div><b>${s.best || 0}</b>best</div>`;
}

// ================= Maps =================
const clueMap = L.map("clue-map", {
  zoomControl: false,
  dragging: false,
  touchZoom: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  attributionControl: true,
}).setView([0, 0], 2);
L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTRIB, maxZoom: 18 }).addTo(clueMap);

const guessMap = L.map("guess-map", { worldCopyJump: true, minZoom: 1 }).setView([20, 0], 1);
L.tileLayer(STREET_TILES, { attribution: STREET_ATTRIB, maxZoom: 18 }).addTo(guessMap);

const actualIcon = L.divIcon({ className: "pin-actual", html: "🎯", iconSize: [28, 28], iconAnchor: [14, 14] });

let guessMarker = null;
let resultLayers = [];

// ================= Game state =================
let game = null;

function newGame(daily) {
  const seed = daily ? hashString("pinpoint-" + todayKey()) : Math.floor(Math.random() * 2 ** 32);
  game = {
    daily,
    locations: pickLocations(mulberry32(seed)),
    round: 0,
    zoomOuts: 0,
    guess: null,
    results: [],
    total: 0,
  };
  showScreen("screen-game");
  clueMap.invalidateSize();
  startRound();
}

function startRound() {
  const loc = game.locations[game.round];
  game.zoomOuts = 0;
  game.guess = null;

  clueMap.setView([loc.lat, loc.lng], loc.zoom, { animate: false });

  // Reset guess sheet
  if (guessMarker) guessMarker.remove();
  guessMarker = null;
  resultLayers.forEach((l) => l.remove());
  resultLayers = [];
  guessMap.setView([20, 0], 1);
  $("guess-sheet").classList.remove("open");
  $("result").classList.add("hidden");
  document.querySelector(".sheet-controls").classList.remove("hidden");
  $("btn-confirm").disabled = true;
  $("btn-confirm").textContent = "Tap the map to place a pin";

  updateHud();
}

function updateHud() {
  $("hud-round").textContent = `Round ${game.round + 1}/${ROUNDS}`;
  $("hud-score").textContent = `${game.total} pts`;

  const pips = $("zoom-pips");
  pips.innerHTML = "";
  for (let i = 0; i < MAX_ZOOM_OUTS; i++) {
    const pip = document.createElement("span");
    if (i < game.zoomOuts) pip.classList.add("used");
    pips.appendChild(pip);
  }

  const left = MAX_ZOOM_OUTS - game.zoomOuts;
  $("btn-zoomout").disabled = left === 0;
  $("zoom-cost").textContent = left === 0 ? "(none left)" : `(−${Math.round(ZOOM_PENALTY * 100)}%)`;
}

function zoomOut() {
  if (game.zoomOuts >= MAX_ZOOM_OUTS) return;
  game.zoomOuts++;
  const loc = game.locations[game.round];
  clueMap.flyTo([loc.lat, loc.lng], Math.max(2, loc.zoom - game.zoomOuts * ZOOM_STEP), { duration: 1 });
  updateHud();
}

function openGuess() {
  $("guess-sheet").classList.add("open");
  // Leaflet needs to re-measure once the sheet has slid in.
  setTimeout(() => guessMap.invalidateSize(), 320);
}

function closeGuess() {
  $("guess-sheet").classList.remove("open");
}

function placeGuess(e) {
  if (!$("result").classList.contains("hidden")) return; // round already scored
  const latlng = e.latlng.wrap();
  game.guess = latlng;
  if (guessMarker) guessMarker.setLatLng(e.latlng);
  else guessMarker = L.marker(e.latlng).addTo(guessMap);
  $("btn-confirm").disabled = false;
  $("btn-confirm").textContent = "Confirm guess";
}

function confirmGuess() {
  if (!game.guess) return;
  const loc = game.locations[game.round];
  const actual = L.latLng(loc.lat, loc.lng);
  const km = distanceKm(game.guess, actual);
  const score = scoreFor(km, game.zoomOuts);

  game.total += score;
  game.results.push({ name: loc.name, km, score, zoomOuts: game.zoomOuts });

  // Draw the answer
  const actualMarker = L.marker(actual, { icon: actualIcon }).addTo(guessMap);
  const line = L.polyline([guessMarker.getLatLng(), actual], {
    color: "#22c55e",
    weight: 3,
    dashArray: "6 8",
  }).addTo(guessMap);
  resultLayers.push(actualMarker, line);

  // Show the result panel
  document.querySelector(".sheet-controls").classList.add("hidden");
  $("result").classList.remove("hidden");
  $("result-emoji").textContent = emojiFor(score);
  $("result-name").textContent = `${loc.name}, ${loc.country}`;
  const zoomNote = game.zoomOuts ? ` · ${game.zoomOuts} zoom-out${game.zoomOuts > 1 ? "s" : ""}` : "";
  $("result-detail").textContent = `${formatKm(km)} away · +${score} pts${zoomNote}`;
  $("result-wiki").href = `https://en.wikipedia.org/wiki/${encodeURIComponent(loc.wiki)}`;
  $("btn-next").textContent = game.round + 1 < ROUNDS ? "Next round" : "See results";

  // Reveal the full clue image behind the sheet
  clueMap.setView(actual, loc.zoom, { animate: false });
  updateHud();
  // The result panel shrinks the map, so re-measure before zooming to fit both pins.
  setTimeout(() => {
    guessMap.invalidateSize();
    guessMap.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 10 });
  }, 50);
}

function nextRound() {
  game.round++;
  if (game.round < ROUNDS) startRound();
  else endGame();
}

// ================= End screen =================
function shareText() {
  const squares = game.results.map((r) => emojiFor(r.score)).join("");
  const title = game.daily ? `Pinpoint #${puzzleNumber()}` : "Pinpoint (practice)";
  const stats = loadStats();
  const streak = game.daily && stats.streak ? ` · 🔥${stats.streak}` : "";
  const group = Leaderboard.enabled ? Leaderboard.loadProfile().group : "";
  const link = location.hostname === "localhost" ? "" : `\n${Leaderboard.inviteLink(group)}`;
  return `🛰️ ${title}\n${squares} ${game.total}/${ROUNDS * MAX_ROUND_SCORE}${streak}${link}`;
}

function gradeFor(total) {
  const pct = total / (ROUNDS * MAX_ROUND_SCORE);
  if (pct >= 0.9) return ["🌍", "Human GPS"];
  if (pct >= 0.7) return ["🧭", "Seasoned explorer"];
  if (pct >= 0.45) return ["🗺️", "Decent navigator"];
  if (pct >= 0.2) return ["🎒", "Tourist"];
  return ["😵‍💫", "Hopelessly lost"];
}

function endGame() {
  if (game.daily) recordDailyResult(game.total, game.results);

  const [emoji, grade] = gradeFor(game.total);
  $("end-emoji").textContent = emoji;
  $("end-total").textContent = `${game.total.toLocaleString()} pts`;
  $("end-grade").textContent = grade;
  $("end-grid").innerHTML = game.results
    .map((r) => `<div class="end-row"><span>${emojiFor(r.score)} ${r.name}</span><span>${formatKm(r.km)} · ${r.score}</span></div>`)
    .join("");
  $("share-preview").textContent = shareText();
  renderStats($("end-stats"));
  showScreen("screen-end");
  if (game.daily) showPanel("end-board-slot");
  else $("lb-parking").appendChild($("lb-panel"));
}

// ================= Leaderboard panel =================
function showPanel(slotId, forceForm = false) {
  if (!Leaderboard.enabled) return;
  const panel = $("lb-panel");
  $(slotId).appendChild(panel);

  const profile = Leaderboard.loadProfile();
  const needsForm = forceForm || !profile.name || !profile.group;
  $("lb-form").classList.toggle("hidden-block", !needsForm);
  $("lb-content").classList.toggle("hidden-block", needsForm);
  if (needsForm) {
    $("lb-name").value = profile.name || "";
    $("lb-group").value = profile.group || "";
    return;
  }
  $("lb-title").textContent = `Today in "${profile.group}"`;
  loadBoard(profile);
}

async function loadBoard(profile) {
  const board = $("lb-board");
  board.innerHTML = `<p class="lb-empty">Loading…</p>`;
  const day = todayKey();
  try {
    // Post today's score to this group if we haven't yet.
    const stats = loadStats();
    if (stats.lastPlayed === day && stats.today && !(stats.today.postedTo || []).includes(profile.group)) {
      await Leaderboard.submit({
        day,
        group: profile.group,
        name: profile.name,
        playerId: profile.playerId,
        score: stats.today.total,
        squares: stats.today.squares || "",
      });
      stats.today.postedTo = [...(stats.today.postedTo || []), profile.group];
      saveStats(stats);
    }
    const rows = await Leaderboard.fetchBoard(day, profile.group);
    Leaderboard.renderBoard(board, rows, profile.playerId);
    if (stats.lastPlayed !== day) {
      board.insertAdjacentHTML("beforeend", `<p class="lb-empty">Play today's puzzle to get on the board.</p>`);
    }
  } catch (err) {
    console.error(err);
    board.innerHTML = `<p class="lb-empty">Couldn't reach the leaderboard. Check your connection and try again.</p>`;
  }
}

function joinGroup(e) {
  e.preventDefault();
  const name = Leaderboard.cleanName($("lb-name").value);
  const group = Leaderboard.cleanGroup($("lb-group").value);
  if (!name || !group) {
    toast("Fill in a nickname and group");
    return;
  }
  const profile = Leaderboard.loadProfile();
  Leaderboard.saveProfile({ ...profile, name, group });
  // Drop ?g= from the address bar so it no longer overrides the saved group.
  history.replaceState(null, "", location.pathname);
  showPanel($("lb-panel").parentElement.id);
  if ($("screen-end").classList.contains("active")) $("share-preview").textContent = shareText();
}

async function invite() {
  const { group } = Leaderboard.loadProfile();
  const url = Leaderboard.inviteLink(group);
  const text = `Join my Pinpoint group "${group}" and let's compare daily scores 🛰️`;
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Invite link copied!");
  } catch {
    toast(url);
  }
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard!");
  } catch {
    toast("Couldn't share, copy the text above");
  }
}

// ================= Start screen =================
function renderStart() {
  $("start-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }) + ` · #${puzzleNumber()}`;

  const stats = loadStats();
  const playedToday = stats.lastPlayed === todayKey();
  $("btn-daily").textContent = playedToday
    ? `✅ Done today: ${stats.today.total} pts`
    : "Play today's puzzle";
  $("btn-daily").disabled = playedToday;
  renderStats($("start-stats"));
  showScreen("screen-start");
}

// ================= Wire up =================
$("btn-daily").addEventListener("click", () => newGame(true));
$("btn-practice").addEventListener("click", () => newGame(false));
$("btn-zoomout").addEventListener("click", zoomOut);
$("btn-open-guess").addEventListener("click", openGuess);
$("btn-close-guess").addEventListener("click", closeGuess);
$("btn-confirm").addEventListener("click", confirmGuess);
$("btn-next").addEventListener("click", nextRound);
$("btn-share").addEventListener("click", share);
$("btn-home").addEventListener("click", renderStart);
guessMap.on("click", placeGuess);
$("btn-board").addEventListener("click", () => {
  showScreen("screen-board");
  showPanel("board-slot");
});
$("btn-board-back").addEventListener("click", renderStart);
$("lb-form").addEventListener("submit", joinGroup);
$("btn-invite").addEventListener("click", invite);
$("btn-lb-change").addEventListener("click", () => showPanel($("lb-panel").parentElement.id, true));

if (Leaderboard.enabled) document.body.classList.add("lb-on");
renderStart();
