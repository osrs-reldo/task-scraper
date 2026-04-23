/**
 * Zero indexed column definitions
 */
export interface IColumnDefinitions {
  areaColumnId?: number;
  nameColumnId: number;
  descriptionColumnId: number;
  requirementsColumnId: number | null;
  pointsColumnId: number | null;
  completionColumnId: number | null;
}
