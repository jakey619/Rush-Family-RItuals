import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, FAMILY_ID, hasSupabaseConfig } from "./lib/supabase";
import {
  loadEntries,
  loadPending,
  loadProfiles,
  saveEntries,
  savePending,
  saveProfiles,
} from "./lib/storage";
import {
  DEFAULT_PROFILES,
  emptyEntry,
  getVerseForDate,
  shiftDate,
  toDateKey,
} from "./lib/defaults";

function keyFor(profileId, date) {
  return `${profileId}__${date}`;
}

function statusClass(pct) {
  if (pct === 100) return "badge complete";
  if (pct > 0) return "badge progress";
  return "badge";
}

function calcPctFromIds(ids, checks = {}) {
  if (!ids.length) return 0;
  const done = ids.filter((id) => !!checks[id]).length;
  return Math.round((done / ids.length) * 100);
}

function normalizeProfile(rawProfile) {
  const fallback =
    DEFAULT_PROFILES.find((p) => p.id === rawProfile?.id) || DEFAULT_PROFILES[0];

  return {
    ...fallback,
    ...rawProfile,
    id: rawProfile?.id || fallback.id,
    displayName: rawProfile?.displayName?.trim() || fallback.displayName,
    hydrationGoal:
      Number(rawProfile?.hydrationGoal) || Number(fallback.hydrationGoal) || 0,
    morningItems: Array.isArray(rawProfile?.morningItems)
      ? rawProfile.morningItems
      : fallback.morningItems,
    nightItems: Array.isArray(rawProfile?.nightItems)
      ? rawProfile.nightItems
      : fallback.nightItems,
    medications: Array.isArray(rawProfile?.medications)
      ? rawProfile.medications
      : fallback.medications,
    vitamins: Array.isArray(rawProfile?.vitamins)
      ? rawProfile.vitamins
      : fallback.vitamins,
  };
}

function mergeProfilesWithDefaults(profileRows) {
  const map = new Map();

  DEFAULT_PROFILES.forEach((p) => {
    map.set(p.id, normalizeProfile(p));
  });

  (profileRows || []).forEach((p) => {
    map.set(p.id, normalizeProfile(p));
  });

  return Array.from(map.values());
}

function normalizeEntry(profile, rawEntry, date) {
  const base = emptyEntry(profile, date);

  return {
    ...base,
    ...(rawEntry || {}),
    profileId: rawEntry?.profileId || profile.id,
    date: rawEntry?.date || date,

    morningChecks: {
      ...base.morningChecks,
      ...(rawEntry?.morningChecks || {}),
    },
    nightChecks: {
      ...base.nightChecks,
      ...(rawEntry?.nightChecks || {}),
    },
    medChecks: {
      ...base.medChecks,
      ...(rawEntry?.medChecks || {}),
    },
    vitaminChecks: {
      ...base.vitaminChecks,
      ...(rawEntry?.vitaminChecks || {}),
    },

    nightPriorities: Array.isArray(rawEntry?.nightPriorities)
      ? rawEntry.nightPriorities
      : ["", "", ""],

    waterEntries: Array.isArray(rawEntry?.waterEntries)
      ? rawEntry.waterEntries
      : [],

    totalWater: Number(rawEntry?.totalWater || 0),
    hydrationGoal: Number(rawEntry?.hydrationGoal || profile.hydrationGoal || 0),

    weight: rawEntry?.weight ?? "",
    sleepHours: rawEntry?.sleepHours ?? "",
    readHours: rawEntry?.readHours ?? "",
    audiobookHours: rawEntry?.audiobookHours ?? "",

    medsNotes: rawEntry?.medsNotes ?? "",
    morningDistraction: rawEntry?.morningDistraction ?? "",
    morningGoal: rawEntry?.morningGoal ?? "",
    nightDistraction: rawEntry?.nightDistraction ?? "",
    nightGoal: rawEntry?.nightGoal ?? "",
  };
}

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function getOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function hasLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getTaskTooltip(label) {
  if (label === "Activation / Stretch (5 - 10 minutes)") {
    return [
      "20 bodyweight squats",
      "20 calf raises",
      "30-second plank",
      "10 glute bridges",
      "10 leg swings each side",
    ].join("\n");
  }

  if (label === "Recovery / stretch (5-10 min)") {
    return [
      "Light Foam and/or Muscle Gun",
      "5 mins of streching",
    ].join("\n");
  }

  return "";
}

