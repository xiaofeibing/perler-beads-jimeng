// AI图片优化工具函数

import { callVolcEngineAI } from '../lib/volcEngineClient';
import { loadVolcKeys } from './volcKeys';

const DEFAULT_PROMPT = '图片修改为：chibi画风，背景白底。pixel art style, 16-bit, retro game aesthetic, sharp focus, high contrast, clean lines, detailed pixel art, masterpiece, best quality';

export interface AIOptimizeOptions {
  customPrompt?: string;
  onProgress?: (progress: number) => void;
  // 用户在界面上输入的即梦密钥（优先级最高）
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface AIOptimizeResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * 压缩图片到指定尺寸
 */
function resizeImage(img: HTMLImageElement, maxWidth: number = 2048, maxHeight: number = 2048): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let width = img.width;
  let height = img.height;

  // 计算缩放比例
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 使用更好的图像质量
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

/**
 * 将Canvas转换为Base64格式，控制文件大小
 */
function canvasToBase64(canvas: HTMLCanvasElement, maxSizeKB: number = 4096): string {
  // 首先尝试PNG格式（无损）
  let base64 = canvas.toDataURL('image/png');
  let sizeKB = Math.round((base64.length * 3) / 4 / 1024);

  console.log('Original image size:', sizeKB, 'KB');

  // 如果PNG太大，尝试JPEG格式并调整质量
  if (sizeKB > maxSizeKB) {
    let quality = 0.9;
    while (sizeKB > maxSizeKB && quality > 0.3) {
      base64 = canvas.toDataURL('image/jpeg', quality);
      sizeKB = Math.round((base64.length * 3) / 4 / 1024);
      console.log(`JPEG quality ${quality}:`, sizeKB, 'KB');
      quality -= 0.1;
    }
  }

  // 如果还是太大，缩小尺寸
  if (sizeKB > maxSizeKB) {
    const scale = Math.sqrt(maxSizeKB / sizeKB) * 0.9;
    const newWidth = Math.floor(canvas.width * scale);
    const newHeight = Math.floor(canvas.height * scale);

    console.log(`Resizing to ${newWidth}x${newHeight}`);

    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    const newCtx = newCanvas.getContext('2d');

    if (!newCtx) {
      throw new Error('Failed to get canvas context');
    }

    newCtx.imageSmoothingEnabled = true;
    newCtx.imageSmoothingQuality = 'high';
    newCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

    return canvasToBase64(newCanvas, maxSizeKB);
  }

  console.log('Final image size:', sizeKB, 'KB');
  return base64;
}

/**
 * 将图片转换为Base64格式
 */
export function imageToBase64(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        console.log('Original image size:', img.width, 'x', img.height);

        // 压缩图片
        const canvas = resizeImage(img, 2048, 2048);

        // 转换为base64，控制大小在4MB以内
        const base64 = canvasToBase64(canvas, 4096);

        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageSrc;
  });
}

/**
 * 调用AI优化API
 */
export async function optimizeImageWithAI(
  imageSrc: string,
  options: AIOptimizeOptions = {}
): Promise<AIOptimizeResult> {
  try {
    const { customPrompt, onProgress } = options;

    // 密钥来源：界面输入 > localStorage 已保存的密钥
    const savedKeys = loadVolcKeys();
    const accessKeyId = (options.accessKeyId || savedKeys?.accessKeyId || '').trim();
    const secretAccessKey = (options.secretAccessKey || savedKeys?.secretAccessKey || '').trim();

    // 更新进度
    onProgress?.(10);

    // 将图片转换为base64
    const base64Image = await imageToBase64(imageSrc);

    const prompt = customPrompt || DEFAULT_PROMPT;

    // 情况一：用户提供了即梦密钥，浏览器直接调用火山引擎API（无需后端）
    if (accessKeyId && secretAccessKey) {
      onProgress?.(30);
      return await callVolcEngineAI(base64Image, prompt, accessKeyId, secretAccessKey, onProgress);
    }

    // 情况二：未配置密钥，走后端 /api/ai-optimize（Cloudflare Pages / Node 服务端部署）
    onProgress?.(30);

    const response = await fetch('/api/ai-optimize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageBase64: base64Image,
        prompt
      })
    });

    onProgress?.(80);

    if (!response.ok) {
      // 先读文本（响应流只能读一次），再尝试解析为JSON错误信息
      let errorMessage: string;
      try {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || `API request failed: ${response.status}`;
        } catch {
          errorMessage = errorText || `API request failed: ${response.status}`;
        }
      } catch {
        errorMessage = `API request failed: ${response.status}`;
      }
      // 本地开发时 /api/ai-optimize 不存在（404），提示用户配置密钥
      if (response.status === 404 || /no such api/i.test(errorMessage)) {
        throw new Error('NO_API_KEY: 当前环境没有可用的AI优化服务，请在上方填写即梦的 Access Key ID 和 Secret Access Key 后重试。');
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    onProgress?.(100);

    if (result.success && result.imageUrl) {
      return {
        success: true,
        imageUrl: result.imageUrl
      };
    } else {
      throw new Error(result.error || 'Unknown error');
    }

  } catch (error) {
    console.error('AI optimization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI optimization failed'
    };
  }
}

/**
 * 下载远程图片并转换为DataURL
 */
export async function downloadImageAsDataURL(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert image to data URL'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
