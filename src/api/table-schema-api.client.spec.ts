/**
 * @file table-schema-api.client.spec.ts
 * Tests for TableSchemaApiClient — XML parsing, schema element mapping, reference
 * column handling, and type coercion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SnHttpClient } from './sn-http.client';
import type { SnAuth } from './table-api.types';
import { TableSchemaApiClient } from './table-schema-api.client';

const HOST = 'https://dev12345.service-now.com';
const auth: SnAuth = {
  instanceUrl: 'https://dev12345.service-now.com/',
  username: 'admin',
  password: 'secret',
};
const basic = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

// Read the fixture XML
const XML = readFileSync(join(__dirname, '__fixtures__', 'table-schema.xml'), 'utf8');

beforeEach(() => {
  nock.cleanAll();
});

afterEach(() => {
  if (!nock.isDone()) {
    throw new Error(`Not all nock interceptors were consumed: ${nock.pendingMocks()}`);
  }
});

describe('TableSchemaApiClient.fetchSchemaXml', () => {
  it('fetches and parses schema XML with Accept: application/xml header', async () => {
    const scope = nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_script_include.do')
      .query({ SCHEMA: '' })
      .reply(200, XML);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_script_include');

    expect(elements).toHaveLength(23);
    expect(scope.isDone()).toBe(true);
  });

  it('parses a non-reference boolean element correctly', async () => {
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_script_include.do')
      .query({ SCHEMA: '' })
      .reply(200, XML);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_script_include');

    const clientCallable = elements.find((e) => e.name === 'client_callable');
    expect(clientCallable).toEqual({
      name: 'client_callable',
      internal_type: 'boolean',
      max_length: 40,
      choice_list: false,
      active_status: true,
    });
    // Ensure no reference keys are present.
    expect(clientCallable).not.toHaveProperty('display_field');
    expect(clientCallable).not.toHaveProperty('reference_table');
    expect(clientCallable).not.toHaveProperty('reference_field_max_length');
  });

  it('parses a reference element with all reference fields', async () => {
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_script_include.do')
      .query({ SCHEMA: '' })
      .reply(200, XML);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_script_include');

    const sysPackage = elements.find((e) => e.name === 'sys_package');
    expect(sysPackage).toMatchObject({
      name: 'sys_package',
      internal_type: 'reference',
      max_length: 32,
      choice_list: false,
      active_status: true,
      display_field: 'name',
      reference_table: 'sys_package',
      reference_field_max_length: 100,
    });
  });

  it('coerces max_length to a number', async () => {
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_script_include.do')
      .query({ SCHEMA: '' })
      .reply(200, XML);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_script_include');

    const elem = elements[0];
    expect(typeof elem.max_length).toBe('number');
    expect(typeof elem.choice_list).toBe('boolean');
    expect(typeof elem.active_status).toBe('boolean');
  });

  it('normalizes a single element to an array', async () => {
    const singleElementXml =
      '<t1><element name="only" internal_type="string" max_length="10" choice_list="false" active_status="true"/></t1>';
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/t1.do')
      .query({ SCHEMA: '' })
      .reply(200, singleElementXml);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 't1');

    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('only');
  });

  it('handles empty schema (no elements)', async () => {
    const emptyXml = '<t1></t1>';
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/t1.do')
      .query({ SCHEMA: '' })
      .reply(200, emptyXml);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 't1');

    expect(elements).toEqual([]);
  });

  it('returns empty array when root element is empty (no element children)', async () => {
    const emptyRootXml = '<sys_x></sys_x>';
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_x.do')
      .query({ SCHEMA: '' })
      .reply(200, emptyRootXml);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_x');

    expect(elements).toEqual([]);
  });

  it('uses root key fallback when root tag name differs from table name', async () => {
    const fallbackXml =
      '<sys_x><element name="a" internal_type="string" max_length="1" choice_list="false" active_status="true"/></sys_x>';
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/not_the_root.do')
      .query({ SCHEMA: '' })
      .reply(200, fallbackXml);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'not_the_root');

    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('a');
  });

  it('returns single element when root element has a single element child (not array)', async () => {
    // When XML parser returns a single element as an object (not array), normalize it
    const singleElementXml =
      '<sys_x><element name="single" internal_type="string" max_length="100" choice_list="false" active_status="true"/></sys_x>';
    nock(HOST, {
      reqheaders: { accept: 'application/xml', authorization: basic },
    })
      .get('/sys_x.do')
      .query({ SCHEMA: '' })
      .reply(200, singleElementXml);

    const client = new TableSchemaApiClient(new SnHttpClient({ maxAttempts: 3, delayMs: 1 }));
    const elements = await client.fetchSchemaXml(auth, 'sys_x');

    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('single');
  });
});
