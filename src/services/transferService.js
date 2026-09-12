import { api } from '../api/client';

/** Nothing was chosen — null, undefined, or the empty string a Select yields. */
const blank = (value) => value == null || String(value).trim() === '';

export const transferService = {
  /**
   * POST /api/v1/notifications/transfer-request
   * Body: `TransferRequestCreate` —
   *   { user_id, type: 'mandal' | 'sabha', to_pradesh_id, to_mandal_id?, to_sabha_id? }
   *
   * Files a transfer REQUEST. A `requested` record is created and appears in the
   * destination side's pending queue; the member does not change Sabha until it
   * is accepted, so no screen may patch a row as though they had.
   *
   * Replaces `/notifications/quick-transfer`, which moved a member on the spot.
   *
   * All three destination ids are sent for BOTH types: the spec requires
   * `to_pradesh_id` and wants `to_mandal_id` even when only the Sabha changes,
   * and validates that each belongs to the one above it. `to_sabha_id` is
   * mandatory for a `sabha` transfer and optional for a `mandal` one.
   * `from_*` is derived by the backend from the target user and is NOT accepted
   * from the body.
   *
   * `type` is the discriminator and is passed straight through — 'sabha' for a
   * move within the member's own Mandal, 'mandal' for a move to another Mandal
   * in their Pradesh.
   *
   * Asks for the envelope so the backend's own success wording reaches the toast.
   */
  createTransferRequest: ({ userId, type, toPradeshId, toMandalId, toSabhaId }) =>
    api.post(
      '/api/v1/notifications/transfer-request',
      {
        user_id: Number(userId),
        type,
        to_pradesh_id: Number(toPradeshId),
        // `blank` and not just `== null`: an unselected dropdown hands over '',
        // and `Number('')` is 0 — a destination id nobody chose, which the API
        // would reject or, worse, resolve to something.
        ...(blank(toMandalId) ? {} : { to_mandal_id: Number(toMandalId) }),
        ...(blank(toSabhaId) ? {} : { to_sabha_id: Number(toSabhaId) }),
      },
      { envelope: true }
    ),
};
