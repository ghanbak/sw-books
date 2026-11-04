/**
 * Root entry (`/`). The tab screens live under their own folders now (so each tab can
 * have a native large-title Stack), which means `(tabs)` no longer has an `index`
 * route — without this, `/` is an unmatched route at launch. Renders nothing: AuthGate
 * redirects away from `/` (a Redirect here too would replace this screen with a second
 * `(tabs)` on top of the anchor).
 */
export default function Index() {
	return null;
}
