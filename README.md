# OpenStore Api

Api for the [OpenStore](https://open-store.io/).

## Reporting Bugs

Please report any bugs/features/requests in our [bug tracker](https://gitlab.com/theopenstore/openstore-meta/issues).

## Development

To get setup with development, checkout the
[openstore-web-dev repo](https://gitlab.com/theopenstore/openstore-web-dev).

## Configuration

By default there are no credentials stored for the GitHub login or GitLab login.
In order to use either GitHub or GitLab login you need to create a config.json
file in `api/utils/` like this:

```
{
    "GITHUB_CLIENT_ID": "INSERT_ID",
    "GITHUB_CLIENT_SECRET": "INSERT_SECRET",
    "GITLAB_CLIENT_ID": "INSERT_ID",
    "GITLAB_CLIENT_SECRET": "INSERT_SECRET",
}
```

* [Create a GitHub OAuth App](https://developer.github.com/apps/building-integrations/setting-up-and-registering-oauth-apps/)

## Contributors

* [Brian Douglass](http://bhdouglass.com/)
* [Michael Zanetti](http://notyetthere.org/)
* [Marius Gripsgård](http://mariogrip.com/)
* [Michał Prędotka](http://mivoligo.com/)
* Joan CiberSheep

## License

Copyright (C) 2020 [Brian Douglass](http://bhdouglass.com/)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License version 3, as published
by the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranties of MERCHANTABILITY, SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.
