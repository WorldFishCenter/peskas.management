/**
 * Data Academy lesson catalog (manifest).
 *
 * Each entry corresponds to a static quarto-live page rendered from
 * `data-explorer/<slug>.qmd` into `public/data-explorer/lessons/<slug>.html` and served
 * by Vercel. The catalog (DataExplorer.tsx) renders one card per entry; available
 * lessons link out to the full-page lesson, placeholders render a disabled card.
 *
 * Titles/descriptions live in the `dataExplorer` i18n namespace under
 * `lessons.<slug>.title` / `lessons.<slug>.description`; category labels under
 * `categories.<category>`.
 *
 * ORDER MATTERS. The array order is the curriculum order, and lesson numbering
 * ("Lesson 3 of 5") is derived from it — see `lessonNumber` below.
 *
 * Each `.qmd` repeats its own position AND its `minutes` in a hard-coded strip at the top
 * ("Lesson 3 of 5 · about 20 minutes"), because a static lesson page cannot read this file.
 * So if you reorder, insert a lesson, or change a `minutes` value here, update that strip and
 * the "Next:" footer links in the affected `.qmd` files to match.
 */

/** Path under which rendered lesson HTML is served (static, outside React Router). */
export const LESSON_BASE_PATH = '/data-explorer/lessons';

export interface ExplorerLesson {
  /** URL slug; rendered page served at `${LESSON_BASE_PATH}/<slug>.html`. */
  slug: string;
  /** Category tag keys (resolved via i18n `categories.<key>`). */
  categories: string[];
  /** Whether the rendered lesson exists yet. Placeholders render as "coming soon". */
  available: boolean;
  /** Rough time to complete, in minutes. Shown on the card so a busy officer can plan. */
  minutes: number;
  /**
   * `reference` pages are not part of the numbered sequence (currently the printable recipe
   * card). They are excluded from lesson numbering and get their own call to action.
   */
  kind?: 'reference';
}

export const lessons: ExplorerLesson[] = [
  { slug: 'intro', categories: ['gettingStarted'], available: true, minutes: 10 },
  { slug: 'dataset', categories: ['gettingStarted'], available: true, minutes: 15 },
  // The "narrowing" verbs (distinct/filter/select) live in one lesson; aggregation in the next.
  { slug: 'find', categories: ['exploring'], available: true, minutes: 20 },
  { slug: 'summarise', categories: ['exploring'], available: true, minutes: 15 },
  { slug: 'chart', categories: ['presenting'], available: true, minutes: 15 },
  {
    slug: 'recipes',
    categories: ['reference'],
    available: true,
    minutes: 5,
    kind: 'reference',
  },
];

/** Total number of numbered lessons, i.e. excluding `reference` pages. */
export const LESSON_COUNT = lessons.filter((l) => l.kind !== 'reference').length;

/**
 * 1-based position of a lesson in the curriculum, or `null` for `reference` pages.
 * Derived from array order so the catalog and the lesson pages agree.
 */
export const lessonNumber = (slug: string): number | null => {
  const index = lessons.filter((l) => l.kind !== 'reference').findIndex((l) => l.slug === slug);
  return index === -1 ? null : index + 1;
};
