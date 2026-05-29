/**
 * Curated review lists snapshot from
 * docs/plans/2026-05-05-data-manual-isbn-review-plan.md. These books' ISBNs
 * couldn't be auto-verified — flagged for human review, not provably wrong.
 */

export const MANUAL_REVIEW_WEAK: readonly string[] = [
	'a-new-dawn',
	'a-new-hope-novelization',
	'a-test-of-courage',
	'aftermath',
	'aftermath-life-debt',
	'cataclysm',
	'choices-of-one',
	'corellian-trilogy-assault',
	'dark-disciple',
	'dark-lord-rise-of-darth-vader',
	'defy-the-storm',
	'fotj-apocalypse',
	'fotj-vortex',
	'han-solo-at-stars-end',
	'lords-of-the-sith',
	'njo-force-heretic-reunion',
	'red-harvest',
	'reign-of-the-empire-mask-of-fear',
	'the-fallen-star',
	'the-old-republic-revan',
	'thrawn-ascendancy-chaos-rising',
	'thrawn-ascendancy-greater-good',
	'victorys-price',
	'x-wing-bacta-war',
	'x-wing-iron-fist',
	'x-wing-krytos-trap',
	'x-wing-solo-command',
	'x-wing-wedges-gamble',
];

export const MANUAL_REVIEW_NO_DATA: readonly string[] = [
	'acolyte-crystal-crown',
	'acolyte-wayseeker',
	'bloodline',
	'corellian-trilogy-ambush',
	'corellian-trilogy-showdown',
	'hand-of-thrawn-vision',
	'into-the-light',
	'mace-windu-glass-abyss',
	'temptation-of-the-force',
	'the-living-force',
	'trials-of-the-jedi',
	'x-wing-wraith-squadron',
];
