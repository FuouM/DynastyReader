import type { JSX } from "solid-js";
import type { SearchResultItem } from "../types/api";

/**
 * Bootstrap Icon name identifier (e.g. "search", "arrow-clockwise", "bookmark-fill").
 */
export type BootstrapIconName = string;

export interface IconProps {
  /** The Bootstrap icon name without the `bi-` prefix (e.g. "search", "arrow-clockwise"). */
  name: BootstrapIconName;
  /** Whether to apply continuous spinning animation (`ds-spin`). */
  spin?: boolean;
  /** Explicit font-size (number in px or CSS string). */
  size?: number | string;
  /** Custom text/icon color. */
  color?: string;
  /** Additional CSS class names. */
  class?: string;
  /** Custom inline styles. */
  style?: string | JSX.CSSProperties;
  /** Accessible label / tooltip. */
  title?: string;
  onClick?: (ev: MouseEvent) => void;
}

/**
 * Standard typed icon component for Bootstrap Icons.
 */
export function Icon(props: IconProps) {
  return (
    <i
      class={`bi bi-${props.name}${props.spin ? " ds-spin" : ""}${props.class ? ` ${props.class}` : ""}`}
      style={{
        ...(props.size !== undefined ? { "font-size": typeof props.size === "number" ? `${props.size}px` : props.size } : {}),
        ...(props.color ? { color: props.color } : {}),
        ...(typeof props.style === "object" && props.style !== null ? props.style : {}),
      }}
      title={props.title}
      onClick={props.onClick}
    />
  );
}


import { ENTITY_TAXONOMY } from "../taxonomy";

export type BaseIconProps = Omit<IconProps, "name">;

// ── Common Semantic UI Icons ───────────────────────────────────────────────
export const SearchIcon = (props: BaseIconProps) => <Icon name="search" {...props} />;
export const RefreshIcon = (props: BaseIconProps) => <Icon name="arrow-clockwise" {...props} />;
export const ClearIcon = (props: BaseIconProps) => <Icon name="x-circle" {...props} />;
export const CloseIcon = (props: BaseIconProps) => <Icon name="x-lg" {...props} />;
export const CheckIcon = (props: BaseIconProps) => <Icon name="check2" {...props} />;
export const TrashIcon = (props: BaseIconProps) => <Icon name="trash3" {...props} />;
export const AddIcon = (props: BaseIconProps) => <Icon name="plus-lg" {...props} />;
export const WarningIcon = (props: BaseIconProps) => <Icon name="exclamation-triangle" {...props} />;
export const ExternalLinkIcon = (props: BaseIconProps) => <Icon name="box-arrow-up-right" {...props} />;
export const FolderIcon = (props: BaseIconProps) => <Icon name="folder-plus" {...props} />;
export const SettingsIcon = (props: BaseIconProps) => <Icon name="gear-fill" {...props} />;
export const CloudDownloadIcon = (props: BaseIconProps) => <Icon name="cloud-arrow-down" {...props} />;
export const DatabaseIcon = (props: BaseIconProps) => <Icon name="database" {...props} />;
export const HashIcon = (props: BaseIconProps) => <Icon name="hash" {...props} />;
export const TrafficIcon = (props: BaseIconProps) => <Icon name="arrow-down-up" {...props} />;
export const ArrowUpIcon = (props: BaseIconProps) => <Icon name="arrow-up" {...props} />;
export const ArrowDownIcon = (props: BaseIconProps) => <Icon name="arrow-down" {...props} />;
export const ChevronDownIcon = (props: BaseIconProps) => <Icon name="chevron-down" {...props} />;
export const ChevronLeftIcon = (props: BaseIconProps) => <Icon name="chevron-left" {...props} />;
export const ChevronRightIcon = (props: BaseIconProps) => <Icon name="chevron-right" {...props} />;
export const ClipboardIcon = (props: BaseIconProps) => <Icon name="clipboard" {...props} />;
export const BookmarkIcon = (props: { filled?: boolean } & BaseIconProps) => (
  <Icon name={props.filled ? "bookmark-fill" : "bookmark-plus"} {...props} />
);
export const BlacklistIcon = (props: { filled?: boolean } & BaseIconProps) => (
  <Icon name={props.filled ? "shield-slash-fill" : "shield-slash"} {...props} />
);
export const EntityIcon = (props: { kind: SearchResultItem["kind"] } & BaseIconProps) => {
  const meta = ENTITY_TAXONOMY[props.kind] ?? {
    icon: "tag" as const,
    color: "#69797e",
    path: "tags",
    label: props.kind,
  };
  return <Icon name={meta.icon} color={props.color ?? meta.color} {...props} />;
};

export const ChevronDoubleLeftIcon = (props: BaseIconProps) => <Icon name="chevron-double-left" {...props} />;
export const ChevronDoubleRightIcon = (props: BaseIconProps) => <Icon name="chevron-double-right" {...props} />;
export const ChevronBarLeftIcon = (props: BaseIconProps) => <Icon name="chevron-bar-left" {...props} />;
export const ChevronBarRightIcon = (props: BaseIconProps) => <Icon name="chevron-bar-right" {...props} />;
export const ArrowLeftIcon = (props: BaseIconProps) => <Icon name="arrow-left" {...props} />;
export const ArrowRightIcon = (props: BaseIconProps) => <Icon name="arrow-right" {...props} />;
export const ArrowLeftRightIcon = (props: BaseIconProps) => <Icon name="arrow-left-right" {...props} />;
export const LockIcon = (props: BaseIconProps) => <Icon name="lock-fill" {...props} />;
export const UnlockIcon = (props: BaseIconProps) => <Icon name="unlock" {...props} />;
export const DistributeVerticalIcon = (props: BaseIconProps) => <Icon name="distribute-vertical" {...props} />;
export const ColumnsGapIcon = (props: BaseIconProps) => <Icon name="columns-gap" {...props} />;
export const BookHalfIcon = (props: BaseIconProps) => <Icon name="book-half" {...props} />;
export const ArrowsFullscreenIcon = (props: BaseIconProps) => <Icon name="arrows-fullscreen" {...props} />;
export const FullscreenExitIcon = (props: BaseIconProps) => <Icon name="fullscreen-exit" {...props} />;
export const DashIcon = (props: BaseIconProps) => <Icon name="dash-lg" {...props} />;
export const PlusIcon = (props: BaseIconProps) => <Icon name="plus-lg" {...props} />;
export const StarIcon = (props: { filled?: boolean } & BaseIconProps) => (
  <Icon name={props.filled ? "star-fill" : "star"} {...props} />
);
export const BookIcon = (props: BaseIconProps) => <Icon name="book" {...props} />;
export const DoublePageIcon = (props: BaseIconProps) => <Icon name="book-half" {...props} />;
export const SunIcon = (props: BaseIconProps) => <Icon name="sun" {...props} />;
export const MoonIcon = (props: BaseIconProps) => <Icon name="moon-fill" {...props} />;
export const ToolIcon = (props: BaseIconProps) => <Icon name="tools" {...props} />;
export const ChartIcon = (props: BaseIconProps) => <Icon name="pie-chart" {...props} />;
export const StorageIcon = (props: BaseIconProps) => <Icon name="hdd-stack" {...props} />;
export const ImageIcon = (props: BaseIconProps) => <Icon name="image" {...props} />;
export const ListCheckIcon = (props: BaseIconProps) => <Icon name="list-check" {...props} />;
