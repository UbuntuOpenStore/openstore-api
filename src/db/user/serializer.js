function toJson(user) {
    return {
        /* eslint-disable no-underscore-dangle */
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role ? user.role : 'community',
        username: user.username,
    };
}

function serialize(users) {
    if (Array.isArray(users)) {
        return users.map(toJson);
    }
    else {
        return toJson(users);
    }
}

exports.serialize = serialize
