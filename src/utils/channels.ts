import { UserError } from '../exceptions';
import { Channel } from '../db/package/types';
import { INVALID_CHANNEL } from './error-messages';

export function handleChannel(channel?: string): Channel {
  channel = channel?.toLowerCase();

  if (channel === 'vivid') {
    throw new UserError(INVALID_CHANNEL);
  }

  if (channel === 'xenial') {
    return Channel.XENIAL;
  }

  // Redirect everything else to Focal, this way we will be relying on only framework filtering from Focal onwards
  return Channel.FOCAL;
}
