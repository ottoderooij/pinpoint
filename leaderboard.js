// Friends leaderboard, stored in Supabase via its REST API (no extra library needed).

const Leaderboard = (() => {
  const enabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const PROFILE_KEY = "pinpoint-profile";

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  function cleanGroup(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 30);
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Profile = nickname + group + a random id for this device, kept in localStorage.
  function loadProfile() {
    let profile = {};
    try {
      profile = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    } catch {}
    if (!profile.playerId) {
      profile.playerId = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
      saveProfile(profile);
    }
    // A group in the link (?g=vrienden) wins, so invite links just work.
    const fromLink = cleanGroup(new URLSearchParams(location.search).get("g"));
    if (fromLink && fromLink !== profile.group) {
      profile.group = fromLink;
      saveProfile(profile);
    }
    return profile;
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }

  function fallbackUuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function inviteLink(group) {
    const url = new URL(location.origin + location.pathname);
    if (group) url.searchParams.set("g", group);
    return url.toString();
  }

  async function submit({ day, mode, group, name, playerId, score, squares }) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?on_conflict=day,mode,group_code,player_id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ day, mode, group_code: group, name, player_id: playerId, score, squares }),
    });
    if (!res.ok) throw new Error(`Submit failed (${res.status})`);
  }

  async function fetchBoard(day, mode, group) {
    const params = new URLSearchParams({
      select: "name,score,squares,player_id",
      day: `eq.${day}`,
      mode: `eq.${mode}`,
      group_code: `eq.${group}`,
      order: "score.desc,created_at.asc",
      limit: "50",
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?${params}`, { headers });
    if (!res.ok) throw new Error(`Load failed (${res.status})`);
    return res.json();
  }

  function renderBoard(el, rows, playerId) {
    if (!rows.length) {
      el.innerHTML = `<p class="lb-empty">No scores yet today. Be the first!</p>`;
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    el.innerHTML = rows
      .map((r, i) => `
        <div class="lb-row${r.player_id === playerId ? " me" : ""}">
          <span class="lb-rank">${medals[i] || i + 1}</span>
          <span class="lb-name">${escapeHtml(r.name)}<small>${escapeHtml(r.squares)}</small></span>
          <span class="lb-score">${r.score}</span>
        </div>`)
      .join("");
  }

  return { enabled, cleanGroup, cleanName, loadProfile, saveProfile, inviteLink, submit, fetchBoard, renderBoard };
})();
