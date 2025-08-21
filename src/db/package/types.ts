import { type FilterQuery, type HydratedDocument, type Model, type Types } from 'mongoose';
import { type Request } from 'express';

import { type ClickParserData } from 'utils';
import { type HydratedRatingCount } from '../rating_count/types';

export enum PackageType {
  APP = 'app',
  WEBAPP = 'webapp',
  WEBAPP_PLUS = 'webapp+',
}

export enum Channel {
  XENIAL = 'xenial',
  FOCAL = 'focal',
}

export const CHANNEL_CODE = {
  [Channel.XENIAL]: 0,
  [Channel.FOCAL]: 1,

  // More channels can be added later
  // [Channel.BETA]: 2,
  // [Channel.EDGE]: 3,
};

export const FRAMEWORKS = [
  'ubuntu-sdk-13.10',
  'ubuntu-sdk-14.04',
  'ubuntu-sdk-14.04-html',
  'ubuntu-sdk-14.04-papi',
  'ubuntu-sdk-14.04-qml',
  'ubuntu-sdk-14.10',
  'ubuntu-sdk-14.10-html',
  'ubuntu-sdk-14.10-papi',
  'ubuntu-sdk-14.10-qml',
  'ubuntu-sdk-15.04',
  'ubuntu-sdk-15.04-html',
  'ubuntu-sdk-15.04-papi',
  'ubuntu-sdk-15.04-qml',
  'ubuntu-sdk-15.04.1-html',
  'ubuntu-sdk-15.04.1-papi',
  'ubuntu-sdk-15.04.1-qml',
  'ubuntu-sdk-15.04.1',
  'ubuntu-sdk-15.04.2-html',
  'ubuntu-sdk-15.04.2-papi',
  'ubuntu-sdk-15.04.2-qml',
  'ubuntu-sdk-15.04.2',
  'ubuntu-sdk-15.04.3-html',
  'ubuntu-sdk-15.04.3-papi',
  'ubuntu-sdk-15.04.3-qml',
  'ubuntu-sdk-15.04.3',
  'ubuntu-sdk-15.04.4-html',
  'ubuntu-sdk-15.04.4-papi',
  'ubuntu-sdk-15.04.4-qml',
  'ubuntu-sdk-15.04.4',
  'ubuntu-sdk-15.04.5-html',
  'ubuntu-sdk-15.04.5-papi',
  'ubuntu-sdk-15.04.5-qml',
  'ubuntu-sdk-15.04.5',
  'ubuntu-sdk-15.04.6-html',
  'ubuntu-sdk-15.04.6-papi',
  'ubuntu-sdk-15.04.6-qml',
  'ubuntu-sdk-15.04.6',
  'ubuntu-sdk-15.04.7-html',
  'ubuntu-sdk-15.04.7-papi',
  'ubuntu-sdk-15.04.7-qml',
  'ubuntu-sdk-15.04.7',
  'ubuntu-sdk-16.04',
  'ubuntu-sdk-16.04-html',
  'ubuntu-sdk-16.04-papi',
  'ubuntu-sdk-16.04-qml',
  'ubuntu-sdk-16.04.1',
  'ubuntu-sdk-16.04.1-html',
  'ubuntu-sdk-16.04.1-papi',
  'ubuntu-sdk-16.04.1-qml',
  'ubuntu-sdk-16.04.2',
  'ubuntu-sdk-16.04.2-html',
  'ubuntu-sdk-16.04.2-papi',
  'ubuntu-sdk-16.04.2-qml',
  'ubuntu-sdk-16.04.3',
  'ubuntu-sdk-16.04.3-html',
  'ubuntu-sdk-16.04.3-papi',
  'ubuntu-sdk-16.04.3-qml',
  'ubuntu-sdk-16.04.4',
  'ubuntu-sdk-16.04.4-html',
  'ubuntu-sdk-16.04.4-papi',
  'ubuntu-sdk-16.04.4-qml',
  'ubuntu-sdk-16.04.5',
  'ubuntu-sdk-16.04.5-html',
  'ubuntu-sdk-16.04.5-papi',
  'ubuntu-sdk-16.04.5-qml',
  'ubuntu-sdk-16.04.6',
  'ubuntu-sdk-16.04.6-html',
  'ubuntu-sdk-16.04.6-papi',
  'ubuntu-sdk-16.04.6-qml',
  'ubuntu-sdk-16.04.7',
  'ubuntu-sdk-16.04.7-html',
  'ubuntu-sdk-16.04.7-papi',
  'ubuntu-sdk-16.04.7-qml',
  'ubuntu-sdk-16.04.8',
  'ubuntu-sdk-16.04.8-html',
  'ubuntu-sdk-16.04.8-papi',
  'ubuntu-sdk-16.04.8-qml',
  'ubuntu-sdk-20.04',
  'ubuntu-sdk-20.04-qml',
  'ubuntu-sdk-20.04.1',
  'ubuntu-sdk-20.04.1-qml',
  'ubuntu-touch-24.04-1.x',
  'ubuntu-touch-24.04-1.x-papi',
  'ubuntu-touch-24.04-1.x-qml',
];

