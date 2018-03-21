'use strict';

const config = require('../utils/config');

const fs = require('fs');
const bluebird = require('bluebird');
const path = require('path');
const jimp = require('jimp');
const B2 = require('backblaze-b2');
const chunks = require('buffer-chunks');
const crypto = require('crypto');

const SIZE_LIMIT = 5242880; // 5MB
bluebird.promisifyAll(fs);

let b2 = new B2({
    accountId: config.backblaze.accountId,
    applicationKey: config.backblaze.applicationKey,
});

async function uploadFile(filePath, fileName) {
    let stats = fs.statSync(filePath);
    if (stats.size > SIZE_LIMIT) {
        let fileData = await fs.readFileAsync(filePath);
        let fileChunks = chunks(fileData, SIZE_LIMIT);

        await b2.authorize();

        let largeFileData = await b2.startLargeFile({
            bucketId: config.backblaze.bucketId,
            fileName: fileName
        });
        let fileId = largeFileData.data.fileId;

        await Promise.all(fileChunks.map((data, index) => {
            return b2.getUploadPartUrl({fileId: fileId}).then((urlInfo) => {
                return b2.uploadPart({
                    partNumber: index + 1,
                    uploadUrl: urlInfo.data.uploadUrl,
                    uploadAuthToken: urlInfo.data.authorizationToken,
                    data: data,
                });
            })
        }))

        let uploadInfo = await b2.finishLargeFile({
            fileId: fileId,
            partSha1Array: fileChunks.map((data) => {
                let hash = crypto.createHash('sha1');
                hash.update(data);
                return hash.digest('hex');
            })
        });

        return config.backblaze.baseUrl + config.backblaze.bucketName + '/' + uploadInfo.data.fileName;
    }
    else {
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
}

function resize(iconPath) {
    return new Promise((resolve, reject) => {
        jimp.read(iconPath, (err, image) => {
            if (err) {
                reject(err);
            }
            else {
                image.resize(92, 92).write(iconPath, (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(iconPath);
                    }
                });
            }
        });
    });
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
            await resize(iconPath);
        }

        iconUrl = await uploadFile(iconPath, iconName);
    }

    return [packageUrl, iconUrl];
}


exports.uploadPackage = uploadPackage;
