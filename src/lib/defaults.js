function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function item(label) {
  return { id: slugify(label), label };
}

export const VERSES = [
  { ref: "Proverbs 3:5-6", text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight." },
  { ref: "Philippians 4:13", text: "I can do all things through Christ who strengthens me." },
  { ref: "Joshua 1:9", text: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go." },
  { ref: "Psalm 23:1", text: "The Lord is my shepherd; I lack nothing." },
  { ref: "Isaiah 40:31", text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles." },
  { ref: "Romans 8:28", text: "And we know that in all things God works for the good of those who love him." },
  { ref: "2 Timothy 1:7", text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind." },
  { ref: "Psalm 119:105", text: "Your word is a lamp for my feet, a light on my path." },
  { ref: "Matthew 6:33", text: "Seek first his kingdom and his righteousness, and all these things will be given to you as well." },
  { ref: "Galatians 6:9", text: "Let us not grow weary in doing good, for at the proper time we will reap a harvest." }
];

export function getVerseForDate(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  const day = Math.floor(diff / 86400000);
  return VERSES[day % VERSES.length];
}

export function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export const DEFAULT_PROFILES = [
  {
    id: "tre",
    displayName: "Tre",
    hydrationGoal: 72,
    morningItems: [
      item("Pray"),
      item("Make Bed"),
      item("Straighten Room"),
      item("Activation / Stretch (5 - 10 minutes)"),
      item("Shower / Hygiene (15 - 20 minutes)"),
      item("Get Dressed"),
      item("Eat Breakfast"),
      item("Bible Study"),
      item("Review the previous Night's Priorities"),
      item("Brush Teeth (after eating)"),
      item("Sports Gear Setup"),
      item("Backpack Check"),
      item("Water Bottle"),
    ],
    nightItems: [
      item("Pack backpack (Sunday - Thursday)"),
      item("Pack sports gear (shoes/braces/etc.)"),
      item("Lay out clothes (incl. socks/undergarments)"),
      item("Fill water bottle & put in fridge"),
      item("Devices charging"),
      item("Alarm set"),
      item("Recovery / stretch (5-10 min)"),
      item("Wind down (no scrolling 30 min before bed)"),
    ],
    medications: [item("Melatonin")],
    vitamins: [item("Multivitamin"), item("Magnesium")],
  },
  {
    id: "anaya",
    displayName: "Anaya",
    hydrationGoal: 72,
    morningItems: [
      item("Pray"),
      item("Make Bed"),
      item("Straighten Room"),
      item("Activation / Stretch (5 - 10 minutes)"),
      item("Shower / Hygiene (15 - 20 minutes)"),
      item("Get Dressed"),
      item("Eat Breakfast"),
      item("Bible Study"),
      item("Review the previous Night's Priorities"),
      item("Brush Teeth (after eating)"),
      item("Sports Gear Setup"),
      item("Backpack Check"),
      item("Water Bottle"),
    ],
    nightItems: [
      item("Pack backpack (Sunday - Thursday)"),
      item("Pack sports gear (shoes/braces/etc.)"),
      item("Lay out clothes (incl. socks/undergarments)"),
      item("Fill water bottle & put in fridge"),
      item("Devices charging"),
      item("Alarm set"),
      item("Recovery / stretch (5-10 min)"),
      item("Wind down (no scrolling 30 min before bed)"),
    ],
    medications: [],
    vitamins: [],
  },
  {
    id: "robert",
    displayName: "Robert",
    hydrationGoal: 160,
    morningItems: [
      item("Make Bed"),
      item("Bible Study"),
      item("Pray"),
      item("Activation / Stretch (5 - 10 minutes)"),
      item("Shower / Hygiene (15 - 30 minutes)"),
      item("Get Dressed"),
      item("Work Bag"),
      item("Practice Equipment"),
      item("Water Bottle"),
    ],
    nightItems: [
      item("Work Bag (Sunday - Thursday)"),
      item("Sports Bags"),
      item("Lay out clothes (incl. socks/undergarments) - Work"),
      item("Lay out clothes (incl. socks/undergarments) - Practice"),
      item("Plan for the next day - Calendar Review"),
      item("Plan for the next day - Action Item Review / Add"),
      item("Devices charging"),
      item("Alarm set"),
      item("Recovery / stretch (5-10 min)"),
    ],
    medications: [
      item("Losartan"),
      item("Meloxicam"),
      item("Amlodipine Besylate"),
      item("Low Dose Aspirin"),
    ],
    vitamins: [
      item("Vitamin D"),
      item("Vitamin E"),
      item("Turmeric"),
      item("Iron"),
      item("Multivitamin"),
      item("Red Yeast Rice"),
    ],
  },
  {
    id: "karimah",
    displayName: "Karimah",
    hydrationGoal: 120,
    morningItems: [
      item("Wake kids up / Check on kids"),
      item("Make Breakfast"),
      item("Workout"),
      item("Bible Study"),
      item("Pray"),
      item("Take Kids to school"),
      item("Shower / Hygiene (15 - 30 minutes)"),
      item("Get Dressed"),
      item("Work Bag"),
      item("Water Bottle"),
    ],
    nightItems: [
      item("Work Bag (Sunday - Thursday)"),
      item("Lay out clothes (incl. socks/undergarments) - Work"),
      item("Plan for the next day - Calendar Review"),
      item("Plan for the next day - Action Item Review / Add"),
      item("Devices charging"),
      item("Alarm set"),
    ],
    medications: [],
    vitamins: [
      item("Vitamin D"),
      item("Multivitamin"),
      item("Fiber"),
    ],
  },
];

export function emptyEntry(profile, date) {
  return {
    profileId: profile.id,
    date,

    morningChecks: {},
    nightChecks: {},
    medChecks: {},
    vitaminChecks: {},

    nightPriorities: ["", "", ""],
    nightDistraction: "",
    nightGoal: "",
    morningDistraction: "",
    morningGoal: "",

    hydrationGoal: profile.hydrationGoal,
    waterEntries: [],
    totalWater: 0,

    weight: "",
    sleepHours: "",
    readHours: "",
    audiobookHours: "",

    medsNotes: "",
  };
}
