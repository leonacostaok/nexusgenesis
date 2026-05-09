/**
 * NexusGenesis - Error Handler
 * 
 * 错误处理工具，提供统一的错误处理和日志记录
 */

// 错误类型
export const ERROR_TYPES = {
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  INTERNAL: 'internal_error',
  NETWORK: 'network_error'
};

// 错误状态码映射
const ERROR_STATUS_CODES = {
  [ERROR_TYPES.VALIDATION]: 400,
  [ERROR_TYPES.NOT_FOUND]: 404,
  [ERROR_TYPES.UNAUTHORIZED]: 401,
  [ERROR_TYPES.FORBIDDEN]: 403,
  [ERROR_TYPES.INTERNAL]: 500,
  [ERROR_TYPES.NETWORK]: 503
};

// 错误日志级别
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// 记录错误日志
function logError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    level: LOG_LEVELS.ERROR,
    error: {
      message: error.message,
      type: error.type || ERROR_TYPES.INTERNAL,
      stack: error.stack,
      details: error.details
    },
    context
  };
  
  console.error(JSON.stringify(logMessage, null, 2));
  
  // 这里可以添加更多的日志处理逻辑，例如写入文件或发送到日志服务
}

// 记录警告日志
function logWarn(message, context = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    level: LOG_LEVELS.WARN,
    message,
    context
  };
  
  console.warn(JSON.stringify(logMessage, null, 2));
}

// 记录信息日志
function logInfo(message, context = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    level: LOG_LEVELS.INFO,
    message,
    context
  };
  
  console.log(JSON.stringify(logMessage, null, 2));
}

// 创建错误对象
function createError(message, type = ERROR_TYPES.INTERNAL, details = {}) {
  const error = new Error(message);
  error.type = type;
  error.details = details;
  return error;
}

// 处理HTTP请求错误
function handleHttpError(res, error) {
  const statusCode = ERROR_STATUS_CODES[error.type] || 500;
  const response = {
    success: false,
    error: {
      message: error.message,
      type: error.type,
      details: error.details
    }
  };
  
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

// 错误恢复机制
function attemptRecovery(error, recoveryFn) {
  try {
    return recoveryFn();
  } catch (recoveryError) {
    logError(recoveryError, { originalError: error.message });
    throw error;
  }
}

// 统一的错误处理中间件
function errorHandlerMiddleware(req, res, next) {
  try {
    next();
  } catch (error) {
    logError(error, { request: { method: req.method, url: req.url } });
    handleHttpError(res, error);
  }
}

export {
  logError,
  logWarn,
  logInfo,
  createError,
  handleHttpError,
  attemptRecovery,
  errorHandlerMiddleware
};