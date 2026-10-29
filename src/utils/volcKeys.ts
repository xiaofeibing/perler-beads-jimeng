// 即梦(火山引擎) API 密钥的本地存储工具
// 密钥仅保存在用户浏览器 localStorage 中，不上传任何服务器

const STORAGE_KEY = 'perler.volcKeys.v1';

export interface VolcKeys {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * 从localStorage读取用户配置的即梦密钥
 */
export function loadVolcKeys(): VolcKeys | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<VolcKeys>;
      if (parsed?.accessKeyId && parsed?.secretAccessKey) {
        return {
          accessKeyId: parsed.accessKeyId.trim(),
          secretAccessKey: parsed.secretAccessKey.trim(),
        };
      }
    }
  } catch (error) {
    console.error('无法从本地存储加载即梦密钥:', error);
    localStorage.removeItem(STORAGE_KEY); // 清除无效数据
  }
  return null;
}

/**
 * 保存即梦密钥到localStorage
 */
export function saveVolcKeys(keys: VolcKeys): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch (error) {
    console.error('无法保存即梦密钥到本地存储:', error);
  }
}

/**
 * 清除已保存的即梦密钥
 */
export function clearVolcKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('无法清除即梦密钥:', error);
  }
}
