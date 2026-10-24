import eventBus, { ASSET_LIST_INVALIDATED, CHAT_SESSION_RESET } from '../static_utils/eventBus'
import { callHttp } from './http'
function callUserFunction(data = {}) {
  return callHttp('/user', data).then(({ result }) => ({ result }))
}

async function callStorageFunction(data, fallbackMessage = "文件上传失败") {
  let response;
  try { response = await callUserFunction(data); }
  finally {
    if (['prepareStorageUpload', 'completeStorageUpload', 'cancelStorageUpload', 'deleteCloudFile', 'cleanupStorageFiles', 'renameCreatedImage', 'renameStorageFile', 'setStorageFileFavorite'].includes(data.funName)) {
      eventBus.emit(ASSET_LIST_INVALIDATED, { source: 'library' });
      eventBus.emit(ASSET_LIST_INVALIDATED, { source: 'mine' });
    }
  }
  const result = response && response.result;
  if (!result || result.code !== 200) {
    const error = new Error(result?.msg || fallbackMessage);
    error.errorCode = result?.data?.errorCode || "STORAGE_REQUEST_FAILED";
    throw error;
  }
  return result.data;
}

export function getUser(params = {}) {
  return callUserFunction(Object.assign({}, params, { funName: "getUser" }));
}

export function loginByPhoneCode(code) {
  return callUserFunction({
    funName: "loginByPhoneCode",
    code
  });
}

export function updateProfile(profile) {
  return callUserFunction(Object.assign({}, profile, { funName: "updateProfile" }));
}

export async function deleteCloudFile(fileID) {
  const result = await callStorageFunction({
    funName: "deleteCloudFile",
    fileID
  }, "文件删除失败");
  if (!result?.fileList?.length || result.fileList.some(file => file.status !== 0)) throw new Error('文件删除失败');
  return result;
}

export function renameCreatedImage(id, name) {
  return callStorageFunction({ funName: 'renameCreatedImage', id, name }, '重命名失败');
}

export function renameStorageFile(id, name) {
  return callStorageFunction({ funName: 'renameStorageFile', id, name }, '重命名失败');
}

export function setStorageFileFavorite(id, favorite) {
  return callStorageFunction({ funName: 'setStorageFileFavorite', id, favorite }, '收藏操作失败');
}

export function getStorageUsage() {
  return callStorageFunction({ funName: "getStorageUsage" });
}

export function listStorageFiles({ category = 'all', query = '', origin = '', cursor = '', limit = 20, cacheOwnerKey, ifUpdateTime } = {}) {
  return callStorageFunction({ funName: "listStorageFiles", category, query, origin, cursor, limit, cacheOwnerKey, ifUpdateTime }, "文件列表加载失败");
}

export function listCreatedImages({ query = '', cursor = '', limit = 20, cacheOwnerKey, ifUpdateTime } = {}) {
  return callStorageFunction({ funName: "listCreatedImages", query, cursor, limit, cacheOwnerKey, ifUpdateTime }, "作品列表加载失败");
}

export function listCreateTemplates({ category = 'templates', query = '', cursor = '', limit = 20, cacheOwnerKey, ifUpdateTime } = {}) {
  return callStorageFunction({ funName: 'listCreateTemplates', category, query, cursor, limit, cacheOwnerKey, ifUpdateTime }, '模版加载失败');
}

export function getAssetIdentity() {
  return callStorageFunction({ funName: 'getAssetIdentity' }, '身份确认失败');
}

export function resolveAssetUrls({ source, ids }) {
  return callStorageFunction({ funName: 'resolveAssetUrls', source, ids }, '文件地址获取失败');
}

export async function downloadStorageFile(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('文件地址无效');
  return new Promise((resolve, reject) => wx.downloadFile({
    url,
    success: result => {
      if (result.statusCode !== 200 || !result.tempFilePath) { reject(new Error('文件下载失败')); return; }
      resolve(result.tempFilePath);
    },
    fail: reject
  }));
}

export async function downloadCreationImage(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('图片地址无效');
  return new Promise((resolve, reject) => wx.downloadFile({
    url,
    success: result => {
      if (result.statusCode !== 200 || !result.tempFilePath) { reject(new Error('图片下载失败')); return; }
      resolve(result.tempFilePath);
    },
    fail: reject
  }));
}

export function cleanupStorageFiles(bytesNeeded) {
  return callStorageFunction({ funName: "cleanupStorageFiles", bytesNeeded });
}

function resolveFileExt(filePath, fileName, fallback = "dat") {
  const source = `${fileName || ""} ${filePath || ""}`;
  const match = source.match(/\.([a-zA-Z0-9]+)(?:\?|$|\s)/);
  return match ? match[1].toLowerCase() : fallback;
}

function normalizeUploadDir(dir = "uploads/file") {
  return String(dir).replace(/^\/+|\/+$/g, "") || "uploads/file";
}

function getLocalFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({
      path: filePath,
      success: ({ stats }) => resolve(stats.size),
      fail: reject
    });
  });
}

const UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const UPLOAD_BUSY_WAIT_MS = 3 * 60 * 1000;
let uploadQueue = Promise.resolve();
let uploadEpoch = 0;
eventBus.on(CHAT_SESSION_RESET, ({ reason } = {}) => { if (reason !== 'new-chat') uploadEpoch += 1; });

