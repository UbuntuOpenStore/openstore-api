import { Document, Model } from 'mongoose';
import { ClickParserData } from 'utils';
import { RatingCountDoc } from '../rating_count/types';

export enum PackageType {
  APP = 'app',
  WEBAPP = 'webapp',
  WEBAPP_PLUS = 'webapp+',
}

export enum Channel {
  XENIAL = 'xenial',
  FOCAL = 'focal',
}

export const DEFAULT_CHANNEL = Channel.XENIAL;

export enum Architecture {
  ALL = 'all',
  ARMHF = 'armhf',
  AMD64 = 'amd64',
  ARM64 = 'arm64',
}

export interface RevisionSchema {
  revision: number,
  version: string,
  downloads: number,
  channel: Channel,
  download_url: string | null,
  download_sha512: string,
  architecture: Architecture,
  framework: string,
  filesize: number,
  created_date: string,
}

export interface RevisionDoc extends RevisionSchema, Document {}

export interface RevisionModel extends Model<RevisionDoc> {}

export interface PackageSchema {
  id: string,
  name: string,
  tagline?: string,
  description?: string,
  changelog?: string,
  screenshots: string[],
  category?: string,
  keywords: string[],
  nsfw?: boolean | null,
  license?: string,
  source?: string,
  support_url?: string,
  donate_url?: string,
  video_url?: string,
  maintainer?: string,
  maintainer_name?: string,
  framework?: string,
  author?: string,
  version?: string,
  manifest?: { [key: string]: any },
  types: PackageType[],
  type_override?: PackageType,
  languages: string[],
  architectures: Architecture[],
  locked?: boolean,
  qml_imports: {
    module: string;
    version: string;
  }[],
  published?: boolean,
  published_date?: string,
  updated_date?: string,
  revisions: RevisionDoc[],
  channels: Channel[],
  icon?: string,
  rating_counts: RatingCountDoc[],
  calculated_rating?: number,
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
  tagline?: string;
  screenshots?: string[] | string;
  keywords?: string[] | string;
  nsfw?: boolean;
  type_override?: PackageType;
  maintainer?: string;
}

export interface PackageDoc extends PackageSchema {
  getLatestRevision(
    channel: Channel,
    arch?: Architecture,
    detectAll?: boolean,
    frameworks?: string,
    version?: string
  ): { revisionData?: RevisionDoc | null, revisionIndex: number }
  updateFromClick(data: ClickParserData): void;
  updateFromBody(body: BodyUpdate): void;
  newRevision(
    version: string,
    channel: Channel,
    architecture: Architecture,
    framework: string,
    url: string,
    downloadSha512: string,
    filesize: number
  ): void;
  getClickFilePath(channel: Channel, arch: Architecture, version: string): string;
  getIconFilePath(ext: string): string;
  architecture: string;
  next_revision: number;
}

export interface PackageModel extends Model<PackageDoc> {}

export type PackageRequestFilters = {
  limit?: number;
  skip?: number;
  sort?: string;
  types?: PackageType[];
  ids?: string[];
  frameworks?: string[];
  architectures?: Architecture[];
  category?: string;
  author?: string;
  search?: string;
  channel?: Channel;
  nsfw?: (boolean | null)[];
  maintainer?: string;
  published?: boolean;
}

// TODO merge this with PackageRequestFilters
export type PackageFindOneFilters = {
  published?: boolean;
  frameworks?: string;
  architecture?: Architecture;
  maintainer?: string;
}

export interface SerializedDownload extends RevisionSchema {}

export type SerializedRatings = {
  THUMBS_UP: number;
  THUMBS_DOWN: number;
  HAPPY: number;
  NEUTRAL: number;
  BUGGY: number;
}

export type SerializedPackage = {
  architecture: string;
  architectures: Architecture[];
  author: string;
  category: string;
  changelog: string;
  channels: Channel[];
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
  tagline: string;
  types: PackageType[];
  updated_date: string;
  languages: string[];
  revisions: RevisionSchema[];
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
};

export type SerializedPackageSlim = {
  architectures?: Architecture[];
  author?: string;
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
