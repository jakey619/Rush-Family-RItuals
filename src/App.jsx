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
  getOpenChecklistItems,
  getVerseForDate,
  getOpenPriorities,
  normalizeChecklistItems,
  parseDateKey,
  normalizePriorities,
  shiftDate,
  toDateKey,
} from "./lib/defaults";
import { APP_CREATOR, VERSION_HISTORY } from "./lib/versionHistory";

function keyFor(profileId, date) {
  return `${profileId}__${date}`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REMINDER_SETTINGS_KEY = "routine_reminder_settings_v1";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.3.0";

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

function calcHydrationPct(entry) {
  return entry.hydrationGoal
    ? Math.min(100, Math.round((entry.totalWater / entry.hydrationGoal) * 100))
    : 0;
}

function calcMedVitPct(profile, entry) {
  const medsPct = calcPctFromIds(
    profile.medications.map((item) => item.id),
    entry.medChecks
  );
  const vitaminsPct = calcPctFromIds(
    profile.vitamins.map((item) => item.id),
    entry.vitaminChecks
  );

  return profile.medications.length || profile.vitamins.length
    ? Math.round((medsPct + vitaminsPct) / 2)
    : 0;
}

function calcOverallPct(profile, entry) {
  const values = [
    calcPctFromIds(profile.morningItems.map((item) => item.id), entry.morningChecks),
    calcPctFromIds(profile.nightItems.map((item) => item.id), entry.nightChecks),
    calcMedVitPct(profile, entry),
    calcHydrationPct(entry),
  ];

  if (profile.exerciseItems.length) {
    values.push(
      calcPctFromIds(profile.exerciseItems.map((item) => item.id), entry.exerciseChecks)
    );
  }

  return average(values);
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toWeekday(dateKey) {
  return WEEKDAY_LABELS[parseDateKey(dateKey).getDay()];
}

function getDateRange(endDate, days) {
  return Array.from({ length: days }, (_, index) =>
    shiftDate(endDate, index - (days - 1))
  );
}

function countRemaining(ids, checks = {}) {
  return ids.filter((id) => !checks[id]).length;
}

function getReminderDefaults() {
  return {
    enabled: false,
    morningTime: "06:45",
    nightTime: "20:00",
  };
}

const FAMILY_REFERENCE_SECTIONS = [
  {
    title: "Family Scripture",
    subtitle: "The verse that anchors the house",
    accent: "scripture",
    image: "family/family-scripture.jpg",
    body: [
      "Joshua 24:15 - And if it seems evil unto you to serve the Lord, choose you this day whom ye will serve ... But as for me and my house, we will serve the Lord.",
    ],
  },
  {
    title: "The Lord's Prayer",
    subtitle: "Shared prayer and daily posture",
    accent: "prayer",
    image: "family/lords-prayer.jpg",
    body: [
      "Our Father, who art in heaven, hallowed be thy Name, thy kingdom come, thy will be done, on earth as it is in heaven. Give us this day our daily bread. And forgive us our trespasses, as we forgive those who trespass against us. And lead us not into temptation, but deliver us from evil. For thine is the kingdom, and the power, and the glory, for ever and ever. Amen.",
    ],
  },
  {
    title: "God's Minute",
    subtitle: "A daily reminder about stewardship",
    accent: "minute",
    image: "family/gods-minute.jpg",
    body: [
      "I've only just a minute, only sixty seconds in it.",
      "Forced upon me, can't refuse it, didn't seek it, didn't choose it,",
      "But it's up to me to use it.",
      "I must suffer if I lose it, give an account if I abuse it,",
      "Just a tiny little minute, but eternity is in it.",
      "- Benjamin E. Mays",
    ],
  },
  {
    title: "Fruits of the Spirit (Galatians 5:22-23)",
    subtitle: "Character the family wants to live out",
    accent: "fruit",
    image: "family/fruits-of-the-spirit.jpg",
    body: [
      "Love (Agape): Unconditional, sacrificial love for others.",
      "Joy: Deep, spiritual contentment not dependent on circumstances.",
      "Peace: An inner tranquility stemming from trust in God.",
      "Patience (Forbearance): Endurance and tolerance under provocation or trial.",
      "Kindness: A tender, compassionate disposition.",
      "Goodness: Moral excellence and integrity in action.",
      "Faithfulness: Reliability, loyalty, and trustworthiness.",
      "Gentleness: Meekness and humility, rather than aggression.",
      "Self-Control: Mastery over desires, passions, and impulses.",
    ],
  },
  {
    title: "Family Values",
    subtitle: "The principles behind the crest",
    accent: "values",
    image: "family/family-values.jpg",
    body: [
      "Faith: Now faith is the substance of things hoped for, the evidence of things not seen. - Hebrews 11:1",
      "Family: Our family is a circle of strength; founded on faith, joined by love, kept by God, together forever.",
      "Education: The function of education is to teach one to think intensively and to think critically. Intelligence plus character - that is the goal of true education. - Martin Luther King, Jr.",
      "Service: The end of all knowledge should be service to others. - Cesar Chavez",
      "Love: The three most important things to have are faith, hope and love. But the greatest of them is love. - 1 Corinthians 13:13",
      "Quote (In the Parchment): Nothing in all the world is more dangerous than sincere ignorance and conscientious stupidity. - Dr. Martin Luther King, Jr.",
    ],
  },
  {
    title: "Armor of God",
    subtitle: "Spiritual readiness for daily life",
    accent: "armor",
    image: "family/armor-of-god.jpg",
    body: [
      "Belt of Truth (Ephesians 6:14): Protects against lies and deception by grounding the believer in God's truth.",
      "Breastplate of Righteousness (Ephesians 6:14): Guards the heart and soul, representing the righteousness given by Christ.",
      "Shoes of the Gospel of Peace (Ephesians 6:15): Provides firm footing and readiness to share the gospel.",
      "Shield of Faith (Ephesians 6:16): Protects against the flaming arrows of the enemy.",
      "Helmet of Salvation (Ephesians 6:17): Protects the mind from doubt and secures the believer's identity in Christ.",
      "Sword of the Spirit (Ephesians 6:17): The offensive weapon representing the Word of God used to fight temptation.",
    ],
  },
  {
    title: "Family Crest",
    subtitle: "Meaning behind the symbols",
    accent: "crest",
    image: "family/family-crest.png",
    body: [
      "Ring: Protection, never-ending love.",
      "Praying Hands: We are a praying family first.",
      "Fidelity: Faithfulness to all valued causes.",
      "Sincerity: Honest and realness with all.",
      "Justice: Just treatment of all.",
      "Shield: Willingness to provide and protect the family and its values.",
      "Family Names and Roots: Blue Crab for Baltimore roots of the Marshall and Lamar families. Lone Star for Texas roots of the Rush and Martin families.",
      "5 Points: Service, Education, Family, Faith, and strength through all things.",
      "3 Squares: Triquetra for family and love / Trinity, Heart for hope and charity, Parchment and Quill for education and wisdom.",
      "Cross: Faith and Christianity at the center of the family.",
      "Anchor: Hope and the family's naval history.",
      "Speared Lances: Power and the husband's role as provider and supporter of his wife.",
    ],
  },
  {
    title: "Scriptures",
    subtitle: "Embedded verses carried by the family",
    accent: "scripture",
    image: "family/scriptures.jpg",
    body: [
      "Joshua 24:15 - The Family Scripture: And if it seem evil unto you to serve the Lord, choose you this day whom ye will serve ... but as for me and my house, we will serve the Lord. - KJV",
      "1 Corinthians 13:13 - Embedded: The three most important things to have are faith, hope and love. But the greatest of them is love. - NIRV",
    ],
  },
];

function clampIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
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
    exerciseItems: Array.isArray(rawProfile?.exerciseItems)
      ? rawProfile.exerciseItems
      : fallback.exerciseItems,
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
    exerciseChecks: {
      ...base.exerciseChecks,
      ...(rawEntry?.exerciseChecks || {}),
    },

    nightPriorities: normalizePriorities(rawEntry?.nightPriorities),
    actionItems: normalizeChecklistItems(rawEntry?.actionItems),

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
  const normalizedLabel = label.toLowerCase().replace(/[\u2013\u2014]/g, "-");

  if (normalizedLabel.includes("activation / stretch")) {
    return [
      "20 bodyweight squats",
      "20 calf raises",
      "30-second plank",
      "10 glute bridges",
      "10 leg swings each side",
    ].join("\n");
  }

  if (normalizedLabel.includes("recovery / stretch")) {
    return [
      "Light Foam and/or Muscle Gun",
      "5 mins of streching",
    ].join("\n");
  }

  return "";
}

function buildCarryForwardEntry(profile, date, allEntries) {
  const nextEntry = emptyEntry(profile, date);
  const previousDate = shiftDate(date, -1);
  const previousRaw = allEntries[keyFor(profile.id, previousDate)];

  if (!previousRaw) {
    return nextEntry;
  }

  const previousEntry = normalizeEntry(profile, previousRaw, previousDate);
  const carriedPriorities = normalizePriorities([
    ...getOpenPriorities(previousEntry.nightPriorities),
    ...nextEntry.nightPriorities,
  ]);
  const carriedActionItems = normalizeChecklistItems(
    getOpenChecklistItems(previousEntry.actionItems)
  );

  return normalizeEntry(
    profile,
    {
      ...nextEntry,
      nightPriorities: carriedPriorities,
      actionItems: carriedActionItems,
      morningDistraction: previousEntry.morningDistraction || "",
      nightDistraction: previousEntry.nightDistraction || "",
    },
    date
  );
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
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [familySectionIndex, setFamilySectionIndex] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [reminderSettings, setReminderSettings] = useState(getReminderDefaults);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

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

  useEffect(() => {
    if (!hasLocalStorage()) return;

    const saved = localStorage.getItem(REMINDER_SETTINGS_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setReminderSettings((prev) => ({
        ...prev,
        ...parsed,
      }));
    } catch {
      // Ignore malformed reminder settings and fall back to defaults.
    }
  }, []);

  useEffect(() => {
    if (!hasLocalStorage()) return;
    localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(reminderSettings));
  }, [reminderSettings]);

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
    if (
      !reminderSettings.enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return undefined;
    }

    const maybeSendReminder = (type) => {
      const targetTime =
        type === "morning" ? reminderSettings.morningTime : reminderSettings.nightTime;
      if (!targetTime) return;

      const now = new Date();
      const dateKey = toDateKey(now);
      const [hour, minute] = targetTime.split(":").map(Number);

      if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) {
        return;
      }

      const sentKey = `reminder_sent_${type}_${dateKey}`;
      if (hasLocalStorage() && localStorage.getItem(sentKey)) {
        return;
      }

      const incompleteProfiles = profilesRef.current.filter((profile) => {
        const dailyEntry = normalizeEntry(
          profile,
          entriesRef.current[keyFor(profile.id, dateKey)],
          dateKey
        );

        if (type === "morning") {
          return calcPctFromIds(
            profile.morningItems.map((item) => item.id),
            dailyEntry.morningChecks
          ) < 100;
        }

        return calcPctFromIds(
          profile.nightItems.map((item) => item.id),
          dailyEntry.nightChecks
        ) < 100;
      });

      if (!incompleteProfiles.length) {
        if (hasLocalStorage()) {
          localStorage.setItem(sentKey, "1");
        }
        return;
      }

      new Notification(
        type === "morning" ? "Morning routines due" : "Night routines due",
        {
          body: `${incompleteProfiles.map((profile) => profile.displayName).join(", ")} still have items left.`,
        }
      );

      if (hasLocalStorage()) {
        localStorage.setItem(sentKey, "1");
      }
    };

    const runChecks = () => {
      maybeSendReminder("morning");
      maybeSendReminder("night");
    };

    runChecks();
    const intervalId = window.setInterval(runChecks, 60000);
    return () => window.clearInterval(intervalId);
  }, [reminderSettings]);

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
        exerciseItems: profileToSave.exerciseItems,
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

    const nextEntry = buildCarryForwardEntry(profile, date, currentEntries);
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

  function completeCurrentMorningTasks() {
    updateCurrentEntry((draft) => {
      profile.morningItems.forEach((item) => {
        draft.morningChecks[item.id] = true;
      });
    });
  }

  function completeCurrentNightTasks() {
    updateCurrentEntry((draft) => {
      profile.nightItems.forEach((item) => {
        draft.nightChecks[item.id] = true;
      });
    });
  }

  function resetHydration() {
    updateCurrentEntry((draft) => {
      draft.waterEntries = [];
      draft.totalWater = 0;
    });
  }

  function linkedPriorities() {
    const prevDate = shiftDate(selectedDate, -1);
    const profile = currentProfile();
    const prev = normalizeEntry(
      profile,
      entries[keyFor(selectedProfileId, prevDate)],
      prevDate
    );
    return normalizePriorities(prev.nightPriorities);
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

  function copyYesterdayPriorities() {
    const previousDate = shiftDate(selectedDate, -1);
    const previousEntry = normalizeEntry(
      profile,
      entriesRef.current[keyFor(selectedProfileId, previousDate)],
      previousDate
    );

    updateCurrentEntry((draft) => {
      draft.nightPriorities = normalizePriorities(
        getOpenPriorities(previousEntry.nightPriorities)
      );
    });
  }

  function updateNightPriorities(mutator) {
    updateCurrentEntry((draft) => {
      const nextItems = normalizePriorities(draft.nightPriorities);
      mutator(nextItems);
      draft.nightPriorities = normalizePriorities(nextItems);
    });
  }

  function updateMorningLinkedPriorities(mutator) {
    const nextItems = normalizePriorities(linkedPriorities());
    mutator(nextItems);
    updateLinkedMorningPriorities(normalizePriorities(nextItems));
  }

  function updateActionItems(mutator) {
    updateCurrentEntry((draft) => {
      const nextItems = normalizeChecklistItems(draft.actionItems);
      mutator(nextItems);
      draft.actionItems = normalizeChecklistItems(nextItems);
    });
  }

  const profile = currentProfile();
  const entry = normalizeEntry(profile, currentEntry(), selectedDate);
  const activeFamilySection =
    FAMILY_REFERENCE_SECTIONS[clampIndex(familySectionIndex, FAMILY_REFERENCE_SECTIONS.length)];
  const reviewDates = useMemo(() => getDateRange(selectedDate, 7), [selectedDate]);
  const insightDates = useMemo(() => getDateRange(selectedDate, 30), [selectedDate]);

  function summarizeProfileDay(targetProfile, date) {
    const dailyEntry = normalizeEntry(
      targetProfile,
      entries[keyFor(targetProfile.id, date)],
      date
    );
    const morningPct = calcPctFromIds(
      targetProfile.morningItems.map((item) => item.id),
      dailyEntry.morningChecks
    );
    const nightPct = calcPctFromIds(
      targetProfile.nightItems.map((item) => item.id),
      dailyEntry.nightChecks
    );
    const medVitPct = calcMedVitPct(targetProfile, dailyEntry);
    const exercisePct = calcPctFromIds(
      targetProfile.exerciseItems.map((item) => item.id),
      dailyEntry.exerciseChecks
    );
    const hydrationPct = calcHydrationPct(dailyEntry);
    const openPriorities = getOpenPriorities(dailyEntry.nightPriorities);
    const openActionItems = getOpenChecklistItems(dailyEntry.actionItems);

    return {
      date,
      weekday: toWeekday(date),
      entry: dailyEntry,
      morningPct,
      nightPct,
      medVitPct,
      exercisePct,
      hydrationPct,
      overallPct: calcOverallPct(targetProfile, dailyEntry),
      openPriorities,
      openActionItems,
      remainingMorning: countRemaining(
        targetProfile.morningItems.map((item) => item.id),
        dailyEntry.morningChecks
      ),
      remainingNight: countRemaining(
        targetProfile.nightItems.map((item) => item.id),
        dailyEntry.nightChecks
      ),
    };
  }

  const overviewRows = useMemo(() => {
    return profiles.map((profile) => {
      const today = summarizeProfileDay(profile, selectedDate);
      const weeklyDays = reviewDates.map((date) => summarizeProfileDay(profile, date));
      const last7Average = average(weeklyDays.map((day) => day.overallPct));
      const trendDelta = today.overallPct - weeklyDays[0].overallPct;
      let onTrackStreak = 0;

      for (let index = weeklyDays.length - 1; index >= 0; index -= 1) {
        if (weeklyDays[index].overallPct === 100) {
          onTrackStreak += 1;
        } else {
          break;
        }
      }

      return {
        profile,
        ...today,
        last7Average,
        trendDelta,
        onTrackStreak,
      };
    });
  }, [profiles, selectedDate, reviewDates, entries]);

  const familyDashboard = useMemo(() => {
    const completedProfiles = overviewRows.filter(
      (row) =>
        row.morningPct === 100 &&
        row.nightPct === 100 &&
        row.hydrationPct === 100 &&
        (!row.profile.exerciseItems.length || row.exercisePct === 100)
    ).length;
    const openPriorityCount = overviewRows.reduce(
      (sum, row) => sum + row.openPriorities.length,
      0
    );
    const openActionCount = overviewRows.reduce(
      (sum, row) => sum + row.openActionItems.length,
      0
    );
    const attentionRows = overviewRows
      .filter(
        (row) =>
          row.remainingMorning > 0 ||
          row.remainingNight > 0 ||
          row.openPriorities.length > 0 ||
          row.openActionItems.length > 0
      )
      .sort((left, right) => {
        const leftWeight =
          left.openPriorities.length * 8 +
          left.openActionItems.length * 6 +
          left.remainingMorning +
          left.remainingNight +
          (100 - left.overallPct);
        const rightWeight =
          right.openPriorities.length * 8 +
          right.openActionItems.length * 6 +
          right.remainingMorning +
          right.remainingNight +
          (100 - right.overallPct);
        return rightWeight - leftWeight;
      })
      .slice(0, 3);

    let spotlight = "Everyone is lined up well for today.";

    if (attentionRows.length) {
      const topRow = attentionRows[0];
      spotlight = `${topRow.profile.displayName} needs attention: ${
        topRow.remainingMorning + topRow.remainingNight
      } routine items left, ${topRow.openPriorities.length} open priorit${
        topRow.openPriorities.length === 1 ? "y" : "ies"
      }, and ${topRow.openActionItems.length} action item${
        topRow.openActionItems.length === 1 ? "" : "s"
      } still open.`;
    }

    const weeklyLeader = [...overviewRows].sort(
      (left, right) => right.last7Average - left.last7Average
    )[0];
    const momentumLeader = [...overviewRows].sort(
      (left, right) => right.trendDelta - left.trendDelta
    )[0];
    const streakLeader = [...overviewRows].sort(
      (left, right) => right.onTrackStreak - left.onTrackStreak
    )[0];

    return {
      familyScore: overviewRows.length
        ? average(overviewRows.map((row) => row.overallPct))
        : 0,
      completedProfiles,
      openPriorityCount,
      openActionCount,
      attentionRows,
      spotlight,
      weeklyLeader,
      momentumLeader,
      streakLeader,
    };
  }, [overviewRows]);

  const selectedProfileReview = useMemo(() => {
    return reviewDates.map((date) => summarizeProfileDay(profile, date));
  }, [entries, profile, reviewDates]);

  const streaks = useMemo(() => {
    const calculateStreak = (getValue) => {
      let streak = 0;

      for (let index = reviewDates.length - 1; index >= 0; index -= 1) {
        if (getValue(reviewDates[index]) === 100) {
          streak += 1;
        } else {
          break;
        }
      }

      return streak;
    };

    return {
      morning: calculateStreak((date) =>
        calcPctFromIds(
          profile.morningItems.map((item) => item.id),
          normalizeEntry(profile, entries[keyFor(profile.id, date)], date).morningChecks
        )
      ),
      night: calculateStreak((date) =>
        calcPctFromIds(
          profile.nightItems.map((item) => item.id),
          normalizeEntry(profile, entries[keyFor(profile.id, date)], date).nightChecks
        )
      ),
      hydration: calculateStreak((date) =>
        calcHydrationPct(normalizeEntry(profile, entries[keyFor(profile.id, date)], date))
      ),
    };
  }, [entries, profile, reviewDates]);

  const familyWeeklySummary = useMemo(() => {
    return profiles.map((reviewProfile) => {
      const values = reviewDates.map(
        (date) => summarizeProfileDay(reviewProfile, date).overallPct
      );

      return {
        profile: reviewProfile,
        weeklyScore: average(values),
      };
    });
  }, [entries, profiles, reviewDates]);

  const habitInsights = useMemo(() => {
    const allTasks = [
      ...profile.morningItems.map((item) => ({
        ...item,
        field: "morningChecks",
      })),
      ...profile.nightItems.map((item) => ({
        ...item,
        field: "nightChecks",
      })),
      ...profile.exerciseItems.map((item) => ({
        ...item,
        field: "exerciseChecks",
      })),
    ];

    const taskInsights = allTasks
      .map((task) => {
        const missedOn = [];

        insightDates.forEach((date) => {
          const dailyEntry = normalizeEntry(profile, entries[keyFor(profile.id, date)], date);
          if (!dailyEntry[task.field]?.[task.id]) {
            missedOn.push(date);
          }
        });

        return {
          id: `${task.field}:${task.id}`,
          label: task.label,
          missedCount: missedOn.length,
          missedDays: missedOn.reduce((accumulator, date) => {
            const day = toWeekday(date);
            accumulator[day] = (accumulator[day] || 0) + 1;
            return accumulator;
          }, {}),
        };
      })
      .sort((left, right) => right.missedCount - left.missedCount)
      .slice(0, 5)
      .map((task) => ({
        ...task,
        mostMissedDay:
          Object.entries(task.missedDays).sort((left, right) => right[1] - left[1])[0]?.[0] ||
          "None",
      }));

    const weekdayMisses = WEEKDAY_LABELS.map((day) => ({
      day,
      missedCount: insightDates.reduce((count, date) => {
        if (toWeekday(date) !== day) return count;
        const dailyEntry = normalizeEntry(profile, entries[keyFor(profile.id, date)], date);
        const morningMisses = profile.morningItems.filter(
          (item) => !dailyEntry.morningChecks[item.id]
        ).length;
        const nightMisses = profile.nightItems.filter(
          (item) => !dailyEntry.nightChecks[item.id]
        ).length;
        const exerciseMisses = profile.exerciseItems.filter(
          (item) => !dailyEntry.exerciseChecks[item.id]
        ).length;
        return count + morningMisses + nightMisses + exerciseMisses;
      }, 0),
    })).sort((left, right) => right.missedCount - left.missedCount);

    return {
      taskInsights,
      weekdayMisses,
    };
  }, [entries, insightDates, profile]);

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

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function openFamilySection(index = 0) {
    setFamilySectionIndex(clampIndex(index, FAMILY_REFERENCE_SECTIONS.length));
    setFamilyModalOpen(true);
  }

  function closeFamilyModal() {
    setFamilyModalOpen(false);
  }

  function openAbout() {
    setAboutOpen(true);
  }

  function closeAbout() {
    setAboutOpen(false);
  }

  function stepFamilySection(direction) {
    setFamilySectionIndex((currentIndex) =>
      clampIndex(currentIndex + direction, FAMILY_REFERENCE_SECTIONS.length)
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
            {syncing ? "Syncing..." : "Ready"} - v{APP_VERSION}
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

          <button
            className={view === "overview" ? "btn-primary" : "btn-secondary"}
            onClick={() => setView("overview")}
          >
            Family Dashboard
          </button>

          <button
            className={view === "detail" ? "btn-primary" : "btn-secondary"}
            onClick={() => setView("detail")}
          >
            Detail
          </button>

          <button
            className={view === "review" ? "btn-primary" : "btn-secondary"}
            onClick={() => setView("review")}
          >
            Review
          </button>

          <button
            className={familyModalOpen ? "btn-primary" : "btn-secondary"}
            onClick={() => openFamilySection(0)}
          >
            Family
          </button>

          <button
            className={aboutOpen ? "btn-primary" : "btn-secondary"}
            onClick={openAbout}
          >
            About
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
        <div className="grid">
          <div className="grid review-kpis">
            <div className="card">
              <div className="muted">Family Score</div>
              <div className="review-score">{familyDashboard.familyScore}%</div>
            </div>
            <div className="card">
              <div className="muted">Profiles Fully On Track</div>
              <div className="review-score">
                {familyDashboard.completedProfiles}/{profiles.length}
              </div>
            </div>
            <div className="card">
              <div className="muted">Open Priorities</div>
              <div className="review-score">{familyDashboard.openPriorityCount}</div>
            </div>
            <div className="card">
              <div className="muted">Open Action Items</div>
              <div className="review-score">{familyDashboard.openActionCount}</div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Needs Attention Now</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {selectedDate} snapshot
              </div>
              <div style={{ marginTop: 12 }}>{familyDashboard.spotlight}</div>

              <div style={{ marginTop: 16 }}>
                {familyDashboard.attentionRows.length ? (
                  familyDashboard.attentionRows.map((row) => (
                    <button
                      key={`attention-${row.profile.id}`}
                      className="dashboard-alert"
                      onClick={() => {
                        setSelectedProfileId(row.profile.id);
                        setView("detail");
                        setTab("actions");
                      }}
                    >
                      <div className="row space-between">
                        <strong>{row.profile.displayName}</strong>
                        <span className={statusClass(row.overallPct)}>{row.overallPct}%</span>
                      </div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        {row.remainingMorning + row.remainingNight} routine items left,{" "}
                        {row.openPriorities.length} priorities, {row.openActionItems.length} actions
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="muted">No urgent gaps right now.</div>
                )}
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Weekly Wins</div>
              <div className="muted" style={{ marginTop: 4 }}>
                Last 7 days ending {selectedDate}
              </div>

              <div className="dashboard-awards">
                <div className="award-card">
                  <div className="muted">Best 7-Day Average</div>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>
                    {familyDashboard.weeklyLeader?.profile.displayName || "-"}
                  </div>
                  <div className="muted">
                    {familyDashboard.weeklyLeader?.last7Average ?? 0}% average
                  </div>
                </div>

                <div className="award-card">
                  <div className="muted">Momentum Leader</div>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>
                    {familyDashboard.momentumLeader?.profile.displayName || "-"}
                  </div>
                  <div className="muted">
                    {familyDashboard.momentumLeader?.trendDelta > 0 ? "+" : ""}
                    {familyDashboard.momentumLeader?.trendDelta ?? 0} points vs. 7 days ago
                  </div>
                </div>

                <div className="award-card">
                  <div className="muted">Current On-Track Streak</div>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>
                    {familyDashboard.streakLeader?.profile.displayName || "-"}
                  </div>
                  <div className="muted">
                    {familyDashboard.streakLeader?.onTrackStreak ?? 0} perfect day
                    {(familyDashboard.streakLeader?.onTrackStreak ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                  <span className={statusClass(row.overallPct)}>
                    {row.overallPct === 0
                      ? "Not Started"
                      : row.overallPct === 100
                        ? "Complete"
                      : `${row.overallPct}%`}
                  </span>
                </div>

                <div className="overview-meta">
                  <span>7-day avg {row.last7Average}%</span>
                  <span>
                    Trend {row.trendDelta > 0 ? "+" : ""}
                    {row.trendDelta}
                  </span>
                  <span>
                    Streak {row.onTrackStreak} day
                    {row.onTrackStreak === 1 ? "" : "s"}
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
                  <div className="muted">Exercise {row.exercisePct}%</div>
                  <div className="progress">
                    <div style={{ width: `${row.exercisePct}%` }} />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="muted">Hydration {row.hydrationPct}%</div>
                  <div className="progress">
                    <div style={{ width: `${row.hydrationPct}%` }} />
                  </div>
                </div>

                <div className="dashboard-focus">
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Open Priorities
                  </div>
                  {row.openPriorities.length ? (
                    row.openPriorities.map((priority, index) => (
                      <div className="focus-chip" key={`${row.profile.id}-priority-${index}`}>
                        {priority.text}
                      </div>
                    ))
                  ) : (
                    <div className="muted">All priorities cleared for the next day.</div>
                  )}
                </div>

                <div className="dashboard-focus">
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Open Action Items
                  </div>
                  {row.openActionItems.length ? (
                    row.openActionItems.slice(0, 3).map((item, index) => (
                      <div className="focus-chip" key={`${row.profile.id}-action-${index}`}>
                        {item.text}
                      </div>
                    ))
                  ) : (
                    <div className="muted">No open action items.</div>
                  )}
                </div>

                <div style={{ marginTop: 12 }} className="muted">
                  Remaining: Morning {row.remainingMorning} | Night {row.remainingNight}
                </div>

                <div style={{ marginTop: 10 }} className="muted">
                  Sleep: {row.entry.sleepHours || "-"} hrs | Weight:{" "}
                  {row.entry.weight || "-"} | Read: {row.entry.readHours || 0} | Audio:{" "}
                  {row.entry.audiobookHours || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "review" && (
        <div className="grid">
          <div className="grid review-kpis">
            <div className="card">
              <div className="muted">7-Day Morning Streak</div>
              <div className="review-score">{streaks.morning} days</div>
            </div>
            <div className="card">
              <div className="muted">7-Day Night Streak</div>
              <div className="review-score">{streaks.night} days</div>
            </div>
            <div className="card">
              <div className="muted">7-Day Hydration Streak</div>
              <div className="review-score">{streaks.hydration} days</div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Weekly Review</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {profile.displayName} over the last 7 days ending {selectedDate}
              </div>

              <div className="trend-list" style={{ marginTop: 16 }}>
                {selectedProfileReview.map((day) => (
                  <div className="trend-row" key={day.date}>
                    <div className="trend-label">
                      <strong>{day.weekday}</strong>
                      <span className="muted">{day.date}</span>
                    </div>
                    <div className="trend-metrics">
                      <div className="mini-trend">
                        <span>Morning</span>
                        <div className="progress">
                          <div style={{ width: `${day.morningPct}%` }} />
                        </div>
                      </div>
                      <div className="mini-trend">
                        <span>Night</span>
                        <div className="progress">
                          <div style={{ width: `${day.nightPct}%` }} />
                        </div>
                      </div>
                      <div className="mini-trend">
                        <span>Meds</span>
                        <div className="progress">
                          <div style={{ width: `${day.medVitPct}%` }} />
                        </div>
                      </div>
                      <div className="mini-trend">
                        <span>Exercise</span>
                        <div className="progress">
                          <div style={{ width: `${day.exercisePct}%` }} />
                        </div>
                      </div>
                      <div className="mini-trend">
                        <span>Water</span>
                        <div className="progress">
                          <div style={{ width: `${day.hydrationPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Habit Insights</div>
              <div className="muted" style={{ marginTop: 4 }}>
                Most-missed routine items across the last 30 days
              </div>

              <div style={{ marginTop: 16 }}>
                {habitInsights.taskInsights.map((task) => (
                  <div className="insight-row" key={task.id}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{task.label}</div>
                      <div className="muted">
                        Missed {task.missedCount} times | most often on {task.mostMissedDay}
                      </div>
                    </div>
                    <span className={statusClass(Math.max(0, 100 - task.missedCount * 5))}>
                      {task.missedCount} missed
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Toughest Days</div>
                <div className="weekday-grid">
                  {habitInsights.weekdayMisses.map((day) => (
                    <div className="weekday-card" key={day.day}>
                      <div style={{ fontWeight: 800 }}>{day.day}</div>
                      <div className="muted">{day.missedCount} missed checks</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Family Snapshot</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Weekly averages across morning, night, and hydration
            </div>

            <div className="grid grid-overview" style={{ marginTop: 16 }}>
              {familyWeeklySummary.map((row) => (
                <div className="card" key={row.profile.id}>
                  <div className="row space-between">
                    <div style={{ fontWeight: 900 }}>{row.profile.displayName}</div>
                    <span className={statusClass(row.weeklyScore)}>{row.weeklyScore}%</span>
                  </div>
                  <div style={{ marginTop: 10 }} className="progress">
                    <div style={{ width: `${row.weeklyScore}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                  className={tab === "exercise" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("exercise")}
                >
                  Exercise
                </button>
                <button
                  className={tab === "metrics" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("metrics")}
                >
                  Metrics
                </button>
                <button
                  className={tab === "actions" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("actions")}
                >
                  Actions
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
                  (item) => {
                    const tooltip = getTaskTooltip(item.label);

                    return (
                    <label
                      className="check-row"
                      key={item.id}
                      title={tooltip || undefined}
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
                      <span title={tooltip || undefined}>{item.label}</span>
                    </label>
                    );
                  }
                )}
              </div>

              <div className="row" style={{ marginTop: 16 }}>
                {tab === "morning" && (
                  <button className="btn-primary" onClick={completeCurrentMorningTasks}>
                    Complete All Morning Tasks
                  </button>
                )}
                {tab === "night" && (
                  <button className="btn-primary" onClick={completeCurrentNightTasks}>
                    Complete All Night Tasks
                  </button>
                )}
                {tab === "night" && (
                  <button className="btn-secondary" onClick={copyYesterdayPriorities}>
                    Copy Yesterday&apos;s Priorities
                  </button>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Priorities</div>
                <ChecklistEditor
                  items={tab === "morning" ? linkedPriorities() : entry.nightPriorities}
                  minRows={3}
                  addLabel="Add Priority"
                  placeholder="Add a priority"
                  onToggle={(index, checked) => {
                    const runUpdate =
                      tab === "morning"
                        ? updateMorningLinkedPriorities
                        : updateNightPriorities;

                    runUpdate((items) => {
                      items[index] = {
                        ...(items[index] || { text: "", done: false }),
                        done: checked,
                      };
                    });
                  }}
                  onChangeText={(index, value) => {
                    const runUpdate =
                      tab === "morning"
                        ? updateMorningLinkedPriorities
                        : updateNightPriorities;

                    runUpdate((items) => {
                      items[index] = {
                        ...(items[index] || { text: "", done: false }),
                        text: value,
                      };
                    });
                  }}
                  onAdd={() => {
                    const runUpdate =
                      tab === "morning"
                        ? updateMorningLinkedPriorities
                        : updateNightPriorities;

                    runUpdate((items) => {
                      items.push({ text: "", done: false });
                    });
                  }}
                  onRemove={(index) => {
                    const runUpdate =
                      tab === "morning"
                        ? updateMorningLinkedPriorities
                        : updateNightPriorities;

                    runUpdate((items) => {
                      if (index < 3) {
                        items[index] = { text: "", done: false };
                        return;
                      }
                      items.splice(index, 1);
                    });
                  }}
                />
                <div className="muted" style={{ marginTop: 8 }}>
                  Checked priorities stay on the day they were completed. Only unchecked
                  priorities carry forward automatically.
                </div>
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

          {tab === "actions" && (
            <div className="card">
              <div className="row space-between">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Action Items</div>
                  <div className="muted">
                    Per-person action tracker embedded in the app. Open items carry forward.
                  </div>
                </div>
                <span
                  className={statusClass(
                    entry.actionItems.length
                      ? Math.round(
                          (entry.actionItems.filter((item) => item.text.trim() && item.done)
                            .length /
                            Math.max(
                              1,
                              entry.actionItems.filter((item) => item.text.trim()).length
                            )) *
                            100
                        )
                      : 0
                  )}
                >
                  {entry.actionItems.filter((item) => item.text.trim() && !item.done).length} open
                </span>
              </div>

              <div style={{ marginTop: 16 }}>
                <ChecklistEditor
                  items={entry.actionItems}
                  addLabel="Add Action Item"
                  placeholder="Add an action item"
                  emptyMessage="No action items yet."
                  onToggle={(index, checked) =>
                    updateActionItems((items) => {
                      items[index] = {
                        ...(items[index] || { text: "", done: false }),
                        done: checked,
                      };
                    })
                  }
                  onChangeText={(index, value) =>
                    updateActionItems((items) => {
                      items[index] = {
                        ...(items[index] || { text: "", done: false }),
                        text: value,
                      };
                    })
                  }
                  onAdd={() =>
                    updateActionItems((items) => {
                      items.push({ text: "", done: false });
                    })
                  }
                  onRemove={(index) =>
                    updateActionItems((items) => {
                      items.splice(index, 1);
                    })
                  }
                />
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                This keeps action tracking inside the app. If you later want Google Tasks,
                the safest path is syncing these action items outward instead of replacing them.
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

          {tab === "exercise" && (
            <div className="card">
              <div className="row space-between">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Exercise</div>
                  <div className="muted">Track the daily workout items for this person.</div>
                </div>

                <span
                  className={statusClass(
                    calcPctFromIds(
                      profile.exerciseItems.map((item) => item.id),
                      entry.exerciseChecks
                    )
                  )}
                >
                  {calcPctFromIds(
                    profile.exerciseItems.map((item) => item.id),
                    entry.exerciseChecks
                  )}
                  %
                </span>
              </div>

              <div style={{ marginTop: 14 }}>
                {profile.exerciseItems.length ? (
                  profile.exerciseItems.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={!!entry.exerciseChecks[item.id]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateCurrentEntry((draft) => {
                            draft.exerciseChecks[item.id] = checked;
                          });
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))
                ) : (
                  <div className="muted">No exercise defaults set for this person yet.</div>
                )}
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

                  <button className="btn-secondary" onClick={resetHydration}>
                    Reset Hydration
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

              <div className="card">
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
                  Reminders
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reminderSettings.enabled}
                    onChange={(e) =>
                      setReminderSettings((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span>Enable daily reminder checks while the app is open</span>
                </label>

                <div className="grid grid-2" style={{ marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Morning reminder time
                    </div>
                    <input
                      type="time"
                      value={reminderSettings.morningTime}
                      onChange={(e) =>
                        setReminderSettings((prev) => ({
                          ...prev,
                          morningTime: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Night reminder time
                    </div>
                    <input
                      type="time"
                      value={reminderSettings.nightTime}
                      onChange={(e) =>
                        setReminderSettings((prev) => ({
                          ...prev,
                          nightTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn-secondary"
                    onClick={enableNotifications}
                    disabled={notificationPermission === "granted"}
                  >
                    {notificationPermission === "granted"
                      ? "Notifications Enabled"
                      : "Enable Browser Notifications"}
                  </button>
                  <div className="muted">
                    {notificationPermission === "unsupported"
                      ? "This browser does not support notifications."
                      : `Permission: ${notificationPermission}`}
                  </div>
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

              <ListEditor
                title="Exercise Items"
                items={profile.exerciseItems}
                onAdd={(label) => addListItem("exerciseItems", label)}
                onRename={(id, label) => renameListItem("exerciseItems", id, label)}
                onRemove={(id) => removeListItem("exerciseItems", id)}
              />
            </div>
          )}
        </div>
      )}

      <div className="app-version">App version v{APP_VERSION}</div>

      {aboutOpen && (
        <div className="modal-backdrop" onClick={closeAbout}>
          <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="about-header">
              <div>
                <div style={{ fontWeight: 900, fontSize: 22 }}>About This App</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Rush Family Daily Routine Tracker
                </div>
              </div>
              <span className="badge">v{APP_VERSION}</span>
            </div>

            <div className="about-grid">
              <div className="about-card">
                <div style={{ fontWeight: 900 }}>Creator</div>
                <div style={{ marginTop: 8 }}>{APP_CREATOR}</div>
              </div>

              <div className="about-card">
                <div style={{ fontWeight: 900 }}>Release Status</div>
                <div style={{ marginTop: 8 }}>
                  {hasSupabaseConfig ? "Supabase sync enabled when online" : "Local-only mode"}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {isOnline ? "Currently online" : "Currently offline"}
                </div>
              </div>
            </div>

            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 18 }}>
              Version History
            </div>
            <div className="version-history">
              {VERSION_HISTORY.map((entry) => (
                <div className="version-history-item" key={entry.version}>
                <div className="row space-between">
                  <div style={{ fontWeight: 900 }}>v{entry.version}</div>
                  <div className="muted">{entry.title}</div>
                </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {entry.date} - {entry.commit === "working-tree"
                      ? "Pending commit/tag"
                      : `Commit ${entry.commit}`}
                  </div>
                  <div className="version-history-notes">
                    {entry.notes.map((note) => (
                      <p key={`${entry.version}-${note}`}>{note}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={closeAbout}>
                Close
              </button>
            </div>
          </div>
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

      {familyModalOpen && (
        <div className="modal-backdrop" onClick={closeFamilyModal}>
          <div className="modal family-modal" onClick={(e) => e.stopPropagation()}>
            <div
              className={`family-banner family-banner-${activeFamilySection.accent}`}
            >
              <div className="family-banner-copy">
                <div className="badge">Family Reference</div>
                <div className="family-banner-title">{activeFamilySection.title}</div>
                <div className="family-banner-subtitle">
                  {activeFamilySection.subtitle}
                </div>
              </div>
              <img
                className="family-banner-image"
                src={`${import.meta.env.BASE_URL}${activeFamilySection.image}`}
                alt={activeFamilySection.title}
              />
            </div>

            <div className="family-modal-toolbar">
              <button className="btn-secondary" onClick={() => stepFamilySection(-1)}>
                Previous
              </button>
              <div className="muted">
                Section {familySectionIndex + 1} of {FAMILY_REFERENCE_SECTIONS.length}
              </div>
              <button className="btn-secondary" onClick={() => stepFamilySection(1)}>
                Next
              </button>
            </div>

            <div className="family-modal-tabs">
              {FAMILY_REFERENCE_SECTIONS.map((section, index) => (
                <button
                  key={section.title}
                  className={index === familySectionIndex ? "btn-primary" : "btn-secondary"}
                  onClick={() => setFamilySectionIndex(index)}
                >
                  {section.title}
                </button>
              ))}
            </div>

            <div className="family-body family-modal-body">
              {activeFamilySection.body.map((line) => (
                <p key={`${activeFamilySection.title}-${line}`}>{line}</p>
              ))}
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <button className="btn-secondary" onClick={closeFamilyModal}>
                Close
              </button>
              <button className="btn-primary" onClick={() => stepFamilySection(1)}>
                Continue
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

function ChecklistEditor({
  items,
  onToggle,
  onChangeText,
  onAdd,
  onRemove,
  placeholder,
  addLabel,
  minRows = 0,
  emptyMessage = "Nothing here yet.",
}) {
  const normalizedItems = normalizeChecklistItems(items, minRows);
  const hasAnyText = normalizedItems.some((item) => item.text.trim());

  return (
    <div>
      <div className="checklist-list">
        {normalizedItems.map((item, index) => (
          <div className="checklist-row" key={`${index}-${item.text}`}>
            <input
              type="checkbox"
              checked={!!item.done}
              onChange={(e) => onToggle(index, e.target.checked)}
            />
            <input
              value={item.text}
              onChange={(e) => onChangeText(index, e.target.value)}
              placeholder={`${placeholder} #${index + 1}`}
            />
            <button className="btn-danger" onClick={() => onRemove(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {!hasAnyText && <div className="muted">{emptyMessage}</div>}

      <div style={{ marginTop: 12 }}>
        <button className="btn-secondary" onClick={onAdd}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}
