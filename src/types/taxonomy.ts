import type { SeriesTag } from "./api";

export interface GroupedSeriesTags {
  authorTags: SeriesTag[];
  groupTags: SeriesTag[];
  doujinTags: SeriesTag[];
  pairingTags: SeriesTag[];
  characterTags: SeriesTag[];
  statusTags: SeriesTag[];
  otherTags: SeriesTag[];
}
