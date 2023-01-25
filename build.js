const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('fs')
const { join } = require('path')

// GAMBIARRA HUEBR

const HTML_PATH = join(__dirname, 'src/index.html')
const ASSETS_PATH = join(__dirname, 'src/assets')
const VUE_SCRIPT_NAME = 'vue.global.js'
const VUE_PROD_SCRIPT_NAME = 'vue.global.prod.js'
const BULMA_CSS_NAME = 'bulma.min.css'
const OUTPUT_FOLDER = join(__dirname, 'dist')
const OUTPUT_HTML_PATH = join(OUTPUT_FOLDER, 'nip06-standalone.html')

function build() {
  const { lines: htmlLines } = getFileLines({ filePath: HTML_PATH })
  const { htmlLines: htmlLines2 } = replaceInline({
    htmlLines,
    scriptName: VUE_SCRIPT_NAME,
    assetName: VUE_PROD_SCRIPT_NAME,
    inlineVersion: '<script>CONTENT</script>'
  })
  const { htmlLines: htmlLines3 } = replaceInline({
    htmlLines: htmlLines2,
    scriptName: BULMA_CSS_NAME,
    inlineVersion: '<style>CONTENT</style>'
  })
  const { htmlLines: htmlLines4 } = replaceInline({
    htmlLines: htmlLines3,
    scriptName: 'nostr-tools.js',
    inlineVersion: '<script>CONTENT</script>'
  })
  if(existsSync(OUTPUT_FOLDER)) {
    rmSync(OUTPUT_FOLDER, { recursive: true, force: true })
  }
  mkdirSync(OUTPUT_FOLDER)
  writeFileSync(OUTPUT_HTML_PATH, htmlLines4.join('\n'))
}

function replaceInline({ htmlLines, scriptName, assetName, inlineVersion }) {
  const scriptLine = htmlLines.findIndex((line) => line.includes(scriptName))
  const fileName = assetName ? assetName : scriptName
  const filePath = join(ASSETS_PATH, fileName)
  const { data: scriptContent } = getFileData({ filePath })
  const inlineContent = `${inlineVersion}`.replace('CONTENT', scriptContent)
  htmlLines.splice(scriptLine+1, 0, inlineContent)
  htmlLines.splice(scriptLine, 1)
  return {
    htmlLines
  }
}

function getFileLines({ filePath }) {
  const { data } = getFileData({ filePath })
  const lines = data.split('\n')
  return { lines }
}

function getFileData({ filePath }) {
  try {
    const data = readFileSync(filePath, 'utf-8')
    return { data }
  } catch (error) {
    console.error(error)
    console.error(`unable to read file: ${filePath}`)
    process.exit(1)
  }
}

build()
