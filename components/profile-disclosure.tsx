// Profile's platform-native pieces. iOS (and web) keep the SwiftUI views app/profile.tsx always
// used; Android resolves profile-disclosure.android.tsx instead, so Metro never bundles
// @expo/ui/swift-ui there (its native views don't exist on Android).
export { DisclosureGroup, ProgressView } from '@expo/ui/swift-ui';
export { disabled } from '@expo/ui/swift-ui/modifiers';
