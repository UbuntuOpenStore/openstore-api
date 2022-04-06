/* eslint-disable no-param-reassign */

import { Schema } from 'mongoose';
import path from 'path';

import { config } from 'utils';
import { DEFAULT_CHANNEL, PackageDoc, PackageModel } from './types';

const DEFAULT_VERSION = '0.0.0';

export function setupVirtuals(packageSchema: Schema<PackageDoc, PackageModel>) {
  packageSchema.virtual('architecture').get(function(this: PackageDoc): string {
    return this.architectures.join(',');
  });

  packageSchema.virtual('next_revision').get(function(this: PackageDoc): number {
    let revision = 0;
    const revisions = this.revisions.map((data) => data.revision);

    if (revisions.length > 0) {
      revision = Math.max(...revisions);
    }

    return revision + 1;
  });

  packageSchema.virtual('icon_url').get(function(this: PackageDoc): string {
    const ext = this.icon ? path.extname(this.icon) : '.png';
    let version = DEFAULT_VERSION;

    let channel = DEFAULT_CHANNEL;
    if (!this.channels.includes(channel) && this.channels.length > 0) {
      channel = this.channels[0];
    }

    const { revisionData } = this.getLatestRevision(channel);
    if (revisionData) {
      version = revisionData.version;
    }

    if (version == DEFAULT_VERSION && this.version) {
      version = this.version;
    }

    return `${config.server.host}/icons/${this.id}/${this.id}-${version}${ext}`;
  });
}
