import type { GlossaryConflict, GlossaryEntry } from "@et/contracts";

export type SegmentSeed = "done" | "flagged" | "failed" | "pending";

export interface TranslationSeed {
  lang: string;
  bookTitle: string;
  chapters: Record<string, "done" | readonly SegmentSeed[]>;
  proofread?: readonly string[];
}

export interface VolumeSeed {
  id: string;
  title: string;
  volumeNumber: number;
  author?: string;
  translations?: readonly TranslationSeed[];
}

export interface ProjectSeed {
  id: string;
  name: string;
  glossary?: readonly GlossaryEntry[];
  conflicts?: readonly GlossaryConflict[];
  volumes: readonly VolumeSeed[];
}

export const FAILED_PASSAGE_NOTE = "The model returned no translation (529 Overloaded).";

const ALL_DONE = { c1: "done", c2: "done", c3: "done" } as const;

const ANGEL = "お隣の天使様にいつの間にか駄目人間にされていた件";
const ANGEL_EN = "The Angel Next Door Spoils Me Rotten";
const LONG_SERIES =
  "片田舎で静かに暮らしたかっただけの転生王女は、なぜか王国最強の魔導師として隣国の王子と辺境伯と騎士団長に同時に求婚されています";

export const MOCK_SEED: readonly ProjectSeed[] = [
  {
    id: "project-angel",
    name: ANGEL,
    glossary: [
      { source: "椎名真昼", target: "Mahiru Shiina", note: "female lead" },
      { source: "藤宮周", target: "Amane Fujimiya", note: "protagonist" },
      { source: "天使様", target: "Angel", note: "nickname for Mahiru" },
    ],
    conflicts: [
      {
        source: "椎名真昼",
        inForce: {
          target: "Mahiru Shiina",
          note: "female lead",
          bookId: "angel-1",
          volumeNumber: 1,
        },
        alternatives: [{ target: "Shiina Mahiru", bookId: "angel-2", volumeNumber: 2 }],
      },
    ],
    volumes: [
      {
        id: "angel-1",
        title: `${ANGEL} 1`,
        volumeNumber: 1,
        author: "佐伯さん",
        translations: [
          { lang: "en", bookTitle: `${ANGEL_EN}, Vol. 1`, chapters: ALL_DONE, proofread: ["c1"] },
        ],
      },
      {
        id: "angel-2",
        title: `${ANGEL} 2`,
        volumeNumber: 2,
        author: "佐伯さん",
        translations: [{ lang: "en", bookTitle: `${ANGEL_EN}, Vol. 2`, chapters: ALL_DONE }],
      },
      {
        id: "angel-2-5",
        title: `${ANGEL} 2.5`,
        volumeNumber: 2.5,
        author: "佐伯さん",
        translations: [
          {
            lang: "en",
            bookTitle: `${ANGEL_EN}, Vol. 2.5`,
            chapters: {
              c1: "done",
              c2: ["done", "done", "done", "failed", "failed", "pending"],
            },
          },
        ],
      },
      { id: "angel-3", title: `${ANGEL} 3`, volumeNumber: 3, author: "佐伯さん" },
    ],
  },
  {
    id: "project-long",
    name: LONG_SERIES,
    volumes: [
      {
        id: "long-1",
        title: `${LONG_SERIES} 第1巻 〜辺境の小さな薬草園と、拾った黒猫と、思いがけない来訪者〜`,
        volumeNumber: 1,
        author: "とても長いペンネームを持つ作家・イラストレーター共同名義",
      },
      {
        id: "long-2",
        title:
          "The Reincarnated Princess Who Only Wanted A Quiet Life: TheExtraordinarilyLongUnbrokenSubtitleOfTheSecondVolume 2",
        volumeNumber: 2,
      },
    ],
  },
  {
    id: "project-witch",
    name: "魔女の旅々",
    glossary: [
      { source: "イレイナ", target: "Elaina" },
      { source: "灰の魔女", target: "la Sorcière cendrée", note: "Elaina's title" },
    ],
    volumes: [
      {
        id: "witch-1",
        title: "魔女の旅々 1",
        volumeNumber: 1,
        author: "白石定規",
        translations: [
          { lang: "fr", bookTitle: "Le Voyage de la sorcière, tome 1", chapters: ALL_DONE },
        ],
      },
      {
        id: "witch-2",
        title: "魔女の旅々 2",
        volumeNumber: 2,
        author: "白石定規",
        translations: [
          { lang: "fr", bookTitle: "Le Voyage de la sorcière, tome 2", chapters: ALL_DONE },
        ],
      },
    ],
  },
  {
    id: "project-wolf",
    name: "狼と香辛料",
    glossary: [{ source: "ホロ", target: "Holo", note: "the Wisewolf" }],
    volumes: [
      {
        id: "wolf-1",
        title: "狼と香辛料",
        volumeNumber: 1,
        author: "支倉凍砂",
        translations: [{ lang: "en", bookTitle: "Spice and Wolf", chapters: ALL_DONE }],
      },
    ],
  },
];
