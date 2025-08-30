// src/config.js

/**
 * 配置文件，用于存放项目相关的常量、API Key等
 * 注意：API Key 不要直接暴露在前端生产环境，建议使用环境变量或后端代理
 */

const config = {
  // 示例：第三方接口的API Key（仅示范，生产请用环境变量管理）
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY || '',

  // 其他配置，例如接口地址
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://api.example.com',

  // 录音相关配置
  AUDIO_FORMAT: 'wav',

  // 其他自定义配置
  MAX_TRANSCRIPT_LENGTH: 5000,
};

export default config;
