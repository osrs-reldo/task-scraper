/**
 * Represents a task type with relevant configuration for UI display and task management
 */
export interface ITaskType {
  /**
   * Name of the task type for UI display
   */
  name: string;

  /**
   * Description of the task type
   */
  description: string;

  /**
   * Is the task type enabled?
   */
  isEnabled: boolean;

  /**
   * Filename for the task JSON found in the tasks directory of task-json-store
   * Extension not included.
   */
  taskJsonName: string;

  /**
   * Filters for the task type
   */
  filters: FilterConfig[];

  /**
   * A dictionary of parameters relevant to the task, with required id, name, description, tier
   * The key is the plain English name for the parameter
   * The value is an array of OSRS cache Struct ParamIDs that match with the plain English parameter
   * Generally, there is only 1 value in the array, but multiple are available for fallback
   */
  intParamMap: Record<string, number>;

  /**
   * A dictionary of parameters relevant to the task, with required id, name, description, tier
   * The key is the plain English name for the parameter
   * The value is an array of OSRS cache Struct ParamIDs that match with the plain English parameter
   * Generally, there is only 1 value in the array, but multiple are available for fallback
   */
  stringParamMap: Record<string, number>;

  /**
   * A dictionary of integer enums relevant to the task type
   * The key is the plain English name describing the enum
   * The value is an integer representing the enum id
   * e.g. "tierSprites": 3213 (tier id maps to a sprite id)
   */
  intEnumMap: Record<string, number>;

  /**
   * A dictionary of string enums relevant to the task type
   * The key is the plain English name describing the enum
   * The value is an integer representing the enum id
   * e.g. "tierNames": 4757 (tier id maps to a sprite id)
   */
  stringEnumMap: Record<string, number>;

  /**
   * A dictionary of tier sprite ids
   * The key is a string representation of the tier id integer
   * The value is an integer representing the sprite id
   */
  tierSpriteIdMap: Record<string, number>;

  /**
   * Varps used to store task progress
   * Used for exports from the plugin
   */
  taskVarps: number[];

  /**
   * Other varps used for the task type
   * Used for exports from the plugin
   * Examples in the past: League Points, Sage Renown
   */
  otherVarps: number[];

  /**
   * Varbits used for the task type
   * Used for exports from the plugin
   * Examples in the past: Relics chosen, Tasks completed, unlocks, Fragment xp
   */
  varbits: number[];

  /**
   * The script id used to parse the completion of a task
   * This is a rs2asm script
   * Example: Combat achievements = script 4834
   */
  taskCompletedScriptId: number;

  /**
   * Tiers for task point based milestones
   * Resolution priority: game varbit → hardcoded JSON value → -1 (unknown)
   * `varbitId` is the varbit that dynamically provides the points threshold for the tier
   * `label` is the string label for the tier to be displayed in the plugin
   * `points` is the hardcoded number of points required to reach this tier
   */
  taskPointTiers: { varbitId: number; label: string; points: number; }[];

  /**
   * Tiers for task completion count based milestones
   * Resolution priority: game varbit → hardcoded JSON value → -1 (unknown)
   * `varbitId` is the varbit that dynamically provides the task count threshold for the unlock
   * `label` is the string label for the unlock tier to be displayed in the plugin
   * `tasks` is the number of tasks required to reach this unlock tier
   */
  taskCompletionCountTiers: { varbitId: number; label: string; tasks: number; }[];
}

/**
 * Represents the configuration for a filter
 */
export interface FilterConfig {
  /**
   * Key under which to store the filter's selected values, generally prefixed by task type
   */
  configKey: string;

  /**
   * The label displayed in the UI with the filter
   */
  label: string;

  /**
   * The filter type, see enum for types of filters supported
   */
  filterType: FilterType;

  /**
   * The source of the value(s) to use for the filter, see enum for types of values supported
   * If global is specified then configKey must match a filter config defined in filters.json
   */
  valueType: FilterValueType;

  /**
   * The name of the param or metadata property to use for the filter
   * Can be left null for SKILL value type
   */
  valueName?: string;

  /**
   * Name of an enum specified in `TaskTypeDefinition.stringEnumMap` to provide labels for the filter
   * Specifying this property will override the displayed integer value of `valueName`
   */
  optionLabelEnum?: string;

  /**
   * Item values in a button filter (dropdown not yet supported)
   */
  customItems: FilterCustomItem[];
}

/**
 * Represents a custom item in the filter
 */
export interface FilterCustomItem {
  /**
   * The value associated with the custom item
   */
  value: number | null;

  /**
   * Tooltip text for the custom item
   */
  tooltip: string;

  /**
   * The sprite ID associated with the custom item
   */
  spriteId: number | null;
}

/**
 * Enum representing the filter types supported
 */
export enum FilterType {
  BUTTON_FILTER = 'BUTTON_FILTER',
  DROPDOWN_FILTER = 'DROPDOWN_FILTER',
}

/**
 * Enum representing the filter value types supported
 */
export enum FilterValueType {
  PARAM_INTEGER = 'PARAM_INTEGER',
  PARAM_STRING = 'PARAM_STRING',
  SKILL = 'SKILL',
  METADATA = 'METADATA',
  GLOBAL = 'GLOBAL',
}
