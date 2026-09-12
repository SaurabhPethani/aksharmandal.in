import {
  Briefcase, GraduationCap, Home, Phone, User, UserCheck, Users,
} from 'lucide-react';
import { useState } from 'react';
import { Card, EmptyState, Loader } from '../ui';
import { Tabs } from '../Navigation';
import WhatsAppIcon from '../WhatsAppIcon';
import { useUserEducations, useUserFamily, useUserJobs } from '../../hooks';
import { formatCell, formatDate } from '../../utils/format';
import { GREETING, hasMobile, telUrl, whatsAppUrl } from '../../utils/contact';
import { pickRows } from '../../utils/options';
import {
  DOING_POOJA_LABEL, NIMIT_SEVAK_LABEL, ambrishLabel, readMemberField,
} from '../../utils/memberFlags';

/**
 * A member's WHOLE record on one page — the Profile view of both the member page
 * (/users/{id}) and the signed-in member's own /profile.
 *
 * ONE COMPONENT ON PURPOSE. The two screens show the same thing about different
 * people, and when they were two implementations they drifted: /profile listed
 * nine personal rows behind eight tabs while the member page showed four cards,
 * so "what does the app know about this member" had two different answers
 * depending on who was asking.
 *
 * LAYOUT. Full-width cards stacked down the page, each a header with a hairline
 * under it and then a grid of label-above-value cells. The previous version put
 * the label left and the value hard right with a rule between every row, two
 * cards abreast — which turned a nine-row card into nine long dotted lines the
 * eye has to traverse, and left the two columns ragged whenever one card had
 * more rows than its neighbour. Reading down a column of values beats reading
 * across a rule, and a label sitting directly above its value needs no rule at
 * all.
 *
 * Keys are the API's own (`UserDetailResponse`); labels and grouping are this
 * component's, because the grouping is not the form's — Contact Details and
 * Account Details cut across its steps.
 *
 * CELLS WITH NOTHING IN THEM ARE KEPT, as an em dash. On a details page the
 * absence of a value is itself the answer, and a card that silently drops cells
 * reads differently for every member — you cannot tell "not recorded" from "this
 * member has no such field".
 *
 * ONE EXCEPTION: a row that brings its own renderer (the third element of the
 * tuple) is a CONTROL rather than a fact, and is dropped label and all when it
 * renders nothing. "Followup Mobile —" describes a call that cannot be placed;
 * the honest version of an absent button is an absent button. See `cellsFor`.
 */

/**
 * Detail sections, in reading order.
 *
 * THE TABS ARE THE FORM'S TABS — same names, same order, deliberately:
 *
 *   Personal · Sabha Details · Address · Followup · Education · Job · Family
 *
 * A member's record is entered on one screen and read on another, and when the
 * two disagreed about where a field lives, "where do I find the follow-up
 * person" had a different answer depending on which screen you were on. The
 * grouping here follows utils/userFormSchema.js TABS: contact rows sit under
 * Personal because that is the step that asks for them, and Followup is a step
 * of its own so it is a tab of its own.
 *
 * `tab` is the name on the strip and the only one on screen: the cards render
 * untitled, because the tab above them already says what they are. `title` is
 * kept as the section's name in code — it is the React key, it is what the tests
 * name a card by, and it is what `SectionCard` would print if a tab ever held
 * more than one of them. See SectionCard.
 */
