#!/usr/bin/env node
/**
 * Contract check: do the field names this frontend sends actually exist in the API?
 *
 *   npm run verify:contract
 *
 * Every critical bug in docs/AUDIT.md §3.1 came from one belief — that the
 * OpenAPI document could not be reached, so payload keys had to be inferred from
 * naming conventions. It can be reached: /docs answers 403 to anything that is
 * not a browser, but openapi.json on the same host returns 200 to a plain HTTP
 * client. This script is the thirty seconds that would have caught six wrong
 * field names, two of them required.
 *
 * Against a LOCAL backend, point it at the local spec — no 403, and it checks
 * the code you are actually running:
 *
 *   OPENAPI_URL=http://127.0.0.1:10000/openapi.json npm run verify:contract
 *   (docs UI: http://127.0.0.1:10000/docs)
 *
 * The default stays the live URL so CI keeps checking what is deployed.
 *
 * Exits non-zero on a mismatch, so it can gate CI.
 *
 * It reads the schema file as text rather than importing it — the module is ESM
 * with JSX-adjacent imports, and a regex over `name: '...'` is enough to answer
 * "which keys can this form emit" without a bundler in the loop.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../src/utils/userFormSchema.js');
const ATTENDANCE_SCHEMA = resolve(HERE, '../src/utils/attendanceFormSchema.js');
const SPEC_URL =
  process.env.OPENAPI_URL ?? 'https://api.aksharmandal.in/aksharconnect/openapi.json';

/** Fields the form owns that the API is not expected to store. */
const FRONTEND_ONLY = ['employment_type'];

/**
 * Known-unpersisted fields, with the reason. These are reported as warnings
 * rather than failures so the check stays green while the decision is open —
 * see the ⚠ block on the `family` tab in userFormSchema.js.
 */
/**
 * Schemas that legitimately go missing from the live spec because their module
 * is gated OFF by an env-var flag (backend `MODULE_XXX_ENABLED`). The router is
 * not mounted → the schema isn't emitted in openapi.json → this script's normal
 * "schema not found" failure would misread that as a bug.
 *
 * A missing gated schema is reported as a warning (with the reason) rather
 * than an error. Set OPENAPI_URL to a spec where the module IS on to check
 * fields (e.g. DEV: `OPENAPI_URL=https://dev.aksharmandal.in/aksharconnect/openapi.json`).
 */
const KNOWN_GATED_SCHEMAS = {
  UserJobCreate:
    'Jobs module gated OFF in PROD by MODULE_JOBS_ENABLED (default in prod). '
    + 'Present in DEV/UAT if enabled; run with OPENAPI_URL pointed there to '
    + 'contract-check job fields.',
};

const KNOWN_UNPERSISTED = {
  is_nimit_sevak:
    'renamed from is_karya_karta. Expected to be missing until the spec this runs '
    + 'against is redeployed — run with OPENAPI_URL pointed at your backend to check '
    + 'which name it takes, and delete this line once the live spec declares it',
  is_ambrish:
    'renamed from is_amrish (a misspelling). Expected to be missing until the spec '
    + 'this runs against is redeployed — delete this line once the live spec '
    + 'declares it',
  doing_pooja:
    'added 2026-08. Expected to be missing until the spec this runs against is '
    + 'redeployed — delete this line once the live spec declares it',
  date_of_joining:
    'added 2026-08-13, required on the form. No joining date exists anywhere in '
    + 'the live spec yet, so the NAME IS NOT CONFIRMED — run with OPENAPI_URL '
    + 'pointed at the backend that adds it, and if it went with another spelling '
    + '(joining_date) rename the field in userFormSchema.js rather than deleting '
    + 'this line. Delete it once the live spec declares the name the form sends',
  father_name: 'no such field in any API schema',
  mother_name: 'no such field in any API schema',
  spouse_name: 'no such field in any API schema',
  emergency_contact_number: 'no such field in any API schema',
  remarks: 'exists only on UserSelfUpdate / job posts, not on UserCreate',
};

const file = readFileSync(SCHEMA, 'utf8');
const between = (start, end) => file.slice(file.indexOf(start), file.indexOf(end));

const tabs = between('export const TABS', 'export const PINCODE_FIELDS');
const edu = tabs.slice(tabs.indexOf("collection: 'educations'"), tabs.indexOf("collection: 'jobs'"));
const job = tabs.slice(tabs.indexOf("collection: 'jobs'"), tabs.indexOf("key: 'family'"));
const member = tabs.replace(edu, '').replace(job, '');

