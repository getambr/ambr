import pkg from '../../package.json';

// The platform version every machine surface reports (/api/health and the A2A card).
// It comes from package.json so a release changes it in one place. server.json is a
// static file and is bumped by hand in the same commit.
export const PLATFORM_VERSION: string = pkg.version;
export const PLATFORM_RELEASED_AT = '2026-10-27T00:00:00Z';
