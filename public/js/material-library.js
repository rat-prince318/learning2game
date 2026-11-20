import { readLocal, saveLocal } from './utils.js';

const key = 'learning2game-upload-library-v1';

export function savedMaterials() {
  const saved = readLocal(key);
  return Array.isArray(saved) ? saved : [];
}

export function rememberMaterial(receipt, fileName) {
  const { material_id: id, mode, delete_token: token } = receipt || {};
  if (!id || !mode || !token) return;
  const other = savedMaterials().filter((item) => item.id !== id || item.mode !== mode);
  saveLocal(key, [...other, { id, token, label: fileName, mode }]);
}

export function forgetMaterial(id, mode) {
  saveLocal(
    key,
    savedMaterials().filter((item) => item.id !== id || item.mode !== mode),
  );
}