export const PROFILE_CARDS = [
  {
    tab: 'Personal',
    title: 'Personal Details',
    icon: User,
    rows: [
      ['first_name', 'First Name'],
      ['middle_name', 'Middle Name'],
      ['last_name', 'Last Name'],
      ['gender', 'Gender'],
      ['dob', 'Date of Birth'],
      // Next to the date of birth, as on the form's Personal step. Read-only on
      // BOTH pages — /profile shows it and never offers it, since it is not the
      // member's own to set (see `lockedForSelf` in utils/userFormSchema.js).
      // A record that predates the field has none and reads as an em dash.
      ['date_of_joining', 'Date of Joining'],
      ['blood_group', 'Blood Group'],
      ['marital_status', 'Marital Status'],
      ['anniversary_date', 'Anniversary'],
      // Contact was a card of its own until the tabs were matched to the form,
      // which asks for the three of these on its Personal step.
      ['mobile_number', 'Mobile'],
      ['mobile_secondary', 'Secondary Mobile'],
      ['whatsapp_number', 'WhatsApp'],
      ['email', 'Email'],
      // Account facts. The form has no step for them — they are set by the
      // system or by somebody else — so they close the step that describes who
      // the member is, rather than opening a tab nobody would look in.
      ['role_name', 'Role'],
      ['__status', 'Status'],
      ['created_by_name', 'Created By'],
    ],
  },
  {
    tab: 'Sabha Details',
    title: 'Sabha Details',
    icon: Users,
    rows: [
      ['pradesh_name', 'Pradesh'],
      ['mandal_name', 'Mandal'],
      ['sabha_name', 'Sabha'],
      ['category_name', 'Category'],
      // "Ambrish" or "Sarhadyi" by the member's own gender. The flags are read
      // under their older names too — see utils/memberFlags.js.
      ['is_ambrish', (user) => ambrishLabel(user?.gender)],
      ['is_nimit_sevak', NIMIT_SEVAK_LABEL],
      ['doing_pooja', DOING_POOJA_LABEL],
    ],
  },
  {
    // Its own section rather than one squashed line inside Personal: the form
    // captures ten address fields and a single joined string could not say
    // which of them were actually filled in.
    tab: 'Address',
    title: 'Address',
    icon: Home,
    rows: [
      ['flat_no', 'Flat No.'],
      ['building_name', 'Building'],
      ['street_name', 'Street'],
      ['landmark', 'Landmark'],
      ['area', 'Area'],
      ['suburb', 'Suburb'],
      ['city', 'City'],
      ['state', 'State'],
      ['country', 'Country'],
      ['pincode', 'PIN Code'],
    ],
  },
  {
    /**
     * WHO HAS THIS MEMBER — a tab of its own, as on the form.
     *
     * Three cells, which `CELL_GRID` puts on one row at `lg`: who introduced
     * them, who follows them up, and how to reach that person. The Call and
     * WhatsApp buttons are the point of the tab on a phone, which is why the
     * name sits immediately above them in the stacked layout.
     */
    tab: 'Followup',
    title: 'Followup',
    icon: UserCheck,
    rows: [
      ['reference_by_id_name', 'Reference By'],
      ['followup_by_id_name', 'Followup By'],
      // A third element renders the cell itself — see the map in ProfileCards.
      ['followup_id_mobile', 'Followup Mobile', followupContact],
    ],
  },
];

/**
 * The three list sections, which close the page.
 *
 * NOT a grid of labelled cells like the sections above. These repeat, and a
 * repeating label is noise: printing "Institute" three times down a page says
 * nothing the first one did not, and Family — which has two fields — left two
 * thirds of a three-column grid empty on every row.
 *
 * Each entry is one line instead: the thing itself in bold, what it belongs to
 * under it, and the rest as small facts on one row. That is readable at a
 * glance and the same shape whether the entry has two fields or six.
 *
 *   primary    the entry's own name — always rendered, an em dash if truly empty
 *   secondary  what it belongs to, under the title
 *   meta       small facts, joined by a dot. EMPTY ONES ARE DROPPED rather than
 *              dashed: a dash earns its place in a labelled table, where the row
 *              exists whether or not it is filled, but a trailing "· —" in a
 *              running line is just debris.
 *   badge      the one word that classifies the entry, on the right
 */
const text = (v) => (v == null ? '' : String(v).trim());

