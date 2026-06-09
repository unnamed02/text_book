import { sha256 } from 'js-sha256';

// 前端预哈希：与后端 sha256Plain 保持一致
export function hashSha256(text) {
  return sha256(text);
}
