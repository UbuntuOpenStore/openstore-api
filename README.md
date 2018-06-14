# OpenStore Web

Web viewer and api for the [OpenStore](https://open-store.io/).

## Reporting Bugs

Please report any bugs/features/requests in our [bug tracker](https://github.com/UbuntuOpenStore/openstore-meta/issues).

## Development

To get setup with development, checkout the
[openstore-web-dev repo](https://github.com/UbuntuOpenStore/openstore-web-dev).

## Configuration

By default there are no credentials stored for the GitHub login or Backblaze B2 upload.
Backblaze B2 is used to store clicks, it must be enabled for proper functionality.
Once you've created your Backblaze account, create a B2 bucket.
In order to use either GitHub login or GitLab or Backblaze B2 upload you need to
create a config.json file in `api/utils/` like this:

```
{
    "GITHUB_CLIENT_ID": "INSERT_ID",
    "GITHUB_CLIENT_SECRET": "INSERT_SECRET",
    "GITLAB_CLIENT_ID": "INSERT_ID",
    "GITLAB_CLIENT_SECRET": "INSERT_SECRET",
    "BACKBLAZE_ACCOUNT_ID": "INSERT_ID",
    "BACKBLAZE_APP_KEY": "INSERT_KEY",
    "BACKBLAZE_BUCKET_ID": "INSERT_ID",
    "BACKBLAZE_BUCKET_NAME": "openstore-local",
}
```

* [Sign up for a Backblaze account](https://www.backblaze.com/b2/sign-up.html)
* [Create a GitHub OAuth App](https://developer.github.com/apps/building-integrations/setting-up-and-registering-oauth-apps/)

## Contributors

* [Brian Douglass](http://bhdouglass.com/)
* [Michael Zanetti](http://notyetthere.org/)
* [Marius Gripsgård](http://mariogrip.com/)
* [Michał Prędotka](http://mivoligo.com/)
* Joan CiberSheep

## License

Copyright (C) 2017 [Brian Douglass](http://bhdouglass.com/)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License version 3, as published
by the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranties of MERCHANTABILITY, SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.
