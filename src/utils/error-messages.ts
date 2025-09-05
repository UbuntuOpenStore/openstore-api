export const APP_NOT_FOUND = 'App not found';
export const DOWNLOAD_NOT_FOUND_FOR_CHANNEL = 'Download not available for this channel';
export const INVALID_CHANNEL = 'The provided channel is not valid';
export const INVALID_ARCH = 'The provided architecture is not valid';
export const MISSING_CHANNEL_ARCH = 'Channel must be specified when architecture is present';

export const NEEDS_MANUAL_REVIEW = 'This app needs to be reviewed manually';
export const CLICK_REVIEW_ERROR = 'The uploaded click did not pass automated review. Please fix the issues and upload again.';
export const MALFORMED_MANIFEST = 'Your package manifest is malformed';
export const DUPLICATE_PACKAGE = 'A package with the same name already exists';
export const PERMISSION_DENIED = 'You do not have permission to update this app';
export const BAD_FILE = 'The file must be a click package';
export const WRONG_PACKAGE = 'The uploaded package does not match the name of the package you are editing';
export const BAD_NAMESPACE = 'You package name is for a domain that you do not have access to';
export const EXISTING_VERSION = 'A revision already exists with this version and architecture';
export const NON_ASCENDING_VERSION =
  'Version must be greater than all existing revisions for the same channel, architecture, and framework';
export const INVALID_VERSION =
  // eslint-disable-next-line max-len
  "The version number is not valid for a Click package. Click packages' version follow the same rules as Debian packages. See https://manpages.debian.org/testing/dpkg-dev/deb-version.7.en.html";
export const NO_FILE = 'No file upload specified';
export const NO_REVISIONS = 'You cannot publish your package until you upload a revision';
export const NO_APP_NAME = 'No app name specified';
export const NO_SPACES_NAME = 'You cannot have spaces in your app name';
export const NO_APP_TITLE = 'No app title specified';
export const APP_HAS_REVISIONS = 'Cannot delete an app that already has revisions';
export const NO_ALL = 'You cannot upload a click with the architecture "all" for the same version as an architecture specific click';
export const NO_NON_ALL = 'You cannot upload and architecture specific click for the same version as a click with the architecture "all"';
export const MISMATCHED_FRAMEWORK = 'Framework does not match existing click of a different architecture';
export const MISMATCHED_PERMISSIONS = 'Permissions do not match existing click of a different architecture';
export const APP_LOCKED = 'Sorry this app has been locked by an admin';

export const PARAMETER_MISSING = 'Missing parameters for this endpoint';
export const REVIEW_TOO_LONG = 'The review is too long';
export const INVALID_RATING = 'Invalid rating';
export const VERSION_NOT_FOUND = 'Specified version is unknown';
export const CANNOT_REVIEW_OWN_APP = 'Reviewing your own app is not allowed';
export const REVIEW_REDACTED = 'Redacted reviews cannot be edited';

export const USER_NOT_FOUND = 'User not found';
