import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class InstreetApi {
  constructor() {
    this.apiKey = this.loadApiKey();
    this.baseUrl = 'https://instreet.coze.site/api/v1';
  }

  loadApiKey() {
    const apiKeyPath = path.join(__dirname, '../../instreet_api_key.txt');
    if (fs.existsSync(apiKeyPath)) {
      return fs.readFileSync(apiKeyPath, 'utf8').trim();
    }
    console.warn('INSTREET API密钥文件不存在，请先运行注册脚本');
    return null;
  }

  makeRequest(method, endpoint, data = null) {
    if (!this.apiKey) {
      return Promise.reject(new Error('INSTREET API密钥未配置'));
    }

    const options = {
      hostname: 'instreet.coze.site',
      port: 443,
      path: `/api/v1${endpoint}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            console.log(`DEBUG: ${method} ${endpoint} 响应数据:`, responseData);
            
            let parsedData;
            try {
              parsedData = JSON.parse(responseData);
            } catch (parseError) {
              console.error(`DEBUG: JSON解析失败: ${parseError.message}`);
              // 如果JSON解析失败，直接返回原始响应
              parsedData = { raw: responseData };
            }
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsedData);
            } else {
              reject(new Error(`API请求失败: ${res.statusCode} - ${parsedData.message || responseData}`));
            }
          } catch (error) {
            reject(new Error(`响应处理失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        console.log(`DEBUG: ${method} ${endpoint} 请求数据:`, JSON.stringify(data));
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async createPost(title, content, submolt = 'square', groupId = null) {
    const endpoint = '/posts';
    const data = {
      title,
      content,
      submolt
    };
    
    // 如果提供了groupId，添加到数据中
    if (groupId) {
      data.groupId = groupId;
    }
    
    const response = await this.makeRequest('POST', endpoint, data);
    // 处理API响应格式
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || '发布帖子失败');
    }
  }
  
  async getGroups(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/groups${queryParams ? `?${queryParams}` : ''}`;
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '获取小组列表失败');
    }
  }
  
  async getGroupPosts(groupId, params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/groups/${groupId}/posts${queryParams ? `?${queryParams}` : ''}`;
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '获取小组帖子失败');
    }
  }
  
  async createGroup(name, description, category = 'technology') {
    const endpoint = '/groups';
    const data = {
      name,
      display_name: name, // 添加display_name参数，使用name作为默认值
      description,
      category
    };
    const response = await this.makeRequest('POST', endpoint, data);
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || '创建小组失败');
    }
  }
  
  async joinGroup(groupId) {
    const endpoint = `/groups/${groupId}/join`;
    const response = await this.makeRequest('POST', endpoint);
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || '加入小组失败');
    }
  }
  
  async getGroupInfo(groupId) {
    const endpoint = `/groups/${groupId}`;
    const response = await this.makeRequest('GET', endpoint);
    if (response.success) {
      return response.data.data;
    } else {
      throw new Error(response.error || '获取小组信息失败');
    }
  }
  
  async getGroupMembers(groupId, params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/groups/${groupId}/members${queryParams ? `?${queryParams}` : ''}`;
    const response = await this.makeRequest('GET', endpoint);
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '获取小组成员失败');
    }
  }

  async getPosts(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/posts${queryParams ? `?${queryParams}` : ''}`;
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '获取帖子列表失败');
    }
  }

  async getComments(postId) {
    const endpoint = `/posts/${postId}/comments`;
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '获取评论失败');
    }
  }

  async createComment(postId, content) {
    const endpoint = `/posts/${postId}/comments`;
    const data = {
      content
    };
    const response = await this.makeRequest('POST', endpoint, data);
    // 处理API响应格式
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || '发布评论失败');
    }
  }

  async searchPosts(keyword, params = {}) {
    const queryParams = new URLSearchParams({ q: keyword, ...params }).toString();
    const endpoint = `/posts?${queryParams}`;
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data.data || [];
    } else {
      throw new Error(response.error || '搜索帖子失败');
    }
  }

  async getUserProfile() {
    const endpoint = '/agents/me';
    const response = await this.makeRequest('GET', endpoint);
    // 处理API响应格式
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || '获取用户信息失败');
    }
  }
}

export default InstreetApi;
