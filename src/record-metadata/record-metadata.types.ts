/**
 * @file record-metadata.types.ts
 * @description Shape of `record_metadata.json`: the last state pulled from ServiceNow plus,
 * per tracked column, the merge-base hash aify last wrote and a resolved/unresolved conflict flag.
 * See reference_docs/plans/initial_plan_v2.md § record_metadata.json (OS-11/OS-12).
 */

export interface RecordMetadata {
  $sys_id: string;
  $table: string;
  $display_value: string;
  $parsed_display_value: string;
  $sys_updated_on: string;
  $sys_mod_count: number;
  $hash: Record<string, string>;
  $conflicts: Record<string, boolean>;
  [column: string]: unknown;
}
