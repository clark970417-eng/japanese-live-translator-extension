const { app } = require('electron')
const path = require('node:path')
if (!process.env.JTL_UI_PROFILE || !path.isAbsolute(process.env.JTL_UI_PROFILE)) throw new Error('An isolated UI profile is required')
app.setPath('userData', process.env.JTL_UI_PROFILE)
process.env.JTL_UI_TEST = '1'
require(process.env.JTL_UI_BUILD || '../out/main/index.js')
