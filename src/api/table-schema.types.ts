/**
 * @file table-schema.types.ts
 * Types for ServiceNow table schema elements, used by the schema API client
 * to represent individual fields/columns of a table.
 */

export interface SchemaElement {
  name: string;
  internal_type: string;
  max_length: number;
  choice_list: boolean;
  active_status: boolean;
  display_field?: string;
  reference_table?: string;
  reference_field_max_length?: number;
}
