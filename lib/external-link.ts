import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';

/**
 * Open an external page in the in-app browser: light impact, then a `PAGE_SHEET`
 * (Safari View Controller) over the current screen. Closing it returns to where the
 * user was (same scroll position). Shared by Amazon, Wookieepedia and character links.
 */
export async function openInAppBrowser(url: string): Promise<void> {
	await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
	await WebBrowser.openBrowserAsync(url, {
		presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
	});
}
