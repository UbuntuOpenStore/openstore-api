/* eslint-disable no-param-reassign */

import { type Schema } from 'mongoose';
import path from 'path';

import { config } from 'utils';
import { DEFAULT_CHANNEL, type HydratedPackage, type IPackage, type IPackageMethods, type PackageModel } from './types';

const DEFAULT_VERSION = '0.0.0';

export function setupVirtuals(packageSchema: Schema<IPackage, PackageModel, IPackageMethods>) {
  packageSchema.virtual<HydratedPackage>('architecture').get(function (): string {
    return this.architectures.join(',');
  });

  packageSchema.virtual<HydratedPackage>('next_revision').get(function (): number {
    let revision = 0;
    const revisions = this.revisions.map((data) => data.revision);

    if (revisions.length > 0) {
      revision = Math.max(...revisions);
    }

    return revision + 1;
  });

  packageSchema.virtual<HydratedPackage>('icon_url').get(function (): string {
    if (!this.icon) {
      return `${config.server.host}/icons/404.png`;
    }

    let version = DEFAULT_VERSION;
    let channel = DEFAULT_CHANNEL;
    if (!this.channels.includes(channel) && this.channels.length > 0) {
      channel = this.channels[0];
    }

    const { revisionData } = this.getLatestRevision(channel);
    if (revisionData) {
      version = revisionData.version;
    }

    return `${config.server.host}/icons/${this.id as string}/${this.id as string}-${version}${path.extname(this.icon)}`;
  });
}
