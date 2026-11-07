/**
 * Exhaustiveness guard for discriminated-union `switch`es: put it in the `default`
 * branch so adding a union member without handling it fails typecheck. Throws if an
 * unexpected value slips past the types at runtime.
 */
export function assertNever(value: never): never {
	throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