const LIST_SECTIONS = [
  {
    key: 'educations',
    tab: 'Education',
    title: 'Education',
    icon: GraduationCap,
    empty: 'No education recorded.',
    primary: (r) => text(r.education_level_name) || text(r.school_college_name),
    secondary: (r) => (text(r.education_level_name) ? text(r.school_college_name) : ''),
    meta: (r) => [text(r.study_field)],
    badge: (r) => text(r.education_year),
  },
  {
    key: 'jobs',
    tab: 'Job',
    title: 'Job & Business',
    icon: Briefcase,
    empty: 'No job or business recorded.',
    // A business has no job title, so its name leads instead — the same rule
    // `variantOf` uses on the form, applied to how the entry reads.
    primary: (r) => text(r.job_title) || text(r.company_name),
    secondary: (r) => (text(r.job_title) ? text(r.company_name) : ''),
    meta: (r) => [
      text(r.job_industry_name) || text(r.nature_of_business_name),
      text(r.years_of_experience) && `${text(r.years_of_experience)} yrs`,
      text(r.city),
    ],
    badge: (r) => (text(r.nature_of_business_name) ? 'Business' : 'Job'),
  },
  {
    key: 'family',
    tab: 'Family',
    title: 'Family',
    icon: Users,
    empty: 'No family members linked.',
    primary: (r) => text(r.user_name),
    secondary: () => '',
    meta: () => [],
    badge: (r) => text(r.relation_name),
  },
];

/** Kept local so this file does not depend on the members-list module. */
const isAttendingValue = (status) =>
  status === true || status === 1 || String(status).toLowerCase() === 'true';

/**
 * Date-typed keys — API sends these as `YYYY-MM-DD`, which reads as an ISO
 * timestamp on the record page and is not how anyone here writes a date. The
 * shared `formatDate` renders them as `14 May 1988` (en-IN, 2-digit day, short
 * month, numeric year), matching every other date on the app.
 */
const DATE_KEYS = new Set(['dob', 'date_of_joining', 'anniversary_date']);

/** One value, as it should read — booleans as Yes/No, nothing as an em dash. */
export function readValue(user, key) {
  // `status` is a boolean whose two sides have names, so Yes/No would be a worse
  // answer than the words the rest of the app already uses for it.
  if (key === '__status') {
    if (user?.status == null || user.status === '') return null;
    return isAttendingValue(user.status) ? 'Attending' : 'Not Attending';
  }
  // Not `user[key]`: a flag the backend still sends under its old name has to
  // read as No rather than as an em dash, which would say "not recorded".
  const value = readMemberField(user, key);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return null;
  if (DATE_KEYS.has(key)) return formatDate(value);
  return formatCell(value);
}

/**
 * The follow-up person's mobile — READ ON A DESKTOP, ACTED ON WITH A THUMB.
 *
 * Same cell, two contents, cut at `sm` — the same breakpoint `CELL_GRID` uses to
 * stop stacking, so the switch happens exactly when the card stops being a
 * phone-shaped list:
 *
 *   sm and up   the number as text. A `tel:` on a desktop hands off to whatever
 *               happens to be registered — Skype, a chooser, or silence — so a
 *               Call button there promises something the machine cannot do.
 *   below sm    Call and WhatsApp, the marks alone. On a phone the number is not
 *               something to read and copy, it is something to press.
 *
 * The name is carried in `title` / `aria-label` on both, since a bare glyph
 * names nobody to a screen reader.
 *
 * `hasMobile` gates the whole cell rather than each button: with fewer than ten
 * digits there is nothing to dial and nothing to open a chat with, so it returns
 * null and Field draws its em dash — "not recorded", which is the truth.
 *
 * A PLAIN FUNCTION, NOT A COMPONENT, and that is what makes the em dash work. As
 * `<FollowupContact user={user} />` the row handed Field a React element, which
 * is truthy however it renders — so `value ?? '—'` kept the element and the cell
 * came out EMPTY for every member with no follow-up number. Called directly, the
 * null reaches Field as a null.
 */
