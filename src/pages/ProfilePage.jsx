import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Download, RefreshCw, Trash2 } from 'lucide-react';
import {
  useFeatures, useMyResumes, usePermissions, useProfile,
  useProfileImage, useRegenerateQr, useResumeMutations, useToast,
  useUploadProfileImage, useRemoveProfileImage, stampPhotoUrl,
} from '../hooks';
import { Button, Card, ErrorState, PageLoader, Skeleton } from '../components/ui';
import ProfileCards, { ProfileHero } from '../components/user-detail/ProfileCards';
import ImageCropDialog from '../components/ImageCropDialog';
import { isAttending, statusLabel } from '../components/hierarchy/MemberList';
import { formatDate } from '../utils/format';
import { pickRows } from '../utils/options';
import { profileService } from '../services/profileService';
import { saveRemoteImage } from '../utils/saveImage';
import { LOADING } from '../constants/messages';

// The signed-in member's own record. The id comes from full-context rather than
// the route: this screen is always "me", which is why the header chip links here
// without one.
//
// What can be changed from here, and what cannot:
//
//   The whole record             through Edit, which opens the member form —
//                                including Education, Job and Family, which have
//                                their own steps there
//   Sabha & Followup             not editable anywhere by the member. Placement
//                                moves through Quick Transfer and follow-up
//                                through its own endpoint, neither of which is a
//                                member's own decision
//   Resume, My QR Code           generated, not entered

const MEMBERS_PATH = '/users';

/**
 * Three tabs, not eight.
 *
 * Personal, Address, Sabha, Education, Job and Family were six tabs holding the
 * six sections that `ProfileCards` now renders together on one page — the SAME
 * component the member page uses, so a member sees their own record laid out
 * exactly as somebody viewing it does. That is the whole point of the merge:
 * the two screens had drifted into different groupings and different row lists.
 *
 * Resume and My QR Code are the last two tabs on that same strip, passed to
 * ProfileCards as `extraTabs`. Neither is part of the record — both are
 * generated FROM it, and neither exists on the member page — but they are
 * still one of the things this screen can show you, and a second row of tabs
 * saying so sat one line above the first, both switching the same area.
 */

