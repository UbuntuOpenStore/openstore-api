import { Schema, model } from 'mongoose';
import { setupMethods } from './methods';
import { setupVirtuals } from './virtuals';
import { setupStatics } from './statics';
import { type RevisionModel, type PackageModel, type IRevision, type IPackageMethods, type IPackage } from './types';

const revisionSchema = new Schema<IRevision, RevisionModel>({
  revision: Number,
  version: String, // Unique among revisions with this arch
  downloads: Number,
  channel: String,
  download_url: String, // The path to the local click file
  download_sha512: String,
  architecture: String,
  framework: String,
  // Size in kB (TODO migrate this to bytes)
  filesize: Number, // TODO rename to installedSize
  // Size in bytes
  downloadSize: Number,
  created_date: String,
  permissions: [String],
});

const packageSchema = new Schema<IPackage, PackageModel, IPackageMethods>({
  id: { type: String, index: true },

  // Presentation
  name: String,
  tagline: String,
  description: String,
  changelog: String,
  screenshots: [String],

  // Discovery
  category: String,
  keywords: [String],
  nsfw: Boolean,

  // Info
  license: String,
  source: String,
  support_url: String,
  donate_url: String,
  video_url: String,
  translation_url: String,
  maintainer: String,
  maintainer_name: String, // TODO deprecate

  // Metadata
  author: String, // TODO rename to publisher
  manifest: {}, // TODO deprecate, put what is needed from the manifest into the revision data
  types: [String],
  type_override: String,
  languages: [String],
  architectures: [String], // TODO deprecate, get from the revisions where appropriate
  channel_architectures: [String], // A list of channel:architecture that the app supports
  device_compatibilities: [String], // A list of channel:arch:framework that the app supports
  locked: Boolean,
  qml_imports: [],
  read_paths: [String], // TODO move read/write path to the revisions
  write_paths: [String],
  review_exceptions: [String],
  skip_review: Boolean,

  // Publication metadata
  published: Boolean,
  published_date: String,
  updated_date: String,

  // Revisions
  revisions: [revisionSchema],
  channels: [String],

  icon: String, // Path to a local icon file

  // Number of ratings in each category
  rating_counts: [{ type: Schema.Types.ObjectId, ref: 'RatingCount' }],
  calculated_rating: Number,
});

packageSchema.index(
  {
    name: 'text',
    description: 'text',
    keywords: 'text',
    author: 'text',
  },
  {
    weights: {
      name: 10,
      description: 5,
      keywords: 3,
      author: 1,
    },
    name: 'searchIndex',
  },
);

setupMethods(packageSchema);
setupVirtuals(packageSchema);
setupStatics(packageSchema);

export const Package = model<IPackage, PackageModel>('Package', packageSchema);
