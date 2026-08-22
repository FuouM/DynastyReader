/**
 * Zod runtime schemas for external Dynasty Scans REST API payloads.
 * Validates untrusted network responses at the API boundary.
 */

import { z } from "zod";

export const ChapterTagSchema = z.object({
  type: z.string().nullish().default("General"),
  name: z.string().nullish().default(""),
  permalink: z.string().nullish().default(""),
}).passthrough();

export const ChapterPageSchema = z.object({
  name: z.string().nullish().default(""),
  url: z.string(),
}).passthrough();

export const ChapterSchema = z.object({
  title: z.string().nullish().default(""),
  long_title: z.string().nullish(),
  pages: z.array(ChapterPageSchema).nullish().default([]),
  tags: z.array(ChapterTagSchema).nullish().default([]),
  released_on: z.string().nullish(),
  permalink: z.string().nullish(),
}).passthrough();

export const FeedChapterSchema = z.object({
  title: z.string().nullish().default(""),
  permalink: z.string(),
  series: z.string().nullish(),
  series_type: z.string().nullish(),
  author: z.string().nullish(),
  doujin: z.string().nullish(),
  tags: z.array(ChapterTagSchema).nullish().default([]),
  released_on: z.string().nullish(),
  cover_url: z.string().nullish(),
}).passthrough();

export const FeedSchema = z.object({
  chapters: z.array(FeedChapterSchema).nullish().default([]),
  current_page: z.number().nullish().default(1),
  total_pages: z.number().nullish().default(1),
}).passthrough();

export const SeriesTagSchema = z.object({
  type: z.string().nullish().default("General"),
  name: z.string().nullish().default(""),
  permalink: z.string().nullish().default(""),
}).passthrough();

export const SeriesTaggingSchema = z.object({
  header: z.string().nullish(),
  title: z.string().nullish(),
  permalink: z.string().nullish(),
  released_on: z.string().nullish(),
  tags: z.array(SeriesTagSchema).nullish().default([]),
}).passthrough();

export const SeriesTaggableSchema = z.object({
  name: z.string().nullish().default(""),
  permalink: z.string(),
  type: z.string().nullish(),
}).passthrough();

export const SeriesSchema = z.object({
  name: z.string().nullish().default(""),
  permalink: z.string(),
  type: z.string().nullish().default("Series"),
  description: z.string().nullish(),
  link: z.string().nullish(),
  cover: z.string().nullish(),
  tags: z.array(SeriesTagSchema).nullish().default([]),
  taggings: z.array(SeriesTaggingSchema).nullish().default([]),
  taggables: z.array(SeriesTaggableSchema).nullish().default([]),
}).passthrough();

export type ValidatedChapter = z.infer<typeof ChapterSchema>;
export type ValidatedFeed = z.infer<typeof FeedSchema>;
export type ValidatedSeries = z.infer<typeof SeriesSchema>;
