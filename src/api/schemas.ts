/**
 * Zod runtime schemas for external Dynasty Scans REST API payloads.
 * Validates untrusted network responses at the API boundary.
 */

import { z } from "zod";

const strDef = (def = "") =>
  z.preprocess((v) => (v == null ? def : String(v)), z.string().default(def));

const strNull = () =>
  z.preprocess((v) => (v == null ? null : String(v)), z.string().nullable().default(null));

const arrDef = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(itemSchema).default([]));

export const ChapterTagSchema = z.looseObject({
  type: strDef("General"),
  name: strDef(""),
  permalink: strDef(""),
});

export const ChapterPageSchema = z.looseObject({
  name: strDef(""),
  url: z.string(),
});

export const ChapterSchema = z.looseObject({
  title: strDef(""),
  long_title: strNull(),
  permalink: strDef(""),
  pages: arrDef(ChapterPageSchema),
  tags: arrDef(ChapterTagSchema),
  released_on: strNull(),
  added_on: strNull(),
});

export const FeedChapterSchema = z.looseObject({
  title: strDef(""),
  permalink: z.string(),
  series: strNull(),
  series_type: strNull(),
  author: strNull(),
  doujin: strNull(),
  tags: arrDef(ChapterTagSchema),
  released_on: strNull(),
  cover_url: strNull(),
});

export const FeedSchema = z.looseObject({
  chapters: arrDef(FeedChapterSchema),
  current_page: z.preprocess((v) => (typeof v === "number" ? v : 1), z.number().default(1)),
  total_pages: z.preprocess((v) => (typeof v === "number" ? v : 1), z.number().default(1)),
});

export const SeriesTagSchema = z.looseObject({
  type: strDef("General"),
  name: strDef(""),
  permalink: strDef(""),
});

export const SeriesTaggingSchema = z.looseObject({
  header: strNull(),
  title: strNull(),
  permalink: strNull(),
  released_on: strNull(),
  tags: arrDef(SeriesTagSchema),
});

export const SeriesTaggableSchema = z.looseObject({
  name: strDef(""),
  permalink: z.string(),
  type: strDef(""),
  cover: strNull(),
});

export const SeriesSchema = z.looseObject({
  name: strDef(""),
  permalink: z.string(),
  type: strDef("Series"),
  description: strNull(),
  link: strNull(),
  cover: strNull(),
  aliases: arrDef(z.string()),
  tags: arrDef(SeriesTagSchema),
  taggings: arrDef(SeriesTaggingSchema),
  taggables: arrDef(SeriesTaggableSchema),
});
export type ValidatedChapter = z.infer<typeof ChapterSchema>;
export type ValidatedFeed = z.infer<typeof FeedSchema>;
export type ValidatedSeries = z.infer<typeof SeriesSchema>;