export default function App() {
  const [profiles, setProfiles] = useState(
    mergeProfilesWithDefaults(DEFAULT_PROFILES)
  );
  const [entries, setEntries] = useState({});
  const [pending, setPendingState] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(
    DEFAULT_PROFILES[0]?.id || "tre"
  );
  const [selectedDate, setSelectedDate] = useState(toDateKey());
  const [view, setView] = useState("overview");
  const [tab, setTab] = useState("morning");
  const [verseOpen, setVerseOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(getOnlineStatus);

  const profilesRef = useRef(profiles);
  const entriesRef = useRef(entries);
  const pendingRef = useRef(pending);

  // Bootstrap should run once on first mount; later date changes are handled separately.
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const verse = useMemo(() => getVerseForDate(selectedDate), [selectedDate]);

  useEffect(() => {
    const boot = async () => {
      const [cachedProfiles, cachedEntries, cachedPending] = await Promise.all([
        loadProfiles(),
        loadEntries(),
        loadPending(),
      ]);

      const usableProfiles = mergeProfilesWithDefaults(
        cachedProfiles?.length ? cachedProfiles : DEFAULT_PROFILES
      );

      setProfiles(usableProfiles);
      await saveProfiles(usableProfiles);

      if (cachedEntries && Object.keys(cachedEntries).length) {
        setEntries(cachedEntries);
      }

      if (cachedPending && cachedPending.length) {
        setPendingState(cachedPending);
      }

      const seenKey = `verse_seen_${selectedDate}`;
      if (hasLocalStorage() && !localStorage.getItem(seenKey)) {
        setVerseOpen(true);
      }

      if (hasSupabaseConfig) {
        await syncDown(usableProfiles, cachedEntries || {});
        await flushPending();
      }
    };

    boot();

    const connectionHandler = async () => {
      const online = getOnlineStatus();
      setIsOnline(online);

      if (!online || !hasSupabaseConfig) {
        return;
      }

      await flushPending();
      await syncDown();
    };

    window.addEventListener("online", connectionHandler);
    window.addEventListener("offline", connectionHandler);
    return () => {
      window.removeEventListener("online", connectionHandler);
      window.removeEventListener("offline", connectionHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const seenKey = `verse_seen_${selectedDate}`;
    if (hasLocalStorage() && !localStorage.getItem(seenKey)) {
      setVerseOpen(true);
    }
  }, [selectedDate]);

  useEffect(() => {
    const run = async () => {
      await ensureEntry(selectedProfileId, selectedDate);
    };
    run();
  }, [selectedProfileId, selectedDate, profiles]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    const entriesChannel = supabase
      .channel("daily-entries-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_entries",
          filter: `family_id=eq.${FAMILY_ID}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row) return;

          const latestProfiles = profilesRef.current;
          const profile =
            latestProfiles.find((p) => p.id === row.profile_id) ||
            DEFAULT_PROFILES.find((p) => p.id === row.profile_id);

          if (!profile) return;

          const normalized = normalizeEntry(
            profile,
            {
              profileId: row.profile_id,
              date: row.entry_date,
              ...row.payload,
            },
            row.entry_date
          );

          setEntries((prev) => {
            const next = {
              ...prev,
              [keyFor(row.profile_id, row.entry_date)]: normalized,
            };
            saveEntries(next);
            return next;
          });
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel("family-profiles-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "family_profiles",
          filter: `family_id=eq.${FAMILY_ID}`,
        },
        async () => {
          await syncProfilesOnly();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  async function queueOp(op) {
    setPendingState((prev) => {
      const next = [...prev, op];
      savePending(next);
      return next;
    });
  }

  async function replacePending(next) {
    setPendingState(next);
    await savePending(next);
  }

  function currentProfile() {
    return profiles.find((p) => p.id === selectedProfileId) || profiles[0];
  }

  function currentEntry() {
    return entries[keyFor(selectedProfileId, selectedDate)];
  }

  async function upsertProfile(profileToSave) {
    const { error } = await supabase.from("family_profiles").upsert({
      family_id: FAMILY_ID,
      profile_id: profileToSave.id,
      display_name: profileToSave.displayName,
      settings: {
        hydrationGoal: profileToSave.hydrationGoal,
        morningItems: profileToSave.morningItems,
        nightItems: profileToSave.nightItems,
        medications: profileToSave.medications,
        vitamins: profileToSave.vitamins,
      },
    });

    if (error) {
      throw error;
    }
  }

  async function upsertEntry(entryToSave) {
    const { error } = await supabase.from("daily_entries").upsert({
      family_id: FAMILY_ID,
      profile_id: entryToSave.profileId,
      entry_date: entryToSave.date,
      payload: { ...entryToSave },
    });

    if (error) {
      throw error;
    }
  }

  async function ensureEntry(profileId, date) {
    const k = keyFor(profileId, date);
    const profile = profilesRef.current.find((p) => p.id === profileId) || profilesRef.current[0];
    if (!profile) return null;

    const currentEntries = entriesRef.current;

    if (currentEntries[k]) {
      const normalized = normalizeEntry(profile, currentEntries[k], date);

      if (JSON.stringify(currentEntries[k]) !== JSON.stringify(normalized)) {
        const nextEntries = {
          ...currentEntries,
          [k]: normalized,
        };
        setEntries(nextEntries);
        await saveEntries(nextEntries);
      }

      return normalized;
    }

    const nextEntry = normalizeEntry(profile, null, date);
    const nextEntries = {
      ...currentEntries,
      [k]: nextEntry,
    };

    setEntries(nextEntries);
    await saveEntries(nextEntries);
    return nextEntry;
  }

  async function syncProfilesOnly() {
    if (!hasSupabaseConfig || !getOnlineStatus()) return;

    const { data: profileRows, error } = await supabase
      .from("family_profiles")
      .select("*")
      .eq("family_id", FAMILY_ID);

    if (error) return;

    const cloudProfiles = (profileRows || []).map((r) => ({
      id: r.profile_id,
      displayName: r.display_name,
      ...r.settings,
    }));

    const mergedProfiles = mergeProfilesWithDefaults(cloudProfiles);
    setProfiles(mergedProfiles);
    await saveProfiles(mergedProfiles);
  }

  async function syncDown(
    profileSource = profilesRef.current,
    entrySource = entriesRef.current
  ) {
    if (!hasSupabaseConfig || !getOnlineStatus()) return;

    setSyncing(true);
    try {
      const [
        { data: profileRows, error: profileErr },
        { data: entryRows, error: entryErr },
      ] = await Promise.all([
        supabase.from("family_profiles").select("*").eq("family_id", FAMILY_ID),
        supabase.from("daily_entries").select("*").eq("family_id", FAMILY_ID),
      ]);

      let latestProfiles = profileSource;

      if (!profileErr) {
        const cloudProfiles = (profileRows || []).map((r) => ({
          id: r.profile_id,
          displayName: r.display_name,
          ...r.settings,
        }));
        latestProfiles = mergeProfilesWithDefaults(cloudProfiles);
        setProfiles(latestProfiles);
        await saveProfiles(latestProfiles);
      }

      if (!entryErr && entryRows?.length) {
        const merged = { ...entrySource };

        entryRows.forEach((r) => {
          const profile =
            latestProfiles.find((p) => p.id === r.profile_id) ||
            DEFAULT_PROFILES.find((p) => p.id === r.profile_id);

          if (!profile) return;

          merged[keyFor(r.profile_id, r.entry_date)] = normalizeEntry(
            profile,
            {
              profileId: r.profile_id,
              date: r.entry_date,
              ...r.payload,
            },
            r.entry_date
          );
        });

        setEntries(merged);
        await saveEntries(merged);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function flushPending() {
    const latestPending = pendingRef.current;
    if (!hasSupabaseConfig || !getOnlineStatus() || !latestPending.length) return;

    setSyncing(true);
    const rest = [];

    try {
      for (const op of latestPending) {
        try {
          if (op.type === "profile") {
            const safeProfile = normalizeProfile(op.profile);
            await upsertProfile(safeProfile);
          }

          if (op.type === "entry") {
            await upsertEntry(op.entry);
          }
        } catch {
          rest.push(op);
        }
      }

      await replacePending(rest);
    } finally {
      setSyncing(false);
    }
  }

  async function persistProfiles(nextProfiles) {
    const safeProfiles = mergeProfilesWithDefaults(nextProfiles);

    setProfiles(safeProfiles);
    await saveProfiles(safeProfiles);

    if (hasSupabaseConfig && getOnlineStatus()) {
      for (const profile of safeProfiles) {
        const safeProfile = normalizeProfile(profile);
        try {
          await upsertProfile(safeProfile);
        } catch {
          await queueOp({ type: "profile", profile: safeProfile });
        }
      }
      return;
    }

    if (!hasSupabaseConfig) {
      return;
    }

    for (const profile of safeProfiles) {
      await queueOp({ type: "profile", profile: normalizeProfile(profile) });
    }
  }

  async function updateEntry(nextEntry) {
    const k = keyFor(nextEntry.profileId, nextEntry.date);

    setEntries((prev) => {
      const updated = {
        ...prev,
        [k]: nextEntry,
      };
      saveEntries(updated);
      return updated;
    });

    if (hasSupabaseConfig && getOnlineStatus()) {
      try {
        await upsertEntry(nextEntry);
        return;
      } catch {
        // fall through to queue
      }
    }

    if (!hasSupabaseConfig) {
      return;
    }

    await queueOp({ type: "entry", entry: nextEntry });
  }

  function updateCurrentEntry(mutator) {
    const k = keyFor(selectedProfileId, selectedDate);
    const existingRaw = entriesRef.current[k];
    const profile = currentProfile();

    if (!profile) return;

    const existing = normalizeEntry(profile, existingRaw, selectedDate);
    const next = deepClone(existing);
    mutator(next);
    updateEntry(next);
  }

  function linkedPriorities() {
    const prevDate = shiftDate(selectedDate, -1);
    const profile = currentProfile();
    const prev = normalizeEntry(
      profile,
      entries[keyFor(selectedProfileId, prevDate)],
      prevDate
    );
    return prev.nightPriorities || ["", "", ""];
  }

  function updateLinkedMorningPriorities(values) {
    const prevDate = shiftDate(selectedDate, -1);
    const profile = currentProfile();
    const prevKey = keyFor(selectedProfileId, prevDate);
    const existingPrev = normalizeEntry(profile, entriesRef.current[prevKey], prevDate);

    const next = deepClone(existingPrev);
    next.nightPriorities = values;
    updateEntry(next);
  }

  const overviewRows = useMemo(() => {
    return profiles.map((profile) => {
      const entry = normalizeEntry(
        profile,
        entries[keyFor(profile.id, selectedDate)],
        selectedDate
      );

      const morningPct = calcPctFromIds(
        profile.morningItems.map((x) => x.id),
        entry.morningChecks
      );

      const nightPct = calcPctFromIds(
        profile.nightItems.map((x) => x.id),
        entry.nightChecks
      );

      const medsPct = calcPctFromIds(
        profile.medications.map((x) => x.id),
        entry.medChecks
      );

      const vitaminsPct = calcPctFromIds(
        profile.vitamins.map((x) => x.id),
        entry.vitaminChecks
      );

      const medVitPct =
        profile.medications.length || profile.vitamins.length
          ? Math.round((medsPct + vitaminsPct) / 2)
          : 0;

      const hydrationPct = entry.hydrationGoal
        ? Math.min(100, Math.round((entry.totalWater / entry.hydrationGoal) * 100))
        : 0;

      return {
        profile,
        entry,
        morningPct,
        nightPct,
        medVitPct,
        hydrationPct,
      };
    });
  }, [profiles, entries, selectedDate]);

  const profile = currentProfile();
  const entry = normalizeEntry(profile, currentEntry(), selectedDate);

  async function addListItem(field, label) {
    if (!label.trim()) return;

    const nextProfiles = deepClone(profiles);
    const p = nextProfiles.find((x) => x.id === selectedProfileId);
    if (!p) return;

    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    p[field].push({
      id: `${id}-${Date.now()}`,
      label: label.trim(),
    });

    await persistProfiles(nextProfiles);
  }

  async function renameListItem(field, itemId, label) {
    const nextProfiles = deepClone(profiles);
    const p = nextProfiles.find((x) => x.id === selectedProfileId);
    if (!p) return;

    const item = p[field].find((x) => x.id === itemId);
    if (!item) return;

    item.label = label;
    await persistProfiles(nextProfiles);
  }

  async function removeListItem(field, itemId) {
    const nextProfiles = deepClone(profiles);
    const p = nextProfiles.find((x) => x.id === selectedProfileId);
    if (!p) return;

    p[field] = p[field].filter((x) => x.id !== itemId);
    await persistProfiles(nextProfiles);
  }

  function closeVerse() {
    if (hasLocalStorage()) {
      localStorage.setItem(`verse_seen_${selectedDate}`, "1");
    }
    setVerseOpen(false);
  }

  async function exportSummary() {
    const lines = [`Rush Family Daily Routine Tracker - ${selectedDate}`, ""];

    overviewRows.forEach((row) => {
      lines.push(
        `${row.profile.displayName}: Morning ${row.morningPct}% | Night ${row.nightPct}% | Meds/Vitamins ${row.medVitPct}% | Hydration ${row.hydrationPct}% | Sleep ${row.entry.sleepHours || "-"} | Weight ${row.entry.weight || "-"}`
      );
    });

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      alert("Summary copied to clipboard.");
    } catch {
      alert(text);
    }
  }

  function downloadAppFile() {
    alert(
      "Use your GitHub Pages site for the installed app. For file download, download the repo files or export a zip from GitHub."
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <h1>Rush Family Daily Routine Tracker</h1>
          <div className="subtext">
            Offline-first - {hasSupabaseConfig ? "Supabase sync" : "Local-only mode"} -{" "}
            {isOnline ? "Online" : "Offline"} -{" "}
            {syncing ? "Syncing..." : "Ready"}
          </div>
        </div>

        <div className="toolbar">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />

          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>

          <button className="btn-secondary" onClick={() => setView("overview")}>
            Overview
          </button>

          <button className="btn-secondary" onClick={() => setView("detail")}>
            Detail
          </button>

          <button className="btn-primary" onClick={exportSummary}>
            Export Day Summary
          </button>

          <button className="btn-secondary" onClick={downloadAppFile}>
            Download App
          </button>
        </div>
      </div>

      <div className="card verse-box" style={{ marginBottom: 14 }}>
        <div className="row space-between">
          <div>
            <div style={{ fontWeight: 900 }}>Bible Verse of the Day</div>
            <div className="muted">{verse.ref}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>{verse.text}</div>
      </div>

      {view === "overview" && (
        <div className="grid grid-overview">
          {overviewRows.map((row) => (
            <div
              key={row.profile.id}
              className="card click-card"
              onClick={() => {
                setSelectedProfileId(row.profile.id);
                setView("detail");
              }}
            >
              <div className="row space-between">
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {row.profile.displayName}
                </div>
                <span
                  className={statusClass(
                    Math.round(
                      (row.morningPct +
                        row.nightPct +
                        row.medVitPct +
                        row.hydrationPct) /
                        4
                    )
                  )}
                >
                  {row.morningPct || row.nightPct || row.medVitPct || row.hydrationPct
                    ? "In Progress"
                    : "Not Started"}
                </span>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted">Morning {row.morningPct}%</div>
                <div className="progress">
                  <div style={{ width: `${row.morningPct}%` }} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted">Night {row.nightPct}%</div>
                <div className="progress">
                  <div style={{ width: `${row.nightPct}%` }} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted">Meds/Vitamins {row.medVitPct}%</div>
                <div className="progress">
                  <div style={{ width: `${row.medVitPct}%` }} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted">Hydration {row.hydrationPct}%</div>
                <div className="progress">
                  <div style={{ width: `${row.hydrationPct}%` }} />
                </div>
              </div>

              <div style={{ marginTop: 10 }} className="muted">
                Sleep: {row.entry.sleepHours || "-"} hrs | Weight:{" "}
                {row.entry.weight || "-"} | Read: {row.entry.readHours || 0} | Audio:{" "}
                {row.entry.audiobookHours || 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "detail" && (
        <div className="grid">
          <div className="card">
            <div className="row space-between">
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {profile.displayName}
                </div>
                <div className="muted">Update {selectedDate}</div>
              </div>

              <div className="tabbar">
                <button
                  className={tab === "morning" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("morning")}
                >
                  Morning
                </button>
                <button
                  className={tab === "night" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("night")}
                >
                  Night
                </button>
                <button
                  className={tab === "meds" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("meds")}
                >
                  Meds / Vitamins
                </button>
                <button
                  className={tab === "metrics" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("metrics")}
                >
                  Metrics
                </button>
                <button
                  className={tab === "settings" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("settings")}
                >
                  Settings
                </button>
              </div>
            </div>
          </div>

          {(tab === "morning" || tab === "night") && (
            <div className="card">
              <div className="row space-between">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {tab === "morning" ? "Morning Routine" : "Night Routine"}
                  </div>
                  <div className="muted">
                    {tab === "morning"
                      ? "Night priorities carry into the next morning."
                      : "These priorities feed tomorrow morning."}
                  </div>
                </div>

                <span
                  className={statusClass(
                    calcPctFromIds(
                      (tab === "morning"
                        ? profile.morningItems
                        : profile.nightItems
                      ).map((x) => x.id),
                      tab === "morning" ? entry.morningChecks : entry.nightChecks
                    )
                  )}
                >
                  {calcPctFromIds(
                    (tab === "morning"
                      ? profile.morningItems
                      : profile.nightItems
                    ).map((x) => x.id),
                    tab === "morning" ? entry.morningChecks : entry.nightChecks
                  )}
                  %
                </span>
              </div>

              <div style={{ marginTop: 12 }}>
                {(tab === "morning" ? profile.morningItems : profile.nightItems).map(
                  (item) => (
                    <label
                      className="check-row"
                      key={item.id}
                      title={getTaskTooltip(item.label) || undefined}
                    >
                      <input
                        type="checkbox"
                        checked={
                          !!(
                            tab === "morning"
                              ? entry.morningChecks[item.id]
                              : entry.nightChecks[item.id]
                          )
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateCurrentEntry((draft) => {
                            if (tab === "morning") {
                              draft.morningChecks[item.id] = checked;
                            } else {
                              draft.nightChecks[item.id] = checked;
                            }
                          });
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  )
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Priorities</div>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <input
                      value={
                        tab === "morning"
                          ? linkedPriorities()[idx]
                          : entry.nightPriorities[idx]
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (tab === "morning") {
                          const next = [...linkedPriorities()];
                          next[idx] = value;
                          updateLinkedMorningPriorities(next);
                        } else {
                          updateCurrentEntry((draft) => {
                            draft.nightPriorities[idx] = value;
                          });
                        }
                      }}
                      placeholder={`Priority #${idx + 1}`}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-2" style={{ marginTop: 12 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {tab === "morning"
                      ? "Possible Distractions"
                      : "Possible Distractions for Tomorrow"}
                  </div>
                  <textarea
                    rows={3}
                    value={
                      tab === "morning"
                        ? entry.morningDistraction
                        : entry.nightDistraction
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        if (tab === "morning") {
                          draft.morningDistraction = value;
                        } else {
                          draft.nightDistraction = value;
                        }
                      });
                    }}
                  />
                </div>

                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {tab === "morning"
                      ? "Daily Goals"
                      : "Daily Goals for Tomorrow"}
                  </div>
                  <textarea
                    rows={3}
                    value={tab === "morning" ? entry.morningGoal : entry.nightGoal}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        if (tab === "morning") {
                          draft.morningGoal = value;
                        } else {
                          draft.nightGoal = value;
                        }
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "meds" && (
            <div className="card">
              <div className="row space-between">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    Medications & Vitamins
                  </div>
                  <div className="muted">Editable per person in Settings.</div>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginTop: 14 }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Medications</div>
                  {profile.medications.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={!!entry.medChecks[item.id]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateCurrentEntry((draft) => {
                            draft.medChecks[item.id] = checked;
                          });
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Vitamins</div>
                  {profile.vitamins.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={!!entry.vitaminChecks[item.id]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateCurrentEntry((draft) => {
                            draft.vitaminChecks[item.id] = checked;
                          });
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Notes</div>
                <textarea
                  rows={3}
                  value={entry.medsNotes}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateCurrentEntry((draft) => {
                      draft.medsNotes = value;
                    });
                  }}
                />
              </div>
            </div>
          )}

          {tab === "metrics" && (
            <div className="card">
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
                Daily Metrics
              </div>

              <div className="metric-grid">
                <div>
                  <div className="muted">Weight</div>
                  <input
                    value={entry.weight}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        draft.weight = value;
                      });
                    }}
                    placeholder="e.g. 182.4"
                  />
                </div>

                <div>
                  <div className="muted">Sleep hours</div>
                  <input
                    value={entry.sleepHours}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        draft.sleepHours = value;
                      });
                    }}
                    placeholder="e.g. 7.5"
                  />
                </div>

                <div>
                  <div className="muted">Read hours</div>
                  <input
                    value={entry.readHours}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        draft.readHours = value;
                      });
                    }}
                    placeholder="e.g. 0.5"
                  />
                </div>

                <div>
                  <div className="muted">Audiobook hours</div>
                  <input
                    value={entry.audiobookHours}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateCurrentEntry((draft) => {
                        draft.audiobookHours = value;
                      });
                    }}
                    placeholder="e.g. 1.25"
                  />
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div className="row space-between">
                  <div>
                    <div style={{ fontWeight: 900 }}>Hydration</div>
                    <div className="muted">
                      {entry.totalWater} oz / {entry.hydrationGoal} oz
                    </div>
                  </div>

                  <span
                    className={statusClass(
                      entry.hydrationGoal
                        ? Math.min(
                            100,
                            Math.round((entry.totalWater / entry.hydrationGoal) * 100)
                          )
                        : 0
                    )}
                  >
                    {entry.hydrationGoal
                      ? Math.min(
                          100,
                          Math.round((entry.totalWater / entry.hydrationGoal) * 100)
                        )
                      : 0}
                    %
                  </span>
                </div>

                <div className="progress" style={{ marginTop: 8 }}>
                  <div
                    style={{
                      width: `${
                        entry.hydrationGoal
                          ? Math.min(
                              100,
                              Math.round(
                                (entry.totalWater / entry.hydrationGoal) * 100
                              )
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="row" style={{ marginTop: 10 }}>
                  {[8, 12, 16, 20].map((oz) => (
                    <button
                      key={oz}
                      className="btn-secondary"
                      onClick={() =>
                        updateCurrentEntry((draft) => {
                          draft.waterEntries.push({
                            oz,
                            at: new Date().toISOString(),
                          });
                          draft.totalWater += oz;
                        })
                      }
                    >
                      +{oz} oz
                    </button>
                  ))}

                  <button
                    className="btn-danger"
                    onClick={() =>
                      updateCurrentEntry((draft) => {
                        const last = draft.waterEntries.pop();
                        draft.totalWater = Math.max(
                          0,
                          draft.totalWater - (last?.oz || 0)
                        );
                      })
                    }
                  >
                    Undo
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Hydration goal
                  </div>
                  <input
                    value={entry.hydrationGoal}
                    onChange={(e) => {
                      const value = Number(e.target.value) || 0;
                      updateCurrentEntry((draft) => {
                        draft.hydrationGoal = value;
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="grid">
              <div className="card">
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
                  Profile Settings
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Display name
                  </div>
                  <input
                    value={profile.displayName}
                    onChange={async (e) => {
                      const next = deepClone(profiles);
                      const target = next.find((p) => p.id === selectedProfileId);
                      if (!target) return;
                      target.displayName = e.target.value;
                      await persistProfiles(next);
                    }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Default hydration goal
                  </div>
                  <input
                    value={profile.hydrationGoal}
                    onChange={async (e) => {
                      const next = deepClone(profiles);
                      const target = next.find((p) => p.id === selectedProfileId);
                      if (!target) return;
                      target.hydrationGoal = Number(e.target.value) || 0;
                      await persistProfiles(next);
                    }}
                  />
                </div>
              </div>

              <ListEditor
                title="Morning Routine Items"
                items={profile.morningItems}
                onAdd={(label) => addListItem("morningItems", label)}
                onRename={(id, label) => renameListItem("morningItems", id, label)}
                onRemove={(id) => removeListItem("morningItems", id)}
              />

              <ListEditor
                title="Night Routine Items"
                items={profile.nightItems}
                onAdd={(label) => addListItem("nightItems", label)}
                onRename={(id, label) => renameListItem("nightItems", id, label)}
                onRemove={(id) => removeListItem("nightItems", id)}
              />

              <ListEditor
                title="Medications"
                items={profile.medications}
                onAdd={(label) => addListItem("medications", label)}
                onRename={(id, label) => renameListItem("medications", id, label)}
                onRemove={(id) => removeListItem("medications", id)}
              />

              <ListEditor
                title="Vitamins"
                items={profile.vitamins}
                onAdd={(label) => addListItem("vitamins", label)}
                onRename={(id, label) => renameListItem("vitamins", id, label)}
                onRemove={(id) => removeListItem("vitamins", id)}
              />
            </div>
          )}
        </div>
      )}

      {verseOpen && (
        <div className="modal-backdrop" onClick={closeVerse}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>
              Bible Verse of the Day
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {verse.ref}
            </div>
            <div style={{ marginTop: 12, lineHeight: 1.7 }}>{verse.text}</div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={closeVerse}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ListEditor({ title, items, onAdd, onRename, onRemove }) {
  const [newLabel, setNewLabel] = useState("");

  return (
    <div className="card">
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
        {title}
      </div>

      {items.map((item) => (
        <div className="list-editor-row" key={item.id}>
          <input
            value={item.label}
            onChange={(e) => onRename(item.id, e.target.value)}
          />
          <button className="btn-danger" onClick={() => onRemove(item.id)}>
            Remove
          </button>
        </div>
      ))}

      <div className="list-editor-row">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={`Add ${title.toLowerCase()} item`}
        />
        <button
          className="btn-primary"
          onClick={() => {
            onAdd(newLabel);
            setNewLabel("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