function followupContact(user) {
  const mobile = readMemberField(user, 'followup_id_mobile');
  if (!hasMobile(mobile)) return null;
  // WhatsApp reaches the follow-up person's WhatsApp number (falls back to their
  // calling number); the Call button below keeps using `mobile`.
  const whatsapp = readMemberField(user, 'followup_id_whatsapp') || mobile;

  const name = readMemberField(user, 'followup_by_id_name') || 'your follow-up person';
  const call = `Call ${name}`;
  const chat = `Message ${name} on WhatsApp`;

  return (
    <>
      <span className="hidden sm:inline">{formatCell(mobile)}</span>

      <span className="flex items-center gap-2 sm:hidden">
        <a
          href={telUrl(mobile)}
          title={call}
          aria-label={call}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary text-white transition-transform hover:scale-105"
        >
          <Phone className="h-4 w-4" />
        </a>
        {/* Opens WhatsApp with the greeting typed and nothing sent — the member
            presses send, from their own number. `noreferrer` with the new tab
            because this leaves the app for a third party. */}
        <a
          href={whatsAppUrl(whatsapp, GREETING)}
          target="_blank"
          rel="noopener noreferrer"
          title={chat}
          aria-label={chat}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-white transition-transform hover:scale-105"
          style={{ background: '#25D366' }}
        >
          <WhatsAppIcon className="h-4 w-4" />
        </a>
      </span>
    </>
  );
}

/**
 * A card's rows resolved into the cells it will actually draw.
 *
 * Two things happen here that the JSX should not have to:
 *
 *   - a label may be a function of the member (one flag reads differently for
 *     women), and
 *   - a row may bring its own renderer, for a value that is pressed rather than
 *     read.
 *
 * AND A RENDERED ROW THAT COMES BACK NULL IS DROPPED. Only a rendered one: every
 * plain row keeps its em dash, because "not recorded" is an answer worth
 * printing, while a label over two missing buttons is not. Today that is the
 * follow-up mobile — with no number on the record, the cell does not appear at
 * all and Reference By / Followup By close the card.
 */
export function cellsFor(user, rows) {
  return rows
    .map(([key, label, render]) => ({
      key,
      label: typeof label === 'function' ? label(user) : label,
      value: render ? render(user) : readValue(user, key),
      isControl: Boolean(render),
    }))
    .filter((cell) => !(cell.isControl && cell.value == null));
}

/**
 * One label-above-value cell.
 *
 * `break-words` rather than truncation: an email or a building name that does
 * not fit should wrap onto a second line, because a profile exists to be read
 * and a clipped value with no tooltip is worse than a taller card.
 */
export function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-tight text-text-muted">{label}</dt>
      <dd className="mt-1.5 break-words text-[15px] font-semibold leading-snug text-primary">
        {value ?? <span className="font-normal text-text-faint">—</span>}
      </dd>
    </div>
  );
}

/**
 * A card, with a heading only when one is passed.
 *
 * NO TITLE IS THE NORMAL CASE NOW. Since the sections moved behind a tab strip
 * the tab already names what is on screen, and a card headed "Personal Details"
 * directly under a tab reading "Personal" says the same thing twice, one line
 * apart, at the top of every section.
 *
 * The header is dropped whole when there is no title — the icon tile and the
 * hairline under it went with it. That rule separated a heading from its data,
 * which is a real boundary; with no heading above it, it separates the top of
 * the card from the top of the card.
 *
 * `title` still earns its place for a card that does NOT have a tab of its own
 * to be named by — several sharing one tab, say, where the headings are what
 * tell them apart.
 */
