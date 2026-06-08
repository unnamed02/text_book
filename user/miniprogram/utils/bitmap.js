/**
 * 位图工具（基于 BigInt，兼容微信小程序）
 * 用于处理学生选书的 bitmap 位运算
 */

function create(value = 0n) {
  return BigInt(value);
}

function isConfirmed(bitmap, index) {
  const b = BigInt(bitmap);
  return ((b >> BigInt(index)) & 1n) === 1n;
}

function setBit(bitmap, index) {
  const b = BigInt(bitmap);
  return b | (1n << BigInt(index));
}

function clearBit(bitmap, index) {
  const b = BigInt(bitmap);
  return b & ~(1n << BigInt(index));
}

function toggle(bitmap, index, confirmed) {
  return confirmed ? setBit(bitmap, index) : clearBit(bitmap, index);
}

function toString(bitmap) {
  return BigInt(bitmap).toString();
}

module.exports = {
  create,
  isConfirmed,
  setBit,
  clearBit,
  toggle,
  toString,
};
