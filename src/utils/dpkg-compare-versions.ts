import dpkgCompareVersions from 'dpkg-compare-versions';

/**
 * Type-safe wrapper around dpkg-compare-versions
 *
 * v1 < v2 : -1
 * v1 = v2 : 0
 * v1 > v2 : 1
 */
export function compareVersions(v1: string, v2: string): -1 | 0 | 1 {
  return dpkgCompareVersions(v1, v2);
};

// Check if a version string is a valid debian version number
export function isValidVersion(version: string): boolean {
  try {
    dpkgCompareVersions(version, version);
    return true;
  }
  catch {
    return false;
  }
};
