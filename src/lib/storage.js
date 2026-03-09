import localforage from "localforage";

export const db = localforage.createInstance({
  name: "rush-family-rituals",
});

const KEYS = {
  profiles: "profiles",
  entries: "entries",
  pending: "pending",
};

export async function loadProfiles() {
  return (await db.getItem(KEYS.profiles)) || [];
}

export async function saveProfiles(profiles) {
  await db.setItem(KEYS.profiles, profiles);
}

export async function loadEntries() {
  return (await db.getItem(KEYS.entries)) || {};
}

export async function saveEntries(entries) {
  await db.setItem(KEYS.entries, entries);
}

export async function loadPending() {
  return (await db.getItem(KEYS.pending)) || [];
}

export async function savePending(pending) {
  await db.setItem(KEYS.pending, pending);
}