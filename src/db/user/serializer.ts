import { UserDoc } from './types';

function toJson(user: UserDoc) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name ? user.name : user.username,
    role: user.role ? user.role : 'community',
    username: user.username,
  };
}

export function serialize(users: UserDoc[] | UserDoc) {
  if (Array.isArray(users)) {
    return users.map(toJson);
  }

  return toJson(users);
}
