const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const componentsRoot = path.join(root, 'components')

function collectComponentDirs(directory, directories = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory()) return
    const target = path.join(directory, entry.name)
    if (fs.existsSync(path.join(target, 'index.json'))) directories.push(target)
    else collectComponentDirs(target, directories)
  })
  return directories
}

const componentDirs = collectComponentDirs(componentsRoot).sort()
const componentNames = componentDirs
  .map((directory) => path.basename(directory))
  .sort()

assert(componentNames.length > 0)
assert.strictEqual(new Set(componentNames).size, componentNames.length, '组件目录名不能重复')
componentDirs.forEach((directory) => {
  const name = path.basename(directory)
  assert.match(name, /^yb-[a-z0-9]+(?:-[a-z0-9]+)*$/, `组件目录命名不规范：${name}`)
  const jsonPath = path.join(directory, 'index.json')
  assert.strictEqual(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).component, true, `不是组件：${name}`)
})

function walk(directory, files = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (['.git', '.codegraph', '.understand-anything', 'node_modules', 'miniprogram_npm'].includes(entry.name)) return
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target, files)
    else files.push(target)
  })
  return files
}

const files = walk(root)
files.filter((file) => file.endsWith('.json')).forEach((file) => {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  Object.entries(json.usingComponents || {}).forEach(([tag, target]) => {
    if (!target.startsWith('/components/')) return
    const componentName = path.posix.basename(path.posix.dirname(target))
    assert.strictEqual(tag, componentName, `${path.relative(root, file)} 注册名与目录不一致`)
    assert(componentNames.includes(componentName), `${path.relative(root, file)} 引用了不存在的组件 ${target}`)
    assert(fs.existsSync(`${root}${target}.json`), `${path.relative(root, file)} 引用了不存在的入口 ${target}`)
  })
})

const legacyTags = componentNames.map((name) => name.slice(3))
files.filter((file) => file.endsWith('.wxml')).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  legacyTags.forEach((tag) => {
    assert.doesNotMatch(source, new RegExp(`<\\/?${tag}(?=[\\s/>])`), `${path.relative(root, file)} 仍使用旧组件标签 ${tag}`)
  })
})

console.log('componentNaming: ok')
