// Every localStorage / sessionStorage key the app writes, in one place, so a
// rename never leaves a reader looking at a key nothing writes any more.
export const STORAGE_KEYS = {
  /** sessionStorage: the Token record, mirrored so a reload can resume it. */
  token: 'ac.token',
  /** localStorage: "a session was established on this device once" — a hint, not a credential. */
  sessionHint: 'ac.session',
  /**
   * localStorage: the ISO instant the notification list was last marked read.
   *
   * Read state is LOCAL because the API has none: nothing in the notification
   * sources (transfer requests, information-change requests) carries a read
   * flag, and there is no endpoint to set one. A watermark rather than a set of
   * ids, so anything that arrives later is unread automatically and the entry
   * never grows. Per device and per browser, which is the honest scope for a
   * value the server does not know about.
   */
  notificationsReadAt: 'ac.notifications.readAt',
  /**
   * sessionStorage: "the birthday-wishes popup has already been shown for THIS
   * SIGN-IN".
   *
   * Cleared by `forgetSession`, which is what makes it per-login rather than per
   * tab: signing out and back in shows the greeting again, while a reload — which
   * resumes the same session rather than starting one — does not put it back on
   * screen a second time.
   */
  birthdayWishesSeen: 'ac.birthdayWishes.seen',
  /**
   * localStorage: `{ "<userId>": "YYYY-MM-DD" }` — the local day each member
   * last closed the "My QR Code" popup on this device.
   *
   * ONCE A DAY WHILE SIGNED IN, AND AGAIN AFTER EVERY FRESH SIGN-IN, by request.
   * Most members never sign out of the app on their phone, so the day is what
   * brings it back; signing out and in again brings it back the same day.
   *
   * Removed on an INTERACTIVE login (AuthContext `establish`) and on sign-out
   * (`signOut`, so a biometric login after it shows the code too), not by
   * `forgetSession`: that also runs when a reload finds an expired access token
   * and quietly refreshes it, which is not a new login and must not show the
   * code again. Keyed by user id so a second family account on the same phone
   * still gets its own code on its own first visit of the day.
   */
  qrPopupShownOn: 'ac.qrPopup.shownOn',
  /**
   * localStorage: `{ "<userId>": <epoch ms> }` — when each member's photo was
   * last replaced from this device.
   *
   * Appended to the image URL so the request is one no cache has answered
   * before. It has to OUTLIVE THE TAB: the photo's address never changes, so
   * after a reload the app would ask for the plain URL again and the browser
   * would serve the copy it is still holding — which is how a freshly uploaded
   * photo came back as the old one on the next cold start. That is most of the
   * time on a phone, where the PWA is backgrounded and restarted constantly.
   *
   * Per device, which is the honest scope: it is a note about what THIS
   * browser's cache is wrong about, and no other device's cache is wrong in the
   * same way. Deliberately NOT cleared on sign-out — the stale bytes are still
   * there after somebody else signs in, so forgetting would put the bug back.
   */
  photoStamps: 'ac.photo.stamps',
};
