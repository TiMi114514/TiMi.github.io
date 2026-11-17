'use strict';

/**
 * Filesystem compatibility shim.
 *
 * On exFAT (and some other non-NTFS volumes) `readlink()` on a regular file
 * resolves with EISDIR instead of EINVAL. Webpack and Next.js file tracing
 * call readlink() to detect symlinks and only tolerate EINVAL/ENOENT, so the
 * build crashes with "EISDIR: illegal operation on a directory, readlink ...".
 *
 * Treat EISDIR as "not a symlink" so builds work on portable drives.
 */

const fs = require('fs');

const { promises } = fs;

const originalPromiseReadlink = promises.readlink;
promises.readlink = async function readlinkPatched(target, options) {
  try {
    return await originalPromiseReadlink.call(promises, target, options);
  } catch (error) {
    if (error && error.code === 'EISDIR') return null;
    throw error;
  }
};

const originalReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function readlinkSyncPatched(target, options) {
  try {
    return originalReadlinkSync.call(fs, target, options);
  } catch (error) {
    if (error && error.code === 'EISDIR') return null;
    throw error;
  }
};

const originalReadlink = fs.readlink;
fs.readlink = function readlinkPatched(target, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  return originalReadlink.call(fs, target, options, (error, link) => {
    if (error && error.code === 'EISDIR') return callback(null, null);
    callback(error, link);
  });
};
