#!/bin/bash

VERSION=$1
ENV=${2:-""}
BASE=/srv/openstore-api$ENV

set -x
set -e

cd $BASE/$VERSION
npm install

echo -e "#!/bin/bash\nexport VERSION=$VERSION$ENV" > /srv/openstore$ENV/version.sh

# TODO clean up node_modules somehow

rm -f $BASE/current
ln -s $BASE/$VERSION $BASE/current

systemctl restart openstore-api$ENV

cd $BASE/
echo "Going to remove old versions"
ls -1t | grep -v current | tail -n +10
ls -1t | grep -v current | tail -n +10 | xargs -d '\n' -r rm -r --
