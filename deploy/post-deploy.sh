#!/bin/bash

VERSION=$1
ENV=${2:-""}

set -x
set -e

cd /srv/openstore-api$ENV/$VERSION
npm install

echo -e "#!/bin/bash\nexport VERSION=$VERSION$ENV" > /srv/openstore$ENV/version.sh

rm -f /srv/openstore-api$ENV/current
ln -s /srv/openstore-api$ENV/$VERSION /srv/openstore-api$ENV/current

systemctl restart openstore-api$ENV

cd /srv/openstore-api$ENV/
echo "Going to remove old versions"
ls -1t | grep -v current | tail -n +10
ls -1t | grep -v current | tail -n +10 | xargs -d '\n' -r rm -r --