export default function ProfilePage() {
  // No `can` here any more: nothing on this screen is permission-gated. It is
  // one member looking at their own record.
  const { userId, userName, roleName } = usePermissions();
  const toast = useToast();
  // Mirrors the tab ProfileCards has open, for the one query that is gated on
  // it. ProfileCards owns the strip; this only listens.
  const [tabKey, setTabKey] = useState('Personal');
  const photoInput = useRef(null);

  const { data, isLoading, isError, error, refetch } = useProfile(userId);

  // Backend module toggle — a per-env rollout gate. When the module is OFF its
  // routers are unmounted and calls 404, so the flag lets this page drop the
  // tab BEFORE any such request runs.
  //
  // Resume only. `features.jobs` is deliberately NOT read here any more: it
  // gates the job PORTAL, and a member's own job / business details are profile
  // data that is always available.
  const featuresQ = useFeatures();
  const resumeEnabled = featuresQ.data?.resume === true;

  // Education, job and family are no longer read here — ProfileCards owns those
  // three sections and fetches them itself, so both this page and the member
  // page get the same lists through the same query keys.
  //
  // Gated on `resumeEnabled` so the query is not fired at all when the module
  // is off in this deployment — a request to a 404 route is not worth the
  // round-trip, and the error state on the disabled tab would be misleading.
  const resumesQ = useMyResumes(resumeEnabled && tabKey === 'resume');
  const imageQ = useProfileImage(userId);
  const resumeMutations = useResumeMutations();
  const uploadPhoto = useUploadProfileImage(userId);
  const removePhoto = useRemoveProfileImage(userId);
  const regenerateQr = useRegenerateQr(userId);
  // Only a genuinely UPLOADED photo can be removed — the fallback initials
  // avatar has nothing to delete.
  const hasPhoto = Boolean(imageQ.data?.image_url);

  const handleRemovePhoto = async () => {
    if (!window.confirm('Remove your profile photo? Your initials will show instead.')) return;
    try {
      const res = await removePhoto.mutateAsync();
      toast.success(res?.detail || 'Profile photo removed.');
    } catch (err) {
      toast.error(err?.message || 'Could not remove the photo.');
    }
  };

  /**
   * The QR image address never changes — the filename is derived from the id —
   * so a regenerate is invisible to the browser unless the cache is stepped
   * past. `qrNonce` is that step, and doubles as the retry for an image that
   * did not exist the first time it was asked for.
   */
  const [qrNonce, setQrNonce] = useState(0);
  const [qrMissing, setQrMissing] = useState(false);
  /**
   * Load the QR as a CORS request rather than a plain one.
   *
   * The picture on this tab and the picture the Download button fetches are the
   * same URL, and a plain `<img>` sends no `Origin`. The reply to that has no
   * `Access-Control-Allow-Origin` on it, and once the API made these images
   * cacheable, THAT was the copy the download's fetch was handed — a CORS fetch
   * cannot read it, so downloading failed on a code rendering perfectly above
   * the button. Asking for it with credentials-less CORS makes both reads the
   * same kind of request, so they cannot disagree about what is cached.
   *
   * FALLS BACK RATHER THAN BREAKS. A `crossorigin` image whose response carries
   * no such header does not render AT ALL, so if this is ever served by an API
   * that does not send one — an older backend, or a stale copy still at the edge
   * — the first failure retries as an ordinary image instead. The QR is still
   * shown; only the download is degraded, which is the right way round.
   */
  const [qrCors, setQrCors] = useState(true);
  // Not a mutation — nothing is written — so it carries its own pending flag.
  const [qrSaving, setQrSaving] = useState(false);
  const qrSrc = `${profileService.qrCodeUrl(userId)}${qrNonce ? `?v=${qrNonce}` : ''}`;

  // No lookups here any more. Education levels, job industries and relations
  // were fetched to turn ids into labels inside the editable rows; the record's
  // own response already carries `education_level_name`, `job_industry_name` and
  // `relation_name`, so the read-only view resolves them with no extra request.

  // Editing goes through the member form, which covers Personal, Address,
  // Education, Job and Family; Sabha and Follow-up are read-only there too.
  //
  // NOT GATED. This screen is always the signed-in member's own record, and
  // nobody needs a permission to edit themselves — see the `isSelf` note in
  // UserFormPage, which is where the same rule is enforced on arrival. It used
  // to hang on USERS:UPDATE, so the Edit button showed for a Sabha Head and not
  // for a Yuvak, on a page that is the same person either way.
  //
  // What a self-edit may actually change is decided per FIELD, not by this
  // button: names and address open an approval request, the membership flags
  // are locked, and the rest saves directly. See utils/selfUpdate.js.

  // Fall back to the names already in full-context so the identity panel is
  // populated on first paint, before the detail request lands.
  const name = data?.user_name || userName || 'User';
  const role = data?.role_name || roleName;
  const attending = isAttending(data?.status);
  // The fallback is stamped as well: it is the same file at the same address, so
  // an unstamped `photo_url` would put the pre-upload image back on screen for
  // as long as the photo query is still in flight.
  const photo = imageQ.data?.image_url || stampPhotoUrl(data?.photo_url, userId);

  // Picking a file no longer uploads straight away — it opens the crop dialog,
  // and the cropped square is what gets uploaded (see cropFile / uploadCropped).
  const [cropFile, setCropFile] = useState(null);

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';           // let the same file be chosen twice
    if (file) setCropFile(file);
  };

  const uploadCropped = async (cropped) => {
    try {
      const res = await uploadPhoto.mutateAsync(cropped);
      toast.success(res?.detail || 'Profile photo updated.');
      setCropFile(null);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const generateResume = async () => {
    try {
      const res = await resumeMutations.create.mutateAsync();
      toast.success(res?.detail || 'Resume generated.');
      // The backend says so itself when it built something thin — no education,
      // no jobs — rather than refusing to build at all.
      if (res?.data?.warning) toast.warning(res.data.warning);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  /**
   * Save the QR image.
   *
   * On a phone this is the share sheet, which is the only route to the camera
   * roll — a member is far more likely to want this in their gallery, or sent to
   * someone, than in a Downloads folder. Everywhere else it is a plain download.
   * See utils/saveImage.js, which the report images use for the same two routes.
   *
   * Named for the member, not for the file on the server: that is
   * `akshar-connect-<id>.jpeg`, which says nothing to whoever it is sent to.
   *
   * "Amit Limbasia QR.jpeg" — the display name as it stands (proper case and
   * spacing kept), with " QR" appended. Only characters the filesystem
   * refuses (`\ / : * ? " < > |` and control characters) are stripped;
   * everything else, including spaces and any script the name is written in,
   * is preserved. Falls back to "Akshar Connect QR" for a truly blank name.
   */
  const downloadQr = async () => {
    setQrSaving(true);
    const cleaned = String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '').replace(/\s+/g, ' ').trim();
    const res = await saveRemoteImage(qrSrc, `${cleaned || 'Akshar Connect'} QR.jpeg`);
    setQrSaving(false);

    if (res.ok) {
      toast.success(res.mode === 'share' ? 'QR code shared.' : 'QR code downloaded.');
      return;
    }
    // Dismissing the share sheet is a decision, and gets no toast at all.
    if (res.reason !== 'cancelled') toast.error(res.reason);
  };

  const generateQr = async () => {
    try {
      const res = await regenerateQr.mutateAsync();
      setQrMissing(false);
      // A new address, so nothing is cached against it yet and the CORS load is
      // worth attempting again — a fallback earned by the previous URL should
      // not disable the download for the life of the page.
      setQrCors(true);
      setQrNonce(Date.now());
      toast.success(res?.detail || 'QR code generated.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const deleteResume = async (id) => {
    try {
      const res = await resumeMutations.remove.mutateAsync(id);
      toast.success(res?.detail || 'Resume deleted.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  if (isLoading) return <PageLoader label={LOADING.page} />;
  if (isError) {
    return (
      <Card>
        <ErrorState error={error} onRetry={refetch} title="Could not load your profile" />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <ProfileHero
        photo={photo}
        name={name}
        meta={[data?.mobile_number, [data?.sabha_name, data?.mandal_name].filter(Boolean).join(' · ')]}
        photoSlot={
          <>
            {/* Your own photo is yours to change, whatever the edit grant says
                about the record's fields. */}
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={uploadPhoto.isPending || removePhoto.isPending}
              aria-label="Change profile photo"
              className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-accent text-white ring-4 ring-surface transition-transform hover:scale-105 disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
            </button>
            {/* Remove — only when there is an uploaded photo to take down. Sits
                opposite the change button so the two do not crowd. */}
            {hasPhoto && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploadPhoto.isPending || removePhoto.isPending}
                aria-label="Remove profile photo"
                title="Remove photo"
                className="absolute bottom-0 left-0 grid h-9 w-9 place-items-center rounded-full bg-danger-fg text-white ring-4 ring-surface transition-transform hover:scale-105 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={choosePhoto}
            />
          </>
        }
        chips={
          <>
            {role && (
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary">{role}</span>
            )}
            {data?.status != null && data.status !== '' && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  attending ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${attending ? 'bg-success-fg' : 'bg-danger-fg'}`} />
                {statusLabel(data.status)}
              </span>
            )}
          </>
        }
        actions={
          <Link to={`${MEMBERS_PATH}/${userId}/edit`}>
            <Button variant="accent">Edit Profile</Button>
          </Link>
        }
      />

      {/* ONE STRIP, owned by ProfileCards: the record's own sections, then the
          two things generated from it. The prev/next pair that used to close
          this page went with the second strip — it stepped through Profile ›
          Resume › QR, a progression that no longer exists now that those two
          sit at the end of a list of nine. */}
      <ProfileCards
        user={data}
        userId={userId}
        onTabChange={setTabKey}
        // Your own family is not maintained from your own screen — see the
        // matching rule on the edit form, which drops the same step.
        //
        // `jobs` IS NO LONGER GATED. A member's own job / business details are
        // profile data, like education, and `job.router` is now mounted in
        // every environment (see main.py). `MODULE_JOBS_ENABLED` was never
        // about this tab — it gates the job PORTAL — and keying the tab off it
        // meant own-profile quietly hid the section while `/users/{id}/edit`
        // showed the same step erroring, because that screen never checked.
        omitTabs={['family']}
        extraTabs={[
          // Resume tab is present only when the Resume module is enabled in
          // this deployment. Same rationale as `jobs` above — a disabled
          // module's endpoints 404, and a Resume tab whose "Generate" button
          // errors reads as a bug rather than an off-switch.
          ...(resumeEnabled ? [{
            key: 'resume',
            label: 'Resume',
            render: () => (
              <div className="space-y-4">
                <div className="rounded-card border border-line-soft bg-bg p-5">
                  <h3 className="section-title">Resume Builder</h3>
                  <p className="mt-1 max-w-2xl text-sm text-text-muted">
                    Generate a PDF resume from your profile, education and job details. Each resume
                    is a frozen snapshot — later profile edits won’t change resumes you’ve already
                    created.
                  </p>
                  <Button
                    variant="accent"
                    className="mt-4"
                    onClick={generateResume}
                    busy={resumeMutations.create.isPending}
                  >
                    Generate Resume
                  </Button>
                </div>

                <ResumeList
                  query={resumesQ}
                  onDelete={deleteResume}
                  busy={resumeMutations.remove.isPending}
                />
              </div>
            ),
          }] : []),
          {
            key: 'qr',
            label: 'My QR Code',
            render: () => (
              <Card className="text-center">
                {qrMissing ? (
                  <div className="py-10">
                    <p className="text-sm text-text-muted">
                      No QR code has been generated for your account yet.
                    </p>
                    <Button variant="accent" className="mt-4" onClick={generateQr} busy={regenerateQr.isPending}>
                      Generate QR code
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto w-fit rounded-card border border-line-soft p-6">
                      <img
                        // Remounts on the fallback rather than only swapping the
                        // attribute: changing `crossOrigin` on a live element is
                        // not reliably a reason for the browser to fetch again,
                        // and a retry that never re-requests is not a retry.
                        key={qrCors ? 'cors' : 'plain'}
                        src={qrSrc}
                        crossOrigin={qrCors ? 'anonymous' : undefined}
                        alt="Your attendance QR code"
                        className="h-56 w-56 object-contain"
                        // Two different failures arrive here identically — the
                        // image is public and served straight off the API, so a
                        // 404 is the only way to learn it was never written, and
                        // a CORS refusal looks exactly the same. So the CORS
                        // attempt is spent FIRST and only the plain load is
                        // allowed to conclude the code is missing; otherwise a
                        // header problem would tell the member to generate a QR
                        // they already have.
                        onError={() => (qrCors ? setQrCors(false) : setQrMissing(true))}
                      />
                    </div>
                    <p className="mt-4 text-sm text-text-muted">
                      Show this at Sabha to mark your attendance
                    </p>
                    {/* Download leads: keeping the code is what a member came
                        here to do, and regenerating it is the rarer, more
                        consequential act — every printed or forwarded copy of
                        the old one stops scanning. So the accent button saves
                        and the outline one replaces. */}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button variant="accent" onClick={downloadQr} busy={qrSaving}>
                        <Download className="h-4 w-4" />
                        Download QR Code
                      </Button>
                      {/* No grant is checked: the endpoint lets any authenticated
                          member regenerate their OWN code, and
                          `USERS:GENERATE_QR` is required only for somebody
                          else's. */}
                      <Button variant="outline" onClick={generateQr} busy={regenerateQr.isPending}>
                        <RefreshCw className="h-4 w-4" />
                        Regenerate QR Code
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Crop-and-zoom before upload — opens when a photo is picked, uploads
          the cropped square on Save. */}
      <ImageCropDialog
        file={cropFile}
        busy={uploadPhoto.isPending}
        onCancel={() => setCropFile(null)}
        onCropped={uploadCropped}
      />
    </div>
  );
}

function ResumeList({ query, onDelete, busy }) {
  if (query.isLoading) {
    return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }
  if (query.error) {
    return <Card><ErrorState error={query.error} onRetry={query.refetch} title="Could not load your resumes" /></Card>;
  }

  const rows = pickRows(query.data);
  if (!rows.length) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-text-muted">
          No resumes yet. Generate your first resume above.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-card border border-line-soft bg-surface px-5 py-4"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-primary">Version {r.version}</p>
            {r.created_at && <p className="text-xs text-text-muted">{formatDate(r.created_at)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {r.resume_path && (
              <a
                href={r.resume_path}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-primary transition-colors hover:text-accent"
              >
                Open
              </a>
            )}
            <button
              type="button"
              onClick={() => onDelete(r.id)}
              disabled={busy}
              aria-label={`Delete version ${r.version}`}
              className="rounded-lg p-2 text-danger-fg transition-colors hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
