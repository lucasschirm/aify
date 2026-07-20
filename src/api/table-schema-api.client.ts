/**
 * @file table-schema-api.client.ts
 * API client for fetching table schema (field metadata) from ServiceNow via the
 * SCHEMA endpoint. Returns XML which is parsed into SchemaElement arrays.
 */
import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
// biome-ignore lint/style/useImportType: required for NestJS DI runtime metadata
import { SnHttpClient } from './sn-http.client';
import type { SnAuth } from './table-api.types';
import type { SchemaElement } from './table-schema.types';

@Injectable()
export class TableSchemaApiClient {
  constructor(private readonly snHttp: SnHttpClient) {}

  /**
   * Fetch the schema XML for a table from ServiceNow and parse it into SchemaElement[].
   * @param auth - ServiceNow authentication credentials.
   * @param table - The table name (e.g., 'sys_script_include').
   * @returns An array of SchemaElement objects representing the table's fields.
   * @throws ConnectionError if the request fails.
   */
  async fetchSchemaXml(auth: SnAuth, table: string): Promise<SchemaElement[]> {
    const url = `${this.snHttp.base(auth)}/${table}.do?SCHEMA`;
    const res = await this.snHttp.send(auth, url, {
      headers: { Accept: 'application/xml' },
    });
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const parsed = parser.parse(xml) as Record<string, unknown>;

    // Get the root node's element array: the root key is the table name or first key.
    const root = (parsed[table] ?? Object.values(parsed)[0]) as { element?: unknown } | undefined;
    const raw = root?.element;

    // Normalize single element to array (fast-xml-parser returns object for single item, array for multiple).
    const elements = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];

    // Map each raw element to SchemaElement with proper type coercion.
    return elements.map((e) => {
      const elem = e as Record<string, string>;
      const result: SchemaElement = {
        name: String(elem.name),
        internal_type: String(elem.internal_type),
        max_length: Number(elem.max_length),
        choice_list: elem.choice_list === 'true',
        active_status: elem.active_status === 'true',
      };

      // Add reference columns only when they exist.
      if (elem.display_field !== undefined) {
        result.display_field = String(elem.display_field);
      }
      if (elem.reference_table !== undefined) {
        result.reference_table = String(elem.reference_table);
      }
      if (elem.reference_field_max_length !== undefined) {
        result.reference_field_max_length = Number(elem.reference_field_max_length);
      }

      return result;
    });
  }
}
