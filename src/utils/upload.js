const config = require('../utils/config');
const fs = require('fs');
const bluebird = require('bluebird');
const path = require('path');
const jimp = require('jimp');
const B2 = require('backblaze-b2');

bluebird.promisifyAll(fs);

let b2 = new B2({
    accountId: config.backblaze.accountId,
    applicationKey: config.backblaze.applicationKey,
});

async function uploadFile(filePath, fileName) {
    await b2.authorize();

    let urlInfo = await b2.getUploadUrl(config.backblaze.bucketId);
    let uploadInfo = await b2.uploadFile({
        uploadUrl: urlInfo.data.uploadUrl,
        uploadAuthToken: urlInfo.data.authorizationToken,
        filename: fileName,
        data: await fs.readFileAsync(filePath),
    });

    return config.backblaze.baseUrl + config.backblaze.bucketName + '/' + uploadInfo.data.fileName;
}

async function uploadPackage(pkg, packagePath, iconPath) {
    let ext = '.click';
    if (pkg.types.indexOf('snappy') >= 0) {
        ext = '.snap';
    }
    let packageName = `packages/${pkg.id}_${pkg.version}_${pkg.architecture}${ext}`;

    let packageUrl = await uploadFile(packagePath, packageName);

    let iconUrl = '';
    if (iconPath) {
        let iconName = `icons/${pkg.id}${path.extname(iconPath)}`;
        if (path.extname(iconPath) == '.png') {
            jimp.read(iconPath, async (err, image) => {
                if (err) {
                    throw err;
                }
                else {
                    image.resize(92, 92).write(iconPath, async (err) => {
                        if (err) {
                            throw err;
                        }
                        else {
                            iconUrl = await uploadFile(iconPath, iconName);
                        }
                    });
                }
            });
        }
        else {
            iconUrl = await uploadFile(iconPath, iconName);
        }
    }

    return [packageUrl, iconUrl];
}


exports.uploadPackage = uploadPackage;