async function prepareUpload(files, epoch) {
  const deadline = Date.now() + UPLOAD_BUSY_WAIT_MS;
  while (true) {
    if (epoch !== uploadEpoch) throw new Error("账号已切换，请重新选择附件");
    try {
      return await callStorageFunction({ funName: "prepareStorageUpload",
        uploadTimeoutSeconds: UPLOAD_TIMEOUT_MS / 1000, files });
    } catch (error) {
      if (error.errorCode !== 'STORAGE_BUSY' || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

function uploadFileWithTimeout(file, upload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let task;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      try { task?.abort?.(); } catch (_) {}
      finish(reject)(new Error("文件上传超时，请重试"));
    }, UPLOAD_TIMEOUT_MS);
    try {
      if (!upload?.uploadUrl?.startsWith('https://') || !upload.objectKey || !upload.formData) {
        throw new Error('上传凭证无效');
      }
      task = wx.uploadFile({ url: upload.uploadUrl, name: 'file', filePath: file.filePath,
        formData: upload.formData,
        success: result => {
          if (result.statusCode !== 200) { finish(reject)(new Error('文件上传失败')); return; }
          finish(resolve)({ fileID: upload.objectKey });
        }, fail: finish(reject) });
    } catch (error) { finish(reject)(error); }
  });
}

export function uploadCloudFiles(files = []) {
  const epoch = uploadEpoch;
  const pending = uploadQueue.then(() => {
    if (epoch !== uploadEpoch) throw new Error("账号已切换，请重新选择附件");
    return performUploadCloudFiles(files, epoch);
  });
  uploadQueue = pending.catch(() => {});
  return pending;
}

async function performUploadCloudFiles(files, epoch) {
  if (!files.length || files.length > 9) throw new Error("附件数量不合法");
  const normalized = await Promise.all(files.map(async ({ filePath, fileName = "", dir = "uploads/file", ext = "", fallbackExt = "dat", size = 0, mimeType = "" }) => {
    if (!filePath) throw new Error("缺少上传文件路径");
    return {
      filePath,
      dir: normalizeUploadDir(dir),
      name: fileName,
      extension: ext || resolveFileExt(filePath, fileName, fallbackExt),
      mimeType,
      size: Number(size) > 0 ? Number(size) : await getLocalFileSize(filePath)
    };
  }));
  const prepared = await prepareUpload(normalized.map(({ dir, name, extension, mimeType, size }) =>
    ({ dir, name, extension, mimeType, size })), epoch);
  let uploaded = [];
  try {
    const uploadResults = await Promise.allSettled(normalized.map((file, index) =>
      uploadFileWithTimeout(file, prepared.uploads[index])));
    uploaded = uploadResults.map((result) => result.status === "fulfilled" ? result.value : null);
    const failed = uploadResults.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    const fileIDs = uploaded.map((file) => file.fileID);
    let completed;
    try {
      completed = await callStorageFunction({
        funName: "completeStorageUpload",
        uploadToken: prepared.uploadToken,
        fileIDs
      });
    } catch (error) {
      if (error.errorCode !== "STORAGE_REQUEST_FAILED") throw error;
      completed = await callStorageFunction({
        funName: "completeStorageUpload",
        uploadToken: prepared.uploadToken,
        fileIDs
      });
    }
    if (completed.evictedFileIDs?.length) {
      eventBus.emit(ASSET_LIST_INVALIDATED, { source: 'library', evictedFileIDs: completed.evictedFileIDs });
    }
    return uploaded.map((file, index) => Object.assign({}, file, {
      size: completed.files[index].size,
      assetId: completed.files[index].id || completed.files[index].assetId || ''
    }));
  } catch (error) {
    const cancelled = await callStorageFunction({
      funName: "cancelStorageUpload",
      uploadToken: prepared.uploadToken,
      fileIDs: uploaded.map((file) => file?.fileID || "")
    }).catch(() => null);
    if (cancelled?.completed) return uploaded.map((file, index) => Object.assign({}, file, {
      size: cancelled.files[index].size,
      assetId: cancelled.files[index].id || cancelled.files[index].assetId || ''
    }));
    throw error;
  }
}

export async function uploadUserAvatar(filePath, userId) {
  if (!filePath) throw new Error("缺少上传文件路径");
  if (!userId) throw new Error("缺少用户身份");
  const prepared = await callStorageFunction({ funName: 'prepareAvatarUpload',
    extension: resolveFileExt(filePath, '', 'jpg'), size: await getLocalFileSize(filePath) });
  try {
    return await uploadFileWithTimeout({ filePath }, prepared.upload);
  } catch (error) {
    await deleteCloudFile(prepared.upload.objectKey).catch(() => {});
    throw error;
  }
}

export function logout() {
  return callUserFunction({ funName: "logout" });
}

export function getSettings() {
  return callUserFunction({ funName: "getSettings" });
}

export function saveSettingsDomain(domain, changes) {
  return callUserFunction({
    funName: "saveSettingsDomain",
    domain,
    changes
  });
}