export const FRAMEWORK_SET = new Set(FRAMEWORKS);

export const DEPRECATED_CHANNELS: Channel[] = [Channel.XENIAL];

export const DEFAULT_CHANNEL = Channel.FOCAL;

export enum Architecture {
  ALL = 'all',
  ARMHF = 'armhf',
  AMD64 = 'amd64',
  ARM64 = 'arm64',
}

export const ARCHITECTURE_CODE = {
  [Architecture.ALL]: 0,
  [Architecture.ARMHF]: 1,
  [Architecture.AMD64]: 2,
  [Architecture.ARM64]: 3,
};

export enum ChannelArchitecture {
  FOCAL_ALL = 'focal:all',
  FOCAL_ARMHF = 'focal:armhf',
  FOCAL_AMD64 = 'focal:amd64',
  FOCAL_ARM64 = 'focal:arm64',
  XENIAL_ALL = 'xenial:all',
  XENIAL_ARMHF = 'xenial:armhf',
  XENIAL_AMD64 = 'xenial:amd64',
  XENIAL_ARM64 = 'xenial:arm64',
}

export type File = {
  originalname: string;
  path: string;
  size: number;
};

export interface IRevision {
  revision: number;
  version: string;
  downloads: number;
  channel: Channel;
  download_url: string | null;
  download_sha512: string;
  architecture: Architecture;
  framework: string;
  filesize: number;
  downloadSize: number;
  created_date: string;
  permissions: string[];
}

export type HydratedRevision = HydratedDocument<IRevision>;

export interface RevisionModel extends Model<IRevision> { }

export interface SerializedDownload extends IRevision { }

export type SerializedRatings = {
  THUMBS_UP: number;
  THUMBS_DOWN: number;
  HAPPY: number;
  NEUTRAL: number;
  BUGGY: number;
};

export type SerializedPackage = {
  architecture: string;
  architectures: Architecture[];
  author: string;
  publisher: string;
  category: string;
  changelog: string;
  channels: Channel[];
  channel_architectures: ChannelArchitecture[];
  device_compatibilities: string[];
  description: string;
  downloads: SerializedDownload[];
  framework: string;
  icon: string;
  id: string;
  keywords: string[];
  license: string;
  maintainer_name: string | null;
  maintainer: string | null;
  manifest: {
    [key: string]: any;
  };
  name: string;
  nsfw: boolean;
  published_date: string;
  published: boolean;
  locked: boolean;
  screenshots: string[];
  source: string;
  support_url: string;
  donate_url: string;
  video_url: string;
  translation_url: string;
  tagline: string;
  types: PackageType[];
  updated_date: string;
  languages: string[];
  revisions: IRevision[];
  totalDownloads: number;
  latestDownloads: number;
  version: string;
  ratings: SerializedRatings;
  type_override: string;
  calculated_rating: number;
  revision: number;
  download: null;
  download_sha512: string;
  filesize: number;
  permissions: string[];
  review_exceptions: string[];
};

export type SerializedPackageSlim = {
  architectures?: Architecture[];
  author?: string;
  publisher?: string;
  name?: string;
  id?: string;
  category?: string;
  channels?: Channel[];
  description?: string;
  framework?: string;
  icon?: string;
  keywords?: string[];
  license?: string;
  nsfw?: boolean;
  published_date?: string;
  tagline?: string;
  types?: PackageType[];
  updated_date?: string;
  ratings?: SerializedRatings;
};

export type PackageStats = {
  categories: { [key: string]: number };
  types: { [key: string]: number };
  frameworks: { [key: string]: number };
  architectures: { [key: string]: number };
};

export type CategoryStat = {
  _id: string;
  count: number;
};

export type PackageRequestFilters = {
  limit?: number;
  skip?: number;
  sort?: string;
  types?: PackageType[];
  ids?: string[];
  frameworks?: string[] | string;
  architecture?: Architecture;
  architectures?: Architecture[];
  category?: string;
  author?: string;
  search?: string;
  channel?: Channel;
  nsfw?: (boolean | null)[];
  maintainer?: string;
  published?: boolean;
};

