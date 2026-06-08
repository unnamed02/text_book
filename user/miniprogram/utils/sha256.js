/**
 * SHA-256 封装（基于 js-sha256 npm 包）
 * 与后端 sha256Plain 保持一致
 *
 * 使用前需要在微信开发者工具中执行「构建 npm」：
 *   工具 → 构建 npm
 */

const { sha256 } = require('js-sha256');

module.exports = { sha256 };