const names = (block) => [...block.matchAll(/\bname:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);

const memberFields = new Set([
  ...names(member),
  // Rendered by the hierarchy and pincode sections, which have no `fields` array.
  'pradesh_id', 'mandal_id', 'sabha_id',
  'pincode', 'area', 'suburb', 'city', 'state', 'country',
]);
const eduFields = new Set(names(edu));
const jobFields = new Set(names(job).filter((n) => !FRONTEND_ONLY.includes(n)));

// The two attendance forms. Each definition carries its own `fields` array plus
// a `constants` object merged into the payload verbatim, so both contribute
// keys the endpoint will see.
const attendance = readFileSync(ATTENDANCE_SCHEMA, 'utf8');

const formBlock = (name) => {
  const start = attendance.indexOf(`export const ${name}`);
  const rest = attendance.slice(start + 1);
  const nextExport = rest.indexOf('\nexport const ');
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
};

/**
 * `constants: { ... }` keys — values the screen implies rather than asks for.
 * They reach the endpoint exactly like a field does, so they have to be checked.
 * `[^}]` rather than a lazy `[\s\S]*?` up to a newline: the object is flat, and
 * a one-line `constants: { status: true },` has no newline to anchor on.
 */
const constantKeys = (block) => {
  const m = block.match(/constants:\s*\{([^}]*)\}/);
  return m ? [...m[1].matchAll(/([a-z0-9_]+)\s*:/g)].map((x) => x[1]) : [];
};

const formFields = (name) => {
  const block = formBlock(name);
  return new Set([...names(block), ...constantKeys(block)]);
};

const scheduleFields = formFields('SCHEDULE_FORM');
const specialFields = formFields('SPECIAL_SABHA_FORM');

/**
 * Editing your own record splits across two endpoints, and utils/selfUpdate.js
 * decides which field goes where by name. Those two lists are the whole
 * mechanism: a field missing from one is a field that quietly stops saving, so
 * both are checked against the schemas they were copied from.
 */
const SELF_UPDATE = resolve(HERE, '../src/utils/selfUpdate.js');
const selfFile = readFileSync(SELF_UPDATE, 'utf8');
const listAfter = (marker) => {
  const start = selfFile.indexOf(marker);
  const open = selfFile.indexOf('[', start);
  const close = selfFile.indexOf('];', open);
  return new Set([...selfFile.slice(open, close).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
};
const requestFields = listAfter('export const REQUEST_FIELDS');
const directFields = listAfter('export const DIRECT_FIELDS');

let spec;
try {
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  spec = await res.json();
} catch (err) {
  console.error(`\n✖ Could not fetch the OpenAPI document from ${SPEC_URL}`);
  console.error(`  ${err.message}`);
  console.error('  Set OPENAPI_URL to point elsewhere. Skipping (not failing) the check.\n');
  process.exit(0); // a network blip must not break an unrelated build
}

let failed = false;
let warned = false;

function check(label, schemaName, formFields) {
  const schema = spec.components?.schemas?.[schemaName];
  if (!schema) {
    if (schemaName in KNOWN_GATED_SCHEMAS) {
      console.log(`\n=== ${label} → ${schemaName} ===`);
      console.log(`  ⚠ schema not in spec — ${KNOWN_GATED_SCHEMAS[schemaName]} (known, tracked)`);
      warned = true;
      return;
    }
    console.log(`\n=== ${label} → ${schemaName} ===\n  ✖ schema not found in the spec`);
    failed = true;
    return;
  }

  const props = new Set(Object.keys(schema.properties ?? {}));
  const required = schema.required ?? [];

  const missing = required.filter((r) => !formFields.has(r));
  const unknown = [...formFields].filter((f) => !props.has(f));
  const [known, unexpected] = [
    unknown.filter((f) => f in KNOWN_UNPERSISTED),
    unknown.filter((f) => !(f in KNOWN_UNPERSISTED)),
  ];

  console.log(`\n=== ${label} → ${schemaName} ===`);
  console.log(`  form emits ${formFields.size} · schema declares ${props.size} · requires ${required.length}`);

  if (missing.length) {
    console.log(`  ✖ REQUIRED BY THE API, NOT ON THE FORM: ${missing.join(', ')}`);
    console.log('    → every write to this endpoint will fail with 422.');
    failed = true;
  } else {
    console.log('  ✓ every required field is supplied');
  }

  if (unexpected.length) {
    console.log(`  ✖ SENT BUT NOT IN THE SCHEMA: ${unexpected.join(', ')}`);
    console.log('    → accepted and silently discarded; the user believes it saved.');
    failed = true;
  }

  for (const f of known) {
    console.log(`  ⚠ ${f} — ${KNOWN_UNPERSISTED[f]} (known, tracked)`);
    warned = true;
  }

  if (!unexpected.length && !known.length) console.log('  ✓ no unknown fields sent');
}

console.log(`Contract check against ${SPEC_URL}`);
check('Member create', 'UserCreate', memberFields);
check('Education row', 'UserEducationCreate', eduFields);
check('Job row', 'UserJobCreate', jobFields);
check('Sabha schedule', 'SabhaScheduleCreate', scheduleFields);
check('Special Sabha', 'SabhaDetailsCreate', specialFields);
// UserSelfUpdate, not UserUpdate: PATCH /users/me takes its own, shorter schema
// — every field optional — while PATCH /users/{id} takes UserUpdate.
check('Own profile — direct', 'UserSelfUpdate', directFields);
check('Own profile — approval request', 'UserInformationRequestCreate', requestFields);

if (failed) {
  console.log('\n✖ CONTRACT MISMATCH — see above.\n');
  process.exit(1);
}
console.log(warned ? '\n✓ Contracts satisfied (with known warnings).\n' : '\n✓ All contracts satisfied.\n');