export interface IPackage {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  changelog?: string;
  screenshots: string[];
  category?: string;
  keywords: string[];
  nsfw?: boolean | null;
  license?: string;
  source?: string;
  support_url?: string;
  donate_url?: string;
  video_url?: string;
  translation_url?: string;
  maintainer?: string;
  maintainer_name?: string;
  author?: string;
  manifest?: { [key: string]: any };
  types: PackageType[];
  type_override?: PackageType;
  languages: string[];
  architectures: Architecture[];
  channel_architectures: ChannelArchitecture[];
  device_compatibilities: string[];
  locked?: boolean;
  qml_imports: {
    module: string;
    version: string;
  }[];
  read_paths?: string[];
  write_paths?: string[];
  review_exceptions?: string[];
  skip_review?: boolean;
  published?: boolean;
  published_date?: string;
  updated_date?: string;
  revisions: Types.DocumentArray<HydratedRevision>;
  channels: Channel[];
  icon?: string;
  rating_counts: Types.DocumentArray<HydratedRatingCount>;
  calculated_rating?: number;
}

export interface BodyUpdate {
  name?: string;
  published?: string | boolean;
  locked?: string | boolean;
  category?: string;
  changelog?: string;
  description?: string;
  license?: string;
  source?: string;
  support_url?: string;
  donate_url?: string;
  video_url?: string;
  translation_url?: string;
  tagline?: string;
  screenshots?: string[] | string;
  keywords?: string[] | string;
  nsfw?: boolean | string;
  type_override?: PackageType;
  maintainer?: string;
}

export interface IPackageMethods {
  getLatestRevision: (
    channel: Channel,
    arch?: Architecture,
    detectAll?: boolean,
    frameworks?: string[],
    version?: string
  ) => { revisionData?: HydratedRevision | null; revisionIndex: number };
  updateFromClick: (data: ClickParserData) => void;
  updateFromBody: (body: BodyUpdate) => Promise<void>;
  generateRevisionCode: (
    version: string,
    channel: Channel,
    architecture: Architecture,
    framework: string
  ) => number;
  createNextRevision: (
    version: string,
    channel: Channel,
    architecture: Architecture,
    framework: string,
    url: string,
    downloadSha512: string,
    installedSize: number,
    downloadSize: number,
    permissions?: string[],
  ) => number;
  getClickFilePath: (channel: Channel, arch: Architecture, version: string) => string;
  getIconFilePath: (ext: string) => string;
  getDownloadUrl: (channel: Channel, arch: Architecture, version?: string) => string;
  serializeRatings: () => SerializedRatings;
  serializeSlim: () => SerializedPackageSlim;
  serialize: (
    architecture?: Architecture,
    channel?: Channel,
    frameworks?: string[],
    apiVersion?: number
  ) => SerializedPackage;
  updateScreenshotFiles: (screenshotFiles: File[]) => Promise<void>;
  createRevisionFromClick: (filePath: string, channel: Channel, changelog?: string) => Promise<void>;
  updateCalculatedProperties: () => void;

  // Virtuals
  architecture: string;
  next_revision: number;
  icon_url: string;
}

export type HydratedPackage = HydratedDocument<IPackage, IPackageMethods>;

export interface PackageModel extends Model<IPackage, unknown, IPackageMethods> {
  incrementDownload: (id: Types.ObjectId, revisionIndex: number) => Promise<void>;
  stats: () => Promise<PackageStats>;
  categoryStats: (channels: Channel[]) => Promise<CategoryStat[]>;
  parseRequestFilters: (req: Request) => PackageRequestFilters;
  parseFilters: (filters: PackageRequestFilters, textSearch?: boolean) => FilterQuery<IPackage>;
  countByFilters: (filters: PackageRequestFilters, textSearch?: boolean) => Promise<number>;
  findByFilters: (
    filters: PackageRequestFilters,
    sort?: string,
    limit?: number,
    skip?: number,
    textSearch?: boolean
  ) => Promise<HydratedPackage[]>;
  findOneByFilters: (id: string, filters?: PackageRequestFilters) => Promise<HydratedPackage | null>;
  searchByFilters: (filters: PackageRequestFilters, full: boolean) => Promise<{ pkgs: HydratedPackage[]; count: number }>;
  checkId: (id: string) => Promise<void>;
  checkRestrictedId: (id: string) => void;
}
