#!/bin/bash

VERSION=$1

set -x
set -e

cd /srv/openstore-api/$VERSION
npm install

echo -e "#!/bin/bash\nexport VERSION=$VERSION" > /srv/openstore/version.sh

rm /srv/openstore-api/current
ln -s /srv/openstore-api/$VERSION /srv/openstore-api/current

systemctl restart openstore-api

echo "Going to remove old versions"
ls -1t | grep -v current | tail -n +10
ls -1t | grep -v current | tail -n +10 | xargs -d '\n' -r rm -r --
