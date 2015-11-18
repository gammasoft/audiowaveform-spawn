var express = require('express'),
    Multiparty = require('connect-multiparty'),
    async = require('async'),

    path = require('path'),
    fs = require('fs'),
    childProcess = require('child_process'),

    spawn = childProcess.spawn,
    exec = childProcess.exec,
    app = express();

function cleanupFile(path, cb) {
    cb();
}

function generateDatFile(audioFilePath) {
    return function(cb) {
        var datFilePath = audioFilePath
                            .replace('.mp3', '.dat')
                            .replace('.wav', '.dat');

        spawn('audiowaveform', [
            '-i', audioFilePath,
            '-o', datFilePath
        ]).on('close', function(err) {
            if(err) {
                return cb(err);
            }

            cb(null, audioFilePath, datFilePath);
        });
    }
}

function getAudioDuration(audioFilePath, datFilePath, cb) {
    var command = [
        'ffprobe',
        audioFilePath,
        '-show_entries', 'format=duration',
        '-v', 'quiet',
        '-of', 'csv="p=0"'
    ].join(' ');

    exec(command, function(err, stdout, stderr) {
        if(err) {
            return cb(err);
        }

        var duration = parseFloat(stdout);
        duration = Math.ceil(duration);

        cb(null, datFilePath, duration);
    });
}

function generatePngFile(datFilePath, duration, cb) {
    var pngFilePath = datFilePath
                        .replace('.dat', '.png');

    spawn('audiowaveform', [
        '-i', datFilePath,
        '-o', pngFilePath,
        '-e', duration,
        '-w', '1000',
        '-h', '200'
    ]).on('close', function(err) {
        if(err) {
            return cb(err);
        }

        cb(null, pngFilePath);
    });
}

function uploadToAmazon(remoteFileName) {
    return function(pngFilePath, cb) {
        var command = [
            'aws s3api put-object --bucket pedreira-rio-verde',
            '--key "' + remoteFileName + '" --body ' + pngFilePath,
            '--content-type "image/png"',
            '--metadata \'{"Content-Type":"image/png"}\''
        ].join(' ');

        exec(command, function(err, stdout, stderr) {
            if(err) {
                return cb(err);
            }

            cb(null);
        });
    }
}

app.post('/', Multiparty(), function(req, res, next) {
    var remoteFileName = req.body.remoteFileName,
        file = req.files.audio,
        audioFilePath = file.path;

    async.waterfall([
        generateDatFile(audioFilePath),
        getAudioDuration,
        generatePngFile,
        uploadToAmazon(remoteFileName)
    ], function(err) {
        if(err) {
            return next(err);
        }

        res.end();
    });
});

app.listen(7777);