export function SectionCard({ title, icon: Icon, action = null, children }) {
  return (
    <Card className="!p-0 overflow-hidden">
      {title && (
        <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-5">
          <h3 className="flex min-w-0 items-center gap-2.5 font-display text-lg font-bold text-primary">
            {Icon && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary-50 text-primary">
                <Icon className="h-[18px] w-[18px]" />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h3>
          {action}
        </div>
      )}
      <div className={`px-6 pb-6 pt-5 ${title ? 'border-t border-line-soft' : ''}`}>{children}</div>
    </Card>
  );
}

/** The grid every section's cells sit in — one place, so they all line up. */
const CELL_GRID = 'grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3';

/**
 * One entry: an icon tile, the title stack, and the classifying badge.
 *
 * A bordered tile per entry rather than hairlines between them — entries are
 * separate objects, and giving each its own edge says so more quietly than a
 * full-width rule while surviving a row that wraps onto three lines.
 */
function EntryRow({ section, item }) {
  const Icon = section.icon;
  const primary = section.primary(item);
  const secondary = section.secondary(item);
  const meta = section.meta(item).filter(Boolean);
  const badge = section.badge(item);

  return (
    <li className="flex items-start gap-3.5 rounded-control border border-line-soft bg-bg/40 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-primary shadow-card">
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-[15px] font-bold leading-snug text-primary">
          {primary || <span className="font-normal text-text-faint">—</span>}
        </p>
        {secondary && <p className="mt-0.5 break-words text-sm text-text-muted">{secondary}</p>}
        {meta.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-faint">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" className="text-line-strong">·</span>}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>

      {badge && (
        <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
    </li>
  );
}

function ListSection({ section, query }) {
  const items = pickRows(query?.data);

  // Untitled: the tab above it already reads Education / Job / Family.
  return (
    <SectionCard>
      {query?.isLoading ? (
        <div className="py-4"><Loader label={`Loading ${section.title.toLowerCase()}`} /></div>
      ) : query?.error ? (
        // Deliberately not an ErrorState with a retry: one list failing must not
        // turn the whole profile into an error screen, and the page's own retry
        // re-reads everything.
        <p className="py-4 text-sm text-danger-fg">Could not load {section.title.toLowerCase()}.</p>
      ) : items.length === 0 ? (
        <EmptyState title={section.empty} icon={section.icon} />
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, i) => (
            <EntryRow key={item.id ?? i} section={section} item={item} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * The identity card both pages open with.
 *
 * White rather than the navy gradient panel these two used to carry: that
 * gradient is the sidebar's, and repeating it as the first thing in the content
 * column made the page look like two navigation surfaces stacked. The record is
 * the subject here, so the card recedes and the name carries the page.
 *
 * @param photoSlot  rendered over the avatar's bottom-right — the /profile
 *                   camera button. Omitted on the member page, where somebody
 *                   else's photo is not yours to replace.
 * @param actions    the page's own buttons, right-aligned on a wide screen.
 */
export function ProfileHero({ photo, name, meta = [], chips = null, photoSlot = null, actions = null }) {
  return (
    <Card className="!p-0">
      <div className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:items-center sm:text-left">
        <div className="relative shrink-0">
          <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-bg text-primary ring-4 ring-line-soft/60">
            {photo
              ? <img src={photo} alt="" className="h-full w-full object-cover" />
              : <User className="h-11 w-11" fill="currentColor" strokeWidth={0} />}
          </span>
          {photoSlot}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold leading-tight text-primary">{name}</h1>
          {meta.filter(Boolean).map((line) => (
            <p key={line} className="mt-1 text-sm text-text-muted">{line}</p>
          ))}
          {chips && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">{chips}</div>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

/**
 * The strip, in page order: the detail cards, then the three lists.
 *
 * Built from the two definitions above rather than written out, so a section
 * added to either one appears on the strip without a second edit — the failure
 * it prevents is a section that exists and is unreachable.
 *
 * CARDS ARE GROUPED BY THEIR `tab`, AND MORE THAN ONE MAY SHARE ONE. That is
 * what puts Account Details under Personal instead of on a tab of its own, and
 * it is the reason this is a reduce rather than a map: a tab is a group of
 * cards, and the number of tabs is not the number of cards. First appearance
 * decides the order, so moving a card in the list above moves it on the strip.
 */
export const SECTION_TABS = [
  ...PROFILE_CARDS.reduce((tabs, card) => {
    const existing = tabs.find((t) => t.key === card.tab);
    if (existing) existing.cards.push(card);
    else tabs.push({ key: card.tab, label: card.tab, cards: [card] });
    return tabs;
  }, []),
  ...LIST_SECTIONS.map((section) => ({ key: section.key, label: section.tab, section })),
];

/**
 * ONE SECTION AT A TIME, BEHIND A TAB STRIP.
 *
 * These eight sections used to be stacked down one page — the whole record, in
 * one scroll. That is the right shape for a record you are reading THROUGH, and
 * the wrong one for a record you are looking something UP in: eight cards is a
 * page long enough that the top of it is gone before the bottom arrives, and on
 * a phone the Family list sat six screens below the name it belongs to.
 *
 * The same split the add / edit form uses, and deliberately the same idea: a
 * member's record has natural sections, and the form already taught everyone
 * what they are called. `Tabs` rather than the form's `Stepper` — a stepper
 * draws a progression with a first step and a last one, and there is nothing to
 * complete here.
 *
 * @param user       the record from GET /users/{id} or /users/me
 * @param userId     whose lists to read. Omitted, the three list TABS are left
 *                   off entirely rather than shown empty — "no education" and
 *                   "nobody asked" must not look the same.
 * @param omitTabs   keys to leave off the strip entirely. /profile passes
 *                   `['family']`: a member's own family is not theirs to look
 *                   after from their own screen — the Sevak maintaining their
 *                   record does that, on the member page, which still shows it.
 *                   Omitted rather than emptied, so there is no tab that opens
 *                   onto a list nobody here can act on.
 * @param extraTabs  `{ key, label, render }`, appended to the strip. THE WHOLE
 *                   POINT IS THAT THERE IS ONE STRIP: /profile closes with
 *                   Resume and My QR Code, which are not part of the record —
 *                   they are generated FROM it — and they used to be a second
 *                   row of tabs above this one. Two strips one line apart, both
 *                   switching what is below them, made "which tab am I on" a
 *                   question with two answers. `render` is called for its own
 *                   tab only, and its result is placed as-is: the page owns that
 *                   panel, including whatever card it sits in.
 * @param onTabChange  told the new key on every switch, so a page can gate a
 *                   query on its own tab being open — the same trick the three
 *                   list sections use below.
 */
export default function ProfileCards({ user, userId, omitTabs = [], extraTabs = [], onTabChange }) {
  const tabs = [
    ...(userId ? SECTION_TABS : SECTION_TABS.filter((t) => t.cards))
      .filter((t) => !omitTabs.includes(t.key)),
    ...extraTabs,
  ];
  const [tabKey, setTabKey] = useState(tabs[0].key);
  // A key that is no longer on the strip — the record arrived without an id
  // while a list tab was open — falls back rather than rendering nothing.
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  const openTab = (key) => {
    setTabKey(key);
    onTabChange?.(key);
  };

  /**
   * GATED ON THE OPEN TAB, which is what the tabs buy back. All three used to be
   * fetched on arrival because all three were on screen; now two of them are
   * behind tabs nobody may open, and three requests to render nothing is the
   * cost the old layout was paying for its scroll.
   *
   * React Query caches per member, so coming back to a tab is instant and a
   * second visit to the page costs nothing.
   */
  const educationsQ = useUserEducations(userId, Boolean(userId) && active.key === 'educations');
  const jobsQ = useUserJobs(userId, Boolean(userId) && active.key === 'jobs');
  const familyQ = useUserFamily(userId, Boolean(userId) && active.key === 'family');
  const queries = { educations: educationsQ, jobs: jobsQ, family: familyQ };

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs.map(({ key, label }) => ({ value: key, label }))}
        value={active.key}
        onChange={openTab}
      />

      {active.render ? active.render() : active.cards ? (
        active.cards.map((card) => (
          /* Untitled while a tab holds ONE card — the tab is its heading. Give
             a tab a second card and pass `title` / `icon` here, or the two
             arrive stacked with nothing to tell them apart. */
          <SectionCard key={card.title}>
            <dl className={CELL_GRID}>
              {cellsFor(user, card.rows).map(({ key, label, value }) => (
                <Field key={key} label={label} value={value} />
              ))}
            </dl>
          </SectionCard>
        ))
      ) : (
        <ListSection section={active.section} query={queries[active.section.key]} />
      )}
    </div>
  );
}
