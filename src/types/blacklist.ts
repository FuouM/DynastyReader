export interface BlacklistedTag {
  tag_name: string;
  tag_permalink?: string;
  created_at: number;
}

export interface BlacklistedSeries {
  series_permalink: string;
  series_name: string;
  created_at: number;
}

export interface BlacklistCheckResult {
  blacklisted: boolean;
  matchedTags: string[];
}

export type BlacklistMode = "hide" | "warn";
