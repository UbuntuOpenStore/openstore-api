import { Document, Model } from 'mongoose';
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
  download_url: string,
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
  nsfw?: boolean,
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
  qml_imports: string[],
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
  [key: string]: any, // TODO fix type
}

export interface PackageDoc extends PackageSchema {
  getLatestRevision(channel: Channel, arch?: Architecture, detectAll?: boolean, frameworks?: string, version?: string): { revisionData?: RevisionDoc | null, revisionIndex: number }
  updateFromClick(data: any): void; // TODO fix type
  updateFromBody(body: BodyUpdate): void;
  newRevision(version: string, channel: Channel, architecture: Architecture, framework: string, url: string, downloadSha512: string, filesize: number): void;
  getClickFilePath(channel: Channel, arch: Architecture, version: string): string;
  getIconFilePath(ext: string): string;
  architecture: string;
  next_revision: number;
}

export interface PackageModel extends Model<PackageDoc> {
  // TODO remove these
  XENIAL: Channel;
  FOCAL: Channel;
  DEFAULT_CHANNEL: Channel;
  CHANNELS: Channel[];
  ALL: Architecture,
  ARMHF: Architecture,
  ARM64: Architecture,
  AMD64: Architecture,
  ARCHITECTURES: Architecture[],
};
