const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const page = fs.readFileSync('pages/setting/index.js', 'utf8')
const template = fs.readFileSync('pages/setting/index.wxml', 'utf8')
const styles = fs.readFileSync('pages/setting/index.wxss', 'utf8')

assert.match(styles, /@import '\/static_wxss\/skeleton\.wxss';/)
assert.equal((template.match(/class="login-avatar-loading\b[^\"]*skeleton-clip\b[^\"]*"/g) || []).length, 2)
assert.equal((template.match(/class="skeleton-shimmer\b[^\"]*"/g) || []).length, 2)
assert.equal((template.match(/bind:load="handleAvatarLoad" bind:error="handleAvatarError"/g) || []).length, 2)
assert.match(template, /wx:if="\{\{!avatarLoaded && !avatarLoadFailed\}\}"/)
assert.match(page, /avatarSource: ''[\s\S]*avatarLoaded: false[\s\S]*avatarLoadFailed: false/)
assert.match(page, /syncAvatarLoading\(\)[\s\S]*this\.data\.user\?\.avatarUrl/)
assert.match(page, /handleAvatarLoad\(e\)[\s\S]*dataset\.src !== this\.data\.avatarSource/)
assert.match(page, /handleAvatarError\(e\)[\s\S]*avatarLoadFailed: true/)

console.log('settingAvatarLoading: shared shimmer and stale image event guards passed')

async function checkProfile() {
  let definition, uploadFails = false, submitted, saved, closed = 0
  const notices = []
  const profileSource = fs.readFileSync('pages/profilePage/index.js', 'utf8')
    .replace(/^import .*$/gm, '')
  const sandbox = {
    require: () => ({ messages: () => ({}) }),
    getApp: () => ({}),
    Page: value => { definition = value },
    buildUserFromAccountSummary: user => ({ ...user }),
    uploadUserAvatar: async () => {
      if (uploadFails) throw Error('upload failed')
      return { fileID: 'uploaded-key' }
    },
    updateProfile: async value => {
      submitted = value
      return { result: { code: 200, data: { user: { login: true, userId: 'real-user',
        avatarFileID: 'server-key', avatarUrl: 'https://example.test/signed-avatar' } } } }
    },
    wx: { worklet: {}, showLoading() {}, hideLoading() {},
      showToast: value => notices.push(value.title), navigateBack: () => { closed++ } }
  }
  vm.runInNewContext(profileSource, sandbox)
  const buildForm = vm.runInNewContext('buildForm', sandbox)
  for (const name of ['欢迎您', '登录', '已登录', '138****8000']) {
    const form = buildForm({ userName: name, nickName: name })
    assert.equal(form.userName, name, 'real names must not be interpreted as old placeholders')
    assert.equal(form.nickName, name)
    assert.equal(form.avatarUrl, '', 'the display Logo must not become an uploaded profile avatar')
  }
  const instance = { ...definition, data: { user: { userId: 'real-user', obsolete: true },
    form: buildForm(), i18n: { profile: { required: 'required' }, common: {} } },
    setUser: user => { saved = user } }
  await instance.saveProfile()
  assert.equal(notices.at(-1), 'required')
  assert.equal(submitted, undefined)
  instance.data.form = { userName: '欢迎您', nickName: '登录', avatarUrl: 'wxfile://new-avatar', avatarFileID: '' }
  await instance.saveProfile()
  assert.equal(submitted.avatarFileID, 'uploaded-key')
  assert.equal(saved.avatarFileID, 'server-key', 'the server profile owns the saved avatar identity')
  assert.equal(saved.obsolete, undefined)
  assert.equal(closed, 1)
  saved = undefined
  uploadFails = true
  await instance.saveProfile()
  assert.equal(saved, undefined)
  assert.equal(closed, 1)
  assert.equal(notices.at(-1), 'upload failed')
  assert.match(fs.readFileSync('pages/profilePage/index.wxml', 'utf8'), /form.avatarUrl \|\| '\/static\/logs\/glog.png'/)
  console.log('profile: real names, empty form, server avatar and upload failure passed')
}
checkProfile().catch(error => { console.error(error); process.exitCode = 1 })
